import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { detectDocType } from '@/lib/extractor'
import type { DocType, FileType } from '@prisma/client'

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.xlsx', '.xls', '.eml', '.msg'])
const VALID_DOC_TYPES = new Set(['INVOICE', 'PACKING_LIST', 'BL', 'ORIGIN_CERT'])

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const shipmentId = formData.get('shipmentId') as string | null
    const docTypeParam = formData.get('docType') as string | null

    if (!file || !shipmentId) {
      return NextResponse.json({ error: 'file and shipmentId are required' }, { status: 400 })
    }

    const MAX_BYTES = 50 * 1024 * 1024
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large (max 50 MB)' }, { status: 413 })
    }

    const ext = path.extname(file.name).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: `Unsupported file type: ${ext}` }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const pythonUrl = process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8001'

    // Call Python service to get text/images (needed for both fileType detection and docType detection)
    let preprocessed: { text?: string; images?: string[] } = {}
    try {
      const blob = new Blob([bytes])
      const fd = new FormData()
      fd.append('file', blob, file.name)
      let endpoint = '/process/pdf-auto'
      if (ext === '.xlsx' || ext === '.xls') endpoint = '/process/excel'
      else if (ext === '.eml' || ext === '.msg') endpoint = '/process/email'
      const res = await fetch(`${pythonUrl}${endpoint}`, { method: 'POST', body: fd })
      if (res.ok) preprocessed = await res.json() as { text?: string; images?: string[] }
    } catch { /* ignore, continue with empty */ }

    // Determine fileType
    let fileType: FileType
    if (ext === '.xlsx' || ext === '.xls') fileType = 'EXCEL'
    else if (ext === '.eml' || ext === '.msg') fileType = 'EMAIL'
    else fileType = (preprocessed.images?.length ?? 0) > 0 ? 'PDF_SCAN' : 'PDF_TEXT'

    // Determine docType — use provided value or auto-detect via Claude
    let docType: DocType
    if (docTypeParam && VALID_DOC_TYPES.has(docTypeParam)) {
      docType = docTypeParam as DocType
    } else {
      docType = await detectDocType(preprocessed.text ?? '', preprocessed.images ?? []) as DocType
    }

    // Save file to disk
    const uploadsRoot = path.resolve(process.cwd(), 'uploads')
    const uploadsDir = path.resolve(uploadsRoot, shipmentId)
    if (!uploadsDir.startsWith(uploadsRoot + path.sep) && uploadsDir !== uploadsRoot) {
      return NextResponse.json({ error: 'Invalid shipmentId' }, { status: 400 })
    }
    await mkdir(uploadsDir, { recursive: true })
    const filename = `${docType}${ext}`
    const filePath = path.join(uploadsDir, filename)
    await writeFile(filePath, Buffer.from(bytes))

    const document = await prisma.document.upsert({
      where: { shipmentId_docType: { shipmentId, docType } },
      update: { filePath: `uploads/${shipmentId}/${filename}`, fileType, status: 'PENDING', extractedData: Prisma.JsonNull },
      create: { shipmentId, docType, fileType, filePath: `uploads/${shipmentId}/${filename}` },
    })

    return NextResponse.json({ ...document, detectedType: docType }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/documents/upload]', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
