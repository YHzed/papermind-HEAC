import json
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Generator

from openai import OpenAI

from .config_manager import get_api_key, get_llm_settings, get_system_prompt, get_workflows
from .vision_payload import build_interleaved_content

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
ARTICLES_DIR = DATA_DIR / "articles"
RUNS_DIR = DATA_DIR / "workflow-runs"


def _save_run(run_dir: Path, meta: dict):
    (run_dir / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _load_run(run_dir: Path) -> dict | None:
    meta_path = run_dir / "meta.json"
    if meta_path.exists():
        return json.loads(meta_path.read_text(encoding="utf-8"))
    return None


def list_workflow_runs() -> list[dict]:
    runs = []
    if not RUNS_DIR.exists():
        return runs
    for d in sorted(RUNS_DIR.iterdir(), reverse=True):
        if not d.is_dir():
            continue
        meta = _load_run(d)
        if not meta:
            continue
        runs.append({
            "id": meta["id"],
            "workflow_name": meta["workflow_name"],
            "articles": meta["articles"],
            "status": meta["status"],
            "created_at": meta["created_at"],
            "completed_at": meta.get("completed_at"),
            "error_message": meta.get("error_message"),
            "step_count": len(meta.get("steps", [])),
        })
    return runs


def get_workflow_run(run_id: str) -> dict | None:
    return _load_run(RUNS_DIR / run_id)


def delete_workflow_run(run_id: str):
    run_dir = RUNS_DIR / run_id
    if run_dir.exists():
        shutil.rmtree(run_dir)


def _get_client() -> tuple[OpenAI, dict]:
    api_key = get_api_key("openai")
    if not api_key:
        raise ValueError("OpenAI API Key 未配置")
    settings = get_llm_settings()
    client_kwargs: dict = {"api_key": api_key}
    base_url = settings.get("base_url", "")
    if base_url:
        client_kwargs["base_url"] = base_url
    return OpenAI(**client_kwargs), settings


def _run_llm_stream(
    client: OpenAI, settings: dict, messages: list,
) -> Generator[dict, None, None]:
    model = settings.get("model", "gpt-4o")
    temperature = settings.get("temperature", 0.7)
    max_tokens = settings.get("max_tokens", 4096)

    full_content = ""
    chunk = None
    stream = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and delta.content:
            full_content += delta.content
            yield {"type": "delta", "content": delta.content}

    usage_info = None
    if chunk and hasattr(chunk, "usage") and chunk.usage:
        usage_info = {
            "prompt_tokens": chunk.usage.prompt_tokens,
            "completion_tokens": chunk.usage.completion_tokens,
            "total_tokens": chunk.usage.total_tokens,
        }

    yield {"type": "llm_done", "content": full_content, "usage": usage_info}


def execute_workflow_stream(
    workflow: dict,
    article_ids: list[str],
) -> Generator[dict, None, None]:
    RUNS_DIR.mkdir(parents=True, exist_ok=True)

    articles_info = []
    for aid in article_ids:
        article_dir = ARTICLES_DIR / aid
        if not article_dir.exists():
            raise ValueError(f"文章不存在: {aid}")
        meta_path = article_dir / "meta.json"
        if meta_path.exists():
            ameta = json.loads(meta_path.read_text(encoding="utf-8"))
            articles_info.append({"id": aid, "name": ameta.get("original_name", aid)})
        else:
            articles_info.append({"id": aid, "name": aid})

    steps = workflow.get("steps", [])
    run_id = str(uuid.uuid4())
    run_dir = RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    run_meta: dict = {
        "id": run_id,
        "workflow_name": workflow["name"],
        "article_ids": article_ids,
        "articles": articles_info,
        "status": "running",
        "created_at": datetime.now().isoformat(),
        "completed_at": None,
        "current_step": 0,
        "steps": [
            {
                "name": step["name"],
                "type": step["type"],
                "status": "pending",
                "results": {} if step["type"] == "per_article" else None,
                "result": None,
            }
            for step in steps
        ],
        "error_message": None,
    }
    _save_run(run_dir, run_meta)

    yield {
        "type": "run_created",
        "run_id": run_id,
        "workflow_name": workflow["name"],
        "articles": articles_info,
        "step_count": len(steps),
    }

    client, settings = _get_client()
    system_prompt = get_system_prompt() or "你是一个专业的文章分析助手。"

    # Accumulate results across steps for template variable injection
    previous_results: dict[str, dict | str] = {}

    try:
        for step_idx, step in enumerate(steps):
            step_name = step["name"]
            step_type = step["type"]
            step_prompt = step.get("prompt", "")

            run_meta["current_step"] = step_idx
            run_meta["steps"][step_idx]["status"] = "running"
            _save_run(run_dir, run_meta)

            yield {
                "type": "step_start",
                "step_index": step_idx,
                "step_name": step_name,
                "step_type": step_type,
            }

            if step_type == "per_article":
                step_results: dict[str, str] = {}

                for art_idx, aid in enumerate(article_ids):
                    article_dir = ARTICLES_DIR / aid
                    article_name = articles_info[art_idx]["name"]

                    yield {
                        "type": "article_start",
                        "step_index": step_idx,
                        "article_index": art_idx,
                        "article_id": aid,
                        "article_name": article_name,
                    }

                    article_md = (article_dir / "article.md").read_text(encoding="utf-8")
                    images_dir = article_dir / "images"
                    article_parts, image_count, _ = build_interleaved_content(article_md, images_dir)

                    messages = [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": article_parts},
                        {"role": "user", "content": step_prompt},
                    ]

                    article_content = ""
                    for event in _run_llm_stream(client, settings, messages):
                        if event["type"] == "delta":
                            yield {
                                "type": "delta",
                                "step_index": step_idx,
                                "article_id": aid,
                                "content": event["content"],
                            }
                        elif event["type"] == "llm_done":
                            article_content = event["content"]
                            yield {
                                "type": "article_done",
                                "step_index": step_idx,
                                "article_index": art_idx,
                                "article_id": aid,
                                "article_name": article_name,
                                "usage": event.get("usage"),
                            }

                    step_results[aid] = article_content
                    run_meta["steps"][step_idx]["results"][aid] = article_content
                    _save_run(run_dir, run_meta)

                previous_results[step_name] = step_results

            elif step_type == "aggregate":
                combined_parts = []
                for prev_name, prev_data in previous_results.items():
                    if isinstance(prev_data, dict):
                        for aid, content in prev_data.items():
                            art_name = next(
                                (a["name"] for a in articles_info if a["id"] == aid),
                                aid,
                            )
                            combined_parts.append(f"### {art_name}\n\n{content}")
                    elif isinstance(prev_data, str):
                        combined_parts.append(prev_data)

                combined_previous = "\n\n---\n\n".join(combined_parts)

                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": combined_previous},
                    {"role": "user", "content": step_prompt},
                ]

                aggregate_content = ""
                for event in _run_llm_stream(client, settings, messages):
                    if event["type"] == "delta":
                        yield {
                            "type": "delta",
                            "step_index": step_idx,
                            "content": event["content"],
                        }
                    elif event["type"] == "llm_done":
                        aggregate_content = event["content"]

                run_meta["steps"][step_idx]["result"] = aggregate_content
                previous_results[step_name] = aggregate_content

            run_meta["steps"][step_idx]["status"] = "completed"
            _save_run(run_dir, run_meta)

            yield {
                "type": "step_done",
                "step_index": step_idx,
                "step_name": step_name,
            }

        run_meta["status"] = "completed"
        run_meta["completed_at"] = datetime.now().isoformat()
        _save_run(run_dir, run_meta)

        yield {"type": "done", "run_id": run_id}

    except Exception as e:
        run_meta["status"] = "error"
        run_meta["error_message"] = str(e)
        run_meta["completed_at"] = datetime.now().isoformat()
        _save_run(run_dir, run_meta)
        raise
