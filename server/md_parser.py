import re
import mimetypes
from pathlib import Path
from typing import Generator
from urllib.parse import urlparse, unquote

import httpx


def process_markdown(md_path: Path, article_dir: Path) -> str:
    """处理 markdown 文件（非流式）"""
    result = ""
    for event in process_markdown_stream(md_path, article_dir):
        if event["type"] == "complete":
            result = event["markdown"]
    return result


def process_markdown_stream(md_path: Path, article_dir: Path) -> Generator[dict, None, None]:
    """处理 markdown 文件，yield 进度事件"""
    content = md_path.read_text(encoding="utf-8")
    yield {"type": "log", "level": "info", "message": f"Markdown 文件已读取 ({len(content):,} 字符)"}

    images_dir = article_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    img_pattern = re.compile(r"!\[([^\]]*)\]\((https?://[^)]+)\)")
    matches = img_pattern.findall(content)

    if not matches:
        yield {"type": "log", "level": "info", "message": "未发现远程图片 URL"}
        yield {"type": "complete", "markdown": content}
        return

    yield {"type": "log", "level": "info", "message": f"发现 {len(matches)} 个远程图片 URL"}

    counter = 0
    with httpx.Client(timeout=30, follow_redirects=True) as client:
        for i, (alt, url) in enumerate(matches):
            yield {"type": "log", "level": "info", "message": f"[{i+1}/{len(matches)}] 下载: {url[:80]}..."}
            try:
                resp = client.get(url)
                resp.raise_for_status()

                filename = _url_to_filename(url, counter)
                img_path = images_dir / filename
                img_path.write_bytes(resp.content)

                content = content.replace(f"]({url})", f"](./images/{filename})")
                counter += 1
                yield {
                    "type": "log", "level": "success",
                    "message": f"  ✓ 已保存为 {filename} ({len(resp.content):,} bytes)",
                }
            except Exception as e:
                yield {"type": "log", "level": "error", "message": f"  ✗ 下载失败: {e}"}

    yield {"type": "log", "level": "success", "message": f"图片处理完成，成功 {counter}/{len(matches)}"}
    yield {"type": "complete", "markdown": content}


def _url_to_filename(url: str, index: int) -> str:
    """从 URL 提取合理的文件名"""
    parsed = urlparse(url)
    path = unquote(parsed.path)
    name = Path(path).name

    if not name or len(name) > 100:
        ext = mimetypes.guess_extension(path) or ".png"
        name = f"img-{index}{ext}"

    suffix = Path(name).suffix
    if not suffix:
        name = f"{name}.png"

    return name
