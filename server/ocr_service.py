import base64
import re
from pathlib import Path
from typing import Generator

from mistralai import Mistral

from .config_manager import get_api_key


def process_pdf(pdf_path: Path, article_dir: Path) -> str:
    """解析 PDF 文件，返回处理后的 markdown（非流式）"""
    result = ""
    for event in process_pdf_stream(pdf_path, article_dir):
        if event["type"] == "complete":
            result = event["markdown"]
    return result


def process_pdf_stream(pdf_path: Path, article_dir: Path) -> Generator[dict, None, None]:
    """解析 PDF 文件，yield 进度事件"""
    api_key = get_api_key("mistral")
    if not api_key:
        raise ValueError("Mistral API Key 未配置")

    file_size_mb = pdf_path.stat().st_size / 1024 / 1024
    yield {"type": "log", "level": "info", "message": f"文件大小: {file_size_mb:.2f} MB"}

    yield {"type": "log", "level": "info", "message": "正在编码 PDF 为 Base64..."}
    pdf_base64 = base64.standard_b64encode(pdf_path.read_bytes()).decode("utf-8")
    yield {"type": "log", "level": "info", "message": f"Base64 编码完成 ({len(pdf_base64):,} 字符)"}

    yield {"type": "log", "level": "info", "message": "正在调用 Mistral OCR API，请稍候..."}
    client = Mistral(api_key=api_key)
    ocr_response = client.ocr.process(
        model="mistral-ocr-latest",
        document={
            "type": "document_url",
            "document_url": f"data:application/pdf;base64,{pdf_base64}",
        },
        include_image_base64=True,
    )

    total_pages = len(ocr_response.pages)
    yield {"type": "log", "level": "success", "message": f"OCR 响应成功，共 {total_pages} 页"}

    images_dir = article_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    all_markdown = []
    for page in ocr_response.pages:
        md = page.markdown
        img_count = 0
        if page.images:
            for img in page.images:
                if img.image_base64:
                    image_data = _decode_base64_image(img.image_base64)
                    if image_data:
                        img_path = images_dir / img.id
                        img_path.write_bytes(image_data)
                        md = md.replace(f"]({img.id})", f"](./images/{img.id})")
                        img_count += 1
                        yield {
                            "type": "log", "level": "info",
                            "message": f"  图片 {img.id} 已保存 ({len(image_data):,} bytes)",
                        }
        all_markdown.append(md)
        preview = md[:150].replace("\n", " ")
        yield {
            "type": "page",
            "page": page.index + 1,
            "total": total_pages,
            "images_count": img_count,
            "preview": preview,
        }
        yield {
            "type": "log", "level": "info",
            "message": f"第 {page.index + 1}/{total_pages} 页完成 | {len(md):,} 字符 | {img_count} 张图片",
        }

    final_md = "\n\n---\n\n".join(all_markdown)
    yield {"type": "log", "level": "success", "message": "文章解析完成"}
    yield {"type": "complete", "markdown": final_md}


def _decode_base64_image(data_url: str) -> bytes | None:
    """从 data:image/xxx;base64,... 格式中解码图片"""
    match = re.match(r"data:image/[^;]+;base64,(.+)", data_url)
    if match:
        return base64.b64decode(match.group(1))
    return None
