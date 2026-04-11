# python-service/processors/email_processor.py
import email
from email import policy


def extract_text(file_bytes: bytes) -> dict:
    """メール本文とテキスト添付ファイルを抽出する"""
    msg = email.message_from_bytes(file_bytes, policy=policy.default)
    parts = []

    subject = msg.get("Subject", "")
    if subject:
        parts.append(f"Subject: {subject}")

    for part in msg.walk():
        content_type = part.get_content_type()
        disposition = str(part.get("Content-Disposition", ""))

        if content_type == "text/plain" and "attachment" not in disposition:
            payload = part.get_payload(decode=True)
            if payload:
                parts.append(payload.decode("utf-8", errors="replace"))

    return {"success": True, "text": "\n".join(parts), "images": []}
