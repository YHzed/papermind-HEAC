from pathlib import Path
from typing import Generator

from openai import OpenAI

from .config_manager import get_api_key, get_llm_settings, get_system_prompt
from .vision_payload import build_interleaved_content


def run_llm_task(article_dir: Path, template: dict) -> str:
    """用 LLM 处理文章（非流式）"""
    result = ""
    for event in run_llm_task_stream(article_dir, template):
        if event["type"] == "done":
            result = event["content"]
    return result


def run_llm_task_stream(article_dir: Path, template: dict) -> Generator[dict, None, None]:
    """用 LLM 处理文章，yield 流式事件"""
    api_key = get_api_key("openai")
    if not api_key:
        raise ValueError("OpenAI API Key 未配置")

    settings = get_llm_settings()

    client_kwargs = {"api_key": api_key}
    base_url = settings.get("base_url", "")
    if base_url:
        client_kwargs["base_url"] = base_url

    client = OpenAI(**client_kwargs)

    article_md = (article_dir / "article.md").read_text(encoding="utf-8")
    images_dir = article_dir / "images"
    article_parts, image_count, image_details = build_interleaved_content(article_md, images_dir)

    global_system = get_system_prompt()
    effective_system = global_system or "你是一个专业的文章分析助手。用户会提供文章内容，请根据用户的问题进行分析和回答。"

    messages = [{"role": "system", "content": effective_system}]
    messages.append({"role": "user", "content": article_parts})

    user_prompt = template.get("user_prompt", "")
    if user_prompt:
        messages.append({"role": "user", "content": user_prompt})

    model = settings.get("model", "gpt-4o")
    temperature = settings.get("temperature", 0.7)
    max_tokens = settings.get("max_tokens", 4096)

    # 发送请求概览（不含 base64 图片数据）
    yield {
        "type": "request_info",
        "model": model,
        "base_url": base_url or "https://api.openai.com/v1",
        "temperature": temperature,
        "max_tokens": max_tokens,
        "template_name": template.get("name", ""),
        "system_prompt": effective_system,
        "user_prompt_length": len(user_prompt or ""),
        "image_count": image_count,
        "images": image_details,
    }

    yield {"type": "log", "level": "info", "message": "正在发送请求..."}

    full_content = ""
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
    if hasattr(chunk, "usage") and chunk.usage:
        usage_info = {
            "prompt_tokens": chunk.usage.prompt_tokens,
            "completion_tokens": chunk.usage.completion_tokens,
            "total_tokens": chunk.usage.total_tokens,
        }

    yield {"type": "done", "content": full_content, "usage": usage_info}
