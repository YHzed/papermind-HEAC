import asyncio
import json
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from .config_manager import load_config, save_config, get_templates, get_workflows, mask_key, get_api_key
from .ocr_service import process_pdf_stream
from .md_parser import process_markdown_stream
from .llm_service import run_llm_task_stream
from .chat_service import (
    list_sessions, create_session, delete_session,
    load_session_messages, delete_session_message,
    chat_stream,
)
from .workflow_service import (
    list_workflow_runs, get_workflow_run, delete_workflow_run,
    execute_workflow_stream,
)

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
ARTICLES_DIR = DATA_DIR / "articles"

for d in [UPLOADS_DIR, ARTICLES_DIR]:
    d.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="PaperMind")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# ---------- Config ----------

@app.get("/api/config")
def get_config():
    config = load_config()
    masked = dict(config)
    masked["api_keys"] = {
        k: mask_key(get_api_key(k)) for k in ("mistral", "openai")
    }
    if "workflows" not in masked:
        masked["workflows"] = []
    return masked


class ConfigUpdate(BaseModel):
    api_keys: dict | None = None
    llm: dict | None = None
    system_prompt: str | None = None
    templates: list | None = None
    workflows: list | None = None


@app.put("/api/config")
def update_config(body: ConfigUpdate):
    config = load_config()
    if body.api_keys is not None:
        if "api_keys" not in config:
            config["api_keys"] = {}
        for k, v in body.api_keys.items():
            if v and "*" not in v:
                config["api_keys"][k] = v
    if body.llm is not None:
        config["llm"] = body.llm
    if body.system_prompt is not None:
        config["system_prompt"] = body.system_prompt
    if body.templates is not None:
        config["templates"] = body.templates
    if body.workflows is not None:
        config["workflows"] = body.workflows
    save_config(config)
    return {"ok": True}


# ---------- Upload (SSE) ----------

@app.post("/api/upload")
async def upload_file(file: UploadFile):
    if not file.filename:
        raise HTTPException(400, "文件名为空")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".md", ".pdf"):
        raise HTTPException(400, "仅支持 .md 和 .pdf 文件")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    stem = Path(file.filename).stem
    article_id = f"{timestamp}_{stem}"

    upload_path = UPLOADS_DIR / file.filename
    content = await file.read()
    upload_path.write_bytes(content)

    article_dir = ARTICLES_DIR / article_id
    article_dir.mkdir(parents=True, exist_ok=True)

    meta = {
        "id": article_id,
        "original_name": file.filename,
        "created_at": datetime.now().isoformat(),
        "status": "parsing",
        "template_used": None,
        "error_message": None,
    }
    _save_meta(article_dir, meta)

    async def event_stream():
        yield _sse("log", {"level": "info", "message": f"文件已接收: {file.filename}"})
        yield _sse("log", {"level": "info", "message": f"文件类型: {suffix} | 开始解析..."})

        try:
            if suffix == ".pdf":
                gen = process_pdf_stream(upload_path, article_dir)
            else:
                gen = process_markdown_stream(upload_path, article_dir)

            final_md = ""
            for event in gen:
                event_type = event.pop("type")
                if event_type == "complete":
                    final_md = event["markdown"]
                    yield _sse("log", {"level": "success", "message": "文章解析完成"})
                else:
                    yield _sse(event_type, event)
                await asyncio.sleep(0)

            (article_dir / "article.md").write_text(final_md, encoding="utf-8")
            meta["status"] = "parsed"
            _save_meta(article_dir, meta)
            yield _sse("complete", meta)

        except Exception as e:
            meta["status"] = "error"
            meta["error_message"] = str(e)
            _save_meta(article_dir, meta)
            yield _sse("error", {"message": str(e)})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ---------- Articles ----------

@app.get("/api/articles")
def list_articles():
    articles = []
    if ARTICLES_DIR.exists():
        for d in sorted(ARTICLES_DIR.iterdir(), reverse=True):
            if d.is_dir():
                meta = _load_meta(d)
                if meta:
                    articles.append(meta)
    return articles


@app.get("/api/articles/{article_id}")
def get_article(article_id: str):
    article_dir = ARTICLES_DIR / article_id
    if not article_dir.exists():
        raise HTTPException(404, "文章不存在")

    meta = _load_meta(article_dir)
    if not meta:
        raise HTTPException(404, "元数据不存在")

    result = dict(meta)

    md_path = article_dir / "article.md"
    if md_path.exists():
        result["content"] = md_path.read_text(encoding="utf-8")

    result_path = article_dir / "result.md"
    if result_path.exists():
        result["result"] = result_path.read_text(encoding="utf-8")

    images_dir = article_dir / "images"
    if images_dir.exists():
        result["images"] = [f.name for f in sorted(images_dir.iterdir()) if f.is_file()]
    else:
        result["images"] = []

    return result


class ProcessRequest(BaseModel):
    template_name: str


