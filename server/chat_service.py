import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Generator

from openai import OpenAI

from .config_manager import get_api_key, get_llm_settings, get_system_prompt
from .vision_payload import build_interleaved_content


def _chats_dir(article_dir: Path) -> Path:
    d = article_dir / "chats"
    d.mkdir(exist_ok=True)
    return d


def _session_path(article_dir: Path, session_id: str) -> Path:
    return _chats_dir(article_dir) / f"{session_id}.json"


def _load_session(article_dir: Path, session_id: str) -> dict | None:
    path = _session_path(article_dir, session_id)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def _save_session(article_dir: Path, session: dict):
    path = _session_path(article_dir, session["id"])
    path.write_text(json.dumps(session, ensure_ascii=False, indent=2), encoding="utf-8")


def _migrate_old_chat(article_dir: Path):
    """Migrate old chat.json to a session if it exists."""
    old_path = article_dir / "chat.json"
    if not old_path.exists():
        return
    messages = json.loads(old_path.read_text(encoding="utf-8"))
    if not messages:
        old_path.unlink()
        return
    session = {
        "id": str(uuid.uuid4()),
        "name": "历史对话",
        "template_name": None,
        "system_prompt": "",
        "created_at": messages[0].get("timestamp", datetime.now().isoformat()),
        "messages": messages,
    }
    _save_session(article_dir, session)
    old_path.unlink()


def list_sessions(article_dir: Path) -> list[dict]:
    _migrate_old_chat(article_dir)
    chats_dir = _chats_dir(article_dir)
    sessions = []
    for f in sorted(chats_dir.iterdir()):
        if f.suffix == ".json":
            data = json.loads(f.read_text(encoding="utf-8"))
            sessions.append({
                "id": data["id"],
                "name": data.get("name", "未命名"),
                "template_name": data.get("template_name"),
                "created_at": data.get("created_at", ""),
                "message_count": len(data.get("messages", [])),
            })
    return sessions


def create_session(
    article_dir: Path,
    name: str = "自由对话",
    template_name: str | None = None,
) -> dict:
    session = {
        "id": str(uuid.uuid4()),
        "name": name,
        "template_name": template_name,
        "created_at": datetime.now().isoformat(),
        "messages": [],
    }
    _save_session(article_dir, session)
    return {
        "id": session["id"],
        "name": session["name"],
        "template_name": session["template_name"],
        "created_at": session["created_at"],
        "message_count": 0,
    }


def delete_session(article_dir: Path, session_id: str):
    path = _session_path(article_dir, session_id)
    if path.exists():
        path.unlink()


def load_session_messages(article_dir: Path, session_id: str) -> list[dict]:
    session = _load_session(article_dir, session_id)
    if session:
        return session.get("messages", [])
    return []


def delete_session_message(article_dir: Path, session_id: str, message_id: str):
    session = _load_session(article_dir, session_id)
    if not session:
        return
    messages = session.get("messages", [])
    idx = next((i for i, m in enumerate(messages) if m.get("id") == message_id), None)
    if idx is None:
        return
    to_remove = [idx]
    if idx + 1 < len(messages) and messages[idx + 1]["role"] == "assistant":
        to_remove.append(idx + 1)
    for i in sorted(to_remove, reverse=True):
        messages.pop(i)
    session["messages"] = messages
    _save_session(article_dir, session)


def _truncate_messages(messages: list[dict], max_b64: int = 80) -> list[dict]:
    """Create a preview of the messages array with base64 data truncated."""
    preview = []
    for msg in messages:
        content = msg.get("content")
        if isinstance(content, list):
            parts = []
            for part in content:
                if part.get("type") == "image_url":
                    url = part["image_url"]["url"]
                    if "base64," in url:
                        prefix = url[: url.index("base64,") + 7]
                        b64_data = url[len(prefix):]
                        truncated = prefix + b64_data[:max_b64] + f"... [{len(b64_data)} chars total]"
                        parts.append({
                            "type": "image_url",
                            "image_url": {"url": truncated, "detail": part["image_url"].get("detail", "auto")},
                        })
                    else:
                        parts.append(part)
                elif part.get("type") == "text":
                    text = part["text"]
                    if len(text) > 500:
                        parts.append({"type": "text", "text": text[:500] + f"... [{len(text)} chars total]"})
                    else:
                        parts.append(part)
                else:
                    parts.append(part)
            preview.append({"role": msg["role"], "content": parts})
        elif isinstance(content, str) and len(content) > 500:
            preview.append({"role": msg["role"], "content": content[:500] + f"... [{len(content)} chars total]"})
        else:
            preview.append(msg)
    return preview


def _build_article_context(article_dir: Path) -> tuple[list[dict], int, list[dict]]:
    """Build the article content parts (text + images interleaved)."""
    article_md = (article_dir / "article.md").read_text(encoding="utf-8")
    images_dir = article_dir / "images"
    return build_interleaved_content(article_md, images_dir)


def chat_stream(
    article_dir: Path,
    session_id: str,
    user_message: str,
) -> Generator[dict, None, None]:
    """Send a chat message in a session, yield streaming events."""
    session = _load_session(article_dir, session_id)
    if not session:
        raise ValueError("会话不存在")

    api_key = get_api_key("openai")
    if not api_key:
        raise ValueError("OpenAI API Key 未配置")

    settings = get_llm_settings()

    client_kwargs = {"api_key": api_key}
    base_url = settings.get("base_url", "")
    if base_url:
        client_kwargs["base_url"] = base_url

    client = OpenAI(**client_kwargs)

    messages = []

    global_system_prompt = get_system_prompt()
    effective_system = global_system_prompt or "你是一个专业的文章分析助手。用户会提供文章内容，请根据用户的问题进行分析和回答。"
    messages.append({"role": "system", "content": effective_system})

    article_content, image_count, image_details = _build_article_context(article_dir)
    messages.append({"role": "user", "content": article_content})

    history = session.get("messages", [])
    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": user_message})

    model = settings.get("model", "gpt-4o")
    temperature = settings.get("temperature", 0.7)
    max_tokens = settings.get("max_tokens", 4096)

    yield {
        "type": "request_info",
        "model": model,
        "base_url": base_url or "https://api.openai.com/v1",
        "temperature": temperature,
        "max_tokens": max_tokens,
        "system_prompt": effective_system,
        "user_prompt_length": len(user_message),
        "image_count": image_count,
        "images": image_details,
        "history_count": len(history),
        "messages_body": _truncate_messages(messages),
    }

    user_msg_id = str(uuid.uuid4())

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

    now = datetime.now().isoformat()
    history.append({"id": user_msg_id, "role": "user", "content": user_message, "timestamp": now})
    history.append({"id": str(uuid.uuid4()), "role": "assistant", "content": full_content, "timestamp": now})
    session["messages"] = history
    _save_session(article_dir, session)

    yield {"type": "done", "content": full_content, "usage": usage_info, "user_msg_id": user_msg_id}
