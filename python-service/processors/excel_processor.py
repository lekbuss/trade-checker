# python-service/processors/excel_processor.py
import io
import openpyxl


def extract_text(file_bytes: bytes) -> dict:
    """Excel ファイルの全セルをテキストとして抽出する"""
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    lines = []
    for sheet in wb.worksheets:
        lines.append(f"[Sheet: {sheet.title}]")
        for row in sheet.iter_rows(values_only=True):
            cells = [str(c) if c is not None else "" for c in row]
            line = "\t".join(cells).strip()
            if line:
                lines.append(line)
    return {"success": True, "text": "\n".join(lines), "images": []}