@app.post("/api/articles/{article_id}/process")
async def process_article(article_id: str, body: ProcessRequest):
    article_dir = ARTICLES_DIR / article_id
    if not article_dir.exists():
        raise HTTPException(404, "文章不存在")

    meta = _load_meta(article_dir)
    if not meta:
        raise HTTPException(404, "元数据不存在")

    templates = get_templates()
    template = next((t for t in templates if t["name"] == body.template_name), None)
    if not template:
        raise HTTPException(400, f"模板 '{body.template_name}' 不存在")

    meta["status"] = "processing"
    meta["template_used"] = body.template_name
    _save_meta(article_dir, meta)

    async def event_stream():
        try:
            gen = run_llm_task_stream(article_dir, template)
            full_content = ""

            for event in gen:
                event_type = event.get("type", "log")
                if event_type == "done":
                    full_content = event["content"]
                    yield _sse("done", {"usage": event.get("usage")})
                elif event_type == "delta":
                    yield _sse("delta", {"content": event["content"]})
                else:
                    yield _sse(event_type, event)
                await asyncio.sleep(0)

            (article_dir / "result.md").write_text(full_content, encoding="utf-8")
            meta["status"] = "completed"
            _save_meta(article_dir, meta)

        except Exception as e:
            meta["status"] = "error"
            meta["error_message"] = str(e)
            _save_meta(article_dir, meta)
            yield _sse("error", {"message": str(e)})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.delete("/api/articles/{article_id}")
def delete_article(article_id: str):
    article_dir = ARTICLES_DIR / article_id
    if not article_dir.exists():
        raise HTTPException(404, "文章不存在")
    shutil.rmtree(article_dir)
    return {"ok": True}


@app.get("/api/articles/{article_id}/images/{filename}")
def get_image(article_id: str, filename: str):
    img_path = ARTICLES_DIR / article_id / "images" / filename
    if not img_path.exists():
        raise HTTPException(404, "图片不存在")
    return FileResponse(img_path)


# ---------- Sessions ----------

class CreateSessionRequest(BaseModel):
    name: str = "自由对话"
    template_name: str | None = None


class SessionChatRequest(BaseModel):
    message: str


@app.get("/api/articles/{article_id}/sessions")
def get_sessions(article_id: str):
    article_dir = ARTICLES_DIR / article_id
    if not article_dir.exists():
        raise HTTPException(404, "文章不存在")
    return list_sessions(article_dir)


@app.post("/api/articles/{article_id}/sessions")
def create_new_session(article_id: str, body: CreateSessionRequest):
    article_dir = ARTICLES_DIR / article_id
    if not article_dir.exists():
        raise HTTPException(404, "文章不存在")
    return create_session(article_dir, body.name, body.template_name)


@app.delete("/api/articles/{article_id}/sessions/{session_id}")
def delete_session_endpoint(article_id: str, session_id: str):
    article_dir = ARTICLES_DIR / article_id
    if not article_dir.exists():
        raise HTTPException(404, "文章不存在")
    delete_session(article_dir, session_id)
    return {"ok": True}


@app.get("/api/articles/{article_id}/sessions/{session_id}/chat")
def get_session_chat(article_id: str, session_id: str):
    article_dir = ARTICLES_DIR / article_id
    if not article_dir.exists():
        raise HTTPException(404, "文章不存在")
    return load_session_messages(article_dir, session_id)


@app.post("/api/articles/{article_id}/sessions/{session_id}/chat")
async def chat_in_session(article_id: str, session_id: str, body: SessionChatRequest):
    article_dir = ARTICLES_DIR / article_id
    if not article_dir.exists():
        raise HTTPException(404, "文章不存在")

    async def event_stream():
        try:
            for event in chat_stream(article_dir, session_id, body.message):
                event_type = event.pop("type")
                yield _sse(event_type, event)
                await asyncio.sleep(0)
        except Exception as e:
            yield _sse("error", {"message": str(e)})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.delete("/api/articles/{article_id}/sessions/{session_id}/chat/{message_id}")
def delete_session_chat_msg(article_id: str, session_id: str, message_id: str):
    article_dir = ARTICLES_DIR / article_id
    if not article_dir.exists():
        raise HTTPException(404, "文章不存在")
    delete_session_message(article_dir, session_id, message_id)
    return {"ok": True}


# ---------- Workflows ----------

@app.get("/api/workflows")
def get_workflow_templates():
    return get_workflows()


class WorkflowRunRequest(BaseModel):
    workflow_name: str
    article_ids: list[str]


@app.post("/api/workflow-runs")
async def create_workflow_run(body: WorkflowRunRequest):
    workflows = get_workflows()
    workflow = next((w for w in workflows if w["name"] == body.workflow_name), None)
    if not workflow:
        raise HTTPException(400, f"工作流 '{body.workflow_name}' 不存在")

    if not body.article_ids:
        raise HTTPException(400, "至少需要选择一篇文章")

    for aid in body.article_ids:
        if not (ARTICLES_DIR / aid).exists():
            raise HTTPException(404, f"文章不存在: {aid}")

    async def event_stream():
        try:
            for event in execute_workflow_stream(workflow, body.article_ids):
                event_type = event.pop("type")
                yield _sse(event_type, event)
                await asyncio.sleep(0)
        except Exception as e:
            yield _sse("error", {"message": str(e)})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/api/workflow-runs")
def get_workflow_runs():
    return list_workflow_runs()


@app.get("/api/workflow-runs/{run_id}")
def get_workflow_run_detail(run_id: str):
    run = get_workflow_run(run_id)
    if not run:
        raise HTTPException(404, "运行记录不存在")
    return run


@app.delete("/api/workflow-runs/{run_id}")
def delete_workflow_run_endpoint(run_id: str):
    delete_workflow_run(run_id)
    return {"ok": True}


# ---------- Helpers ----------

def _save_meta(article_dir: Path, meta: dict):
    (article_dir / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _load_meta(article_dir: Path) -> dict | None:
    meta_path = article_dir / "meta.json"
    if meta_path.exists():
        return json.loads(meta_path.read_text(encoding="utf-8"))
    return None
