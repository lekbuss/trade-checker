import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { DocType, FileType } from '@prisma/client'

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.xlsx', '.xls', '.eml', '.msg'])

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const shipmentId = formData.get('shipmentId') as string | null
    const docType = formData.get('docType') as DocType | null

    if (!file || !shipmentId || !docType) {
      return NextResponse.json({ error: 'file, shipmentId, docType are required' }, { status: 400 })
    }

    const MAX_BYTES = 50 * 1024 * 1024 // 50 MB
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large (max 50 MB)' }, { status: 413 })
    }

    const ext = path.extname(file.name).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: `Unsupported file type: ${ext}` }, { status: 400 })
    }

    const uploadsRoot = path.resolve(process.cwd(), 'uploads')
    const uploadsDir = path.resolve(uploadsRoot, shipmentId)
    if (!uploadsDir.startsWith(uploadsRoot + path.sep) && uploadsDir !== uploadsRoot) {
      return NextResponse.json({ error: 'Invalid shipmentId' }, { status: 400 })
    }
    await mkdir(uploadsDir, { recursive: true })
    const filename = `${docType}${ext}`
    const filePath = path.join(uploadsDir, filename)
    const bytes = await file.arrayBuffer()
    await writeFile(filePath, Buffer.from(bytes))

    let fileType: FileType
    if (ext === '.xlsx' || ext === '.xls') {
      fileType = 'EXCEL'
    } else if (ext === '.eml' || ext === '.msg') {
      fileType = 'EMAIL'
    } else {
      // PDF: call Python service to auto-detect
      const pythonUrl = process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8001'
      try {
        const blob = new Blob([bytes])
        const fd = new FormData()
        fd.append('file', blob, filename)
        const res = await fetch(`${pythonUrl}/process/pdf-auto`, { method: 'POST', body: fd })
        if (res.ok) {
          const result = await res.json() as { text?: string; images?: string[] }
          fileType = (result.images && result.images.length > 0) ? 'PDF_SCAN' : 'PDF_TEXT'
        } else {
          fileType = 'PDF_TEXT'
        }
      } catch {
        fileType = 'PDF_TEXT'
      }
    }

    const document = await prisma.document.upsert({
      where: { shipmentId_docType: { shipmentId, docType } },
      update: { filePath: `uploads/${shipmentId}/${filename}`, fileType, status: 'PENDING', extractedData: Prisma.JsonNull },
      create: { shipmentId, docType, fileType, filePath: `uploads/${shipmentId}/${filename}` },
    })

    return NextResponse.json(document, { status: 201 })
  } catch (error) {
    console.error('[POST /api/documents/upload]', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
