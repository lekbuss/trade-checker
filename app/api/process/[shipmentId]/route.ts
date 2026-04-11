import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { extractFromText, extractFromImages } from '@/lib/extractor'
import { runRuleEngine } from '@/lib/rule-engine'
import { generateCorrectionNotes } from '@/lib/claude'
import type { ExtractedDocuments, DiscrepancyResult } from '@/lib/rule-engine'
import type { DocType as PrismaDocType } from '@prisma/client'

const PYTHON_URL = process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8001'

async function preprocessFile(
  filePath: string,
  fileType: string
): Promise<{ text: string; images: string[] }> {
  const absPath = path.join(process.cwd(), filePath)
  const bytes = await readFile(absPath)
  const blob = new Blob([bytes])
  const fd = new FormData()
  fd.append('file', blob, path.basename(filePath))

  let endpoint = '/process/pdf-text'
  if (fileType === 'PDF_SCAN') endpoint = '/process/pdf-scan'
  else if (fileType === 'EXCEL') endpoint = '/process/excel'
  else if (fileType === 'EMAIL') endpoint = '/process/email'

  const res = await fetch(`${PYTHON_URL}${endpoint}`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(`Python service error: ${res.status}`)
  return res.json() as Promise<{ text: string; images: string[] }>
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ shipmentId: string }> }
) {
  const { shipmentId } = await params

  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { documents: true },
  })
  if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })

  await prisma.shipment.update({ where: { id: shipmentId }, data: { status: 'PROCESSING' } })

  try {
    const results = await Promise.allSettled(
      shipment.documents.map(async (doc) => {
        await prisma.document.update({ where: { id: doc.id }, data: { status: 'PROCESSING' } })
        try {
          const preprocessed = await preprocessFile(doc.filePath, doc.fileType)
          let extractResult: { data: Record<string, unknown> | null }
          if (preprocessed.images.length > 0) {
            extractResult = await extractFromImages(doc.docType, preprocessed.images)
          } else {
            extractResult = await extractFromText(doc.docType, preprocessed.text)
          }
          await prisma.document.update({
            where: { id: doc.id },
            data: {
              status: 'DONE',
              extractedData: (extractResult.data ?? {}) as Prisma.InputJsonValue,
              confidenceScore: extractResult.data ? 0.9 : 0.1,
            },
          })
          return { docType: doc.docType as PrismaDocType, data: extractResult.data }
        } catch (err) {
          await prisma.document.update({ where: { id: doc.id }, data: { status: 'ERROR' } })
          console.error(`[process] Error on doc ${doc.docType}:`, err)
          return { docType: doc.docType as PrismaDocType, data: null }
        }
      })
    )

    const extractedMap: Partial<ExtractedDocuments> = {}
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(extractedMap as any)[result.value.docType] = result.value.data
      }
    }

    const discrepancyResults: DiscrepancyResult[] = await runRuleEngine(extractedMap as ExtractedDocuments)
    const correctionNotes = await generateCorrectionNotes(discrepancyResults)

    await prisma.discrepancy.deleteMany({ where: { shipmentId } })
    if (discrepancyResults.length > 0) {
      await prisma.discrepancy.createMany({
        data: discrepancyResults.map((d, i) => ({
          shipmentId,
          fieldName: d.fieldName,
          docA: d.docA as PrismaDocType,
          docB: d.docB as PrismaDocType,
          valueA: d.valueA,
          valueB: d.valueB,
          severity: d.severity,
          correctionNote: correctionNotes[i] ?? null,
        })),
      })
    }

    await prisma.shipment.update({ where: { id: shipmentId }, data: { status: 'DONE' } })
    return NextResponse.json({ success: true, discrepancyCount: discrepancyResults.length })

  } catch (error) {
    console.error('[POST /api/process]', error)
    await prisma.shipment.update({ where: { id: shipmentId }, data: { status: 'ERROR' } })
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
