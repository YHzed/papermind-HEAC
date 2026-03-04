import base64
import mimetypes
import re
from pathlib import Path

MD_IMAGE_RE = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")


def _natural_sort_key(name: str):
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", name)]


def _append_text_part(parts: list[dict], text: str):
    if not text:
        return
    if parts and parts[-1].get("type") == "text":
        parts[-1]["text"] += text
    else:
        parts.append({"type": "text", "text": text})


def _resolve_local_image_path(src: str, images_dir: Path) -> Path | None:
    src = src.strip().strip("<>").strip()
    if src.startswith(("http://", "https://", "data:")):
        return None

    if src.startswith("./images/"):
        rel = src[len("./images/"):]
    elif src.startswith("images/"):
        rel = src[len("images/"):]
    elif src.startswith("/images/"):
        rel = src[len("/images/"):]
    else:
        return None

    rel_path = Path(rel)
    if rel_path.is_absolute() or ".." in rel_path.parts:
        return None

    img_path = images_dir / rel_path
    if img_path.exists() and img_path.is_file():
        return img_path
    return None


def _append_image_part(parts: list[dict], image_details: list[dict], img_path: Path):
    mime = mimetypes.guess_type(img_path.name)[0] or "image/png"
    raw = img_path.read_bytes()
    b64 = base64.b64encode(raw).decode("utf-8")
    parts.append({
        "type": "image_url",
        "image_url": {"url": f"data:{mime};base64,{b64}", "detail": "auto"},
    })
    image_details.append({"name": img_path.name, "mime": mime, "size": len(raw)})


def build_interleaved_content(text: str, images_dir: Path) -> tuple[list[dict], int, list[dict]]:
    """
    按 markdown 中图片占位符出现顺序，构造 text/image 交错的 content parts。
    若未发现占位符，则回退为文本 + images 目录自然排序的图片（与旧行为兼容）。
    """
    parts: list[dict] = []
    image_details: list[dict] = []
    used_names: set[str] = set()

    cursor = 0
    for match in MD_IMAGE_RE.finditer(text):
        start, end = match.span()
        alt_text = (match.group(1) or "").strip()
        src = match.group(2) or ""

        _append_text_part(parts, text[cursor:start])

        img_path = _resolve_local_image_path(src, images_dir)
        if img_path:
            if alt_text and alt_text != img_path.name:
                _append_text_part(parts, f"[图片说明: {alt_text}]\n")
            _append_image_part(parts, image_details, img_path)
            used_names.add(img_path.name)
        else:
            _append_text_part(parts, match.group(0))

        cursor = end

    _append_text_part(parts, text[cursor:])

    if not image_details and images_dir.exists():
        for img_file in sorted(
            (p for p in images_dir.iterdir() if p.is_file()),
            key=lambda p: _natural_sort_key(p.name),
        ):
            _append_image_part(parts, image_details, img_file)
            used_names.add(img_file.name)

    elif images_dir.exists():
        # 兜底：把文中未引用到的图片补到末尾，避免丢图
        for img_file in sorted(
            (p for p in images_dir.iterdir() if p.is_file() and p.name not in used_names),
            key=lambda p: _natural_sort_key(p.name),
        ):
            _append_image_part(parts, image_details, img_file)

    if not parts:
        parts = [{"type": "text", "text": text}]

    return parts, len(image_details), image_details
