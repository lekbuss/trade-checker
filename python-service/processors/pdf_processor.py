# python-service/processors/pdf_processor.py
import io
import base64
import pdfplumber
from pdf2image import convert_from_bytes


def extract_text(file_bytes: bytes) -> dict:
    """PDF からテキストを抽出する（テキスト層あり）"""
    text = ""
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            extracted = page.extract_text()
            if extracted:
                text += extracted + "\n"
    return {"success": True, "text": text.strip(), "images": []}


def extract_images(file_bytes: bytes) -> dict:
    """スキャン版 PDF を JPEG base64 画像配列に変換する"""
    images = convert_from_bytes(file_bytes, dpi=200, fmt="jpeg")
    encoded = []
    for img in images:
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        encoded.append(base64.b64encode(buf.getvalue()).decode("utf-8"))
    return {"success": True, "text": "", "images": encoded}


def detect_and_extract(file_bytes: bytes) -> dict:
    """テキスト層があれば抽出、なければ画像変換する（PDF を1回だけ開く）"""
    text = ""
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                text += t + "\n"
    if len(text.strip()) >= 50:
        return {"success": True, "text": text.strip(), "images": []}
    return extract_images(file_bytes)
