# python-service/main.py
from fastapi import FastAPI, UploadFile, File, HTTPException
from processors.pdf_processor import extract_text as pdf_text, extract_images as pdf_images, detect_and_extract
from processors.excel_processor import extract_text as excel_text
from processors.email_processor import extract_text as email_text

app = FastAPI(title="Trade Document Preprocessor")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/process/pdf-text")
async def process_pdf_text(file: UploadFile = File(...)):
    try:
        content = await file.read()
        return pdf_text(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process/pdf-scan")
async def process_pdf_scan(file: UploadFile = File(...)):
    try:
        content = await file.read()
        return pdf_images(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process/pdf-auto")
async def process_pdf_auto(file: UploadFile = File(...)):
    """テキスト層の有無を自動判定して処理する"""
    try:
        content = await file.read()
        return detect_and_extract(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process/excel")
async def process_excel(file: UploadFile = File(...)):
    try:
        content = await file.read()
        return excel_text(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process/email")
async def process_email(file: UploadFile = File(...)):
    try:
        content = await file.read()
        return email_text(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
