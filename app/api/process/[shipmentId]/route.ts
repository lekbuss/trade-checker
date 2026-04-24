import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { extractFromText, extractFromImages } from '@/lib/extractor'
import { runRuleEngine } from '@/lib/rule-engine'
import { generateCorrectionNotes } from '@/lib/claude'
import { groupDocuments } from '@/lib/grouper'
import type { ExtractedDocuments, DiscrepancyResult } from '@/lib/rule-engine'
import type { DocType as PrismaDocType } from '@prisma/client'

const PYTHON_URL = process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8001'

async function preprocessFile(
  filePath: string,
  fileType: string
): Promise<{ text: string; images: string[] }> {
  const uploadsRoot = path.resolve(process.cwd(), 'uploads')
  const absPath = path.resolve(process.cwd(), filePath)
  if (!absPath.startsWith(uploadsRoot + path.sep)) {
    throw new Error(`Invalid file path: ${filePath}`)
  }
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
    // ── Step 1: Extract data from all documents ──────────────────────────
    const extractionResults = await Promise.allSettled(
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
          return { docId: doc.id, docType: doc.docType as PrismaDocType, data: extractResult.data }
        } catch (err) {
          await prisma.document.update({ where: { id: doc.id }, data: { status: 'ERROR' } })
          console.error(`[process] Error extracting ${doc.docType}:`, err)
          return { docId: doc.id, docType: doc.docType as PrismaDocType, data: null }
        }
      })
    )

    const extracted = extractionResults
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<{ docId: string; docType: PrismaDocType; data: Record<string, unknown> | null }>).value)

    // ── Step 2: Group documents by shipment using AI ─────────────────────
    const docsForGrouping = extracted.map(e => ({
      id: e.docId,
      docType: e.docType,
      extractedData: e.data,
    }))

    const grouping = await groupDocuments(docsForGrouping)

    // ── Step 3: Persist groupKey on each document ────────────────────────
    for (const group of grouping.groups) {
      await prisma.document.updateMany({
        where: { id: { in: group.docIds } },
        data: { groupKey: group.groupKey },
      })
    }
    if (grouping.unmatched.length > 0) {
      await prisma.document.updateMany({
        where: { id: { in: grouping.unmatched } },
        data: { groupKey: 'UNMATCHED' },
      })
    }

    // ── Step 4: Run rule engine per group ────────────────────────────────
    await prisma.discrepancy.deleteMany({ where: { shipmentId } })
    const allDiscrepancies: Array<DiscrepancyResult & { groupKey: string }> = []
    const allNotes: string[] = []

    for (const group of grouping.groups) {
      const groupExtracted = extracted.filter(e => group.docIds.includes(e.docId))
      const extractedMap: Partial<ExtractedDocuments> = {}
      for (const e of groupExtracted) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(extractedMap as any)[e.docType] = e.data
      }

      const discrepancies = await runRuleEngine(extractedMap as ExtractedDocuments)
      const notes = await generateCorrectionNotes(discrepancies)

      for (let i = 0; i < discrepancies.length; i++) {
        allDiscrepancies.push({ ...discrepancies[i], groupKey: group.groupKey })
        allNotes.push(notes[i] ?? '')
      }
    }

    // ── Step 5: Unmatched documents → error entries ──────────────────────
    for (const docId of grouping.unmatched) {
      const doc = shipment.documents.find(d => d.id === docId)
      if (!doc) continue
      allDiscrepancies.push({
        fieldName: '未マッチ書類',
        docA: doc.docType as PrismaDocType,
        docB: doc.docType as PrismaDocType,
        valueA: doc.filePath.split('/').pop() ?? doc.docType,
        valueB: '対応書類なし',
        severity: 'MINOR',
        groupKey: 'UNMATCHED',
      })
      allNotes.push(`${DOC_LABEL[doc.docType]}「${doc.filePath.split('/').pop()}」に対応する書類が見つかりませんでした。アップロード漏れがないか確認してください。`)
    }

    // ── Step 6: Save all discrepancies ──────────────────────────────────
    if (allDiscrepancies.length > 0) {
      await prisma.discrepancy.createMany({
        data: allDiscrepancies.map((d, i) => ({
          shipmentId,
          groupKey: d.groupKey,
          fieldName: d.fieldName,
          docA: d.docA as PrismaDocType,
          docB: d.docB as PrismaDocType,
          valueA: d.valueA,
          valueB: d.valueB,
          severity: d.severity,
          correctionNote: allNotes[i] ?? null,
        })),
      })
    }

    await prisma.shipment.update({ where: { id: shipmentId }, data: { status: 'DONE' } })
    return NextResponse.json({
      success: true,
      groups: grouping.groups.length,
      unmatched: grouping.unmatched.length,
      discrepancyCount: allDiscrepancies.length,
    })

  } catch (error) {
    console.error('[POST /api/process]', error)
    await prisma.shipment.update({ where: { id: shipmentId }, data: { status: 'ERROR' } })
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}

const DOC_LABEL: Record<string, string> = {
  INVOICE: 'Invoice',
  PACKING_LIST: 'Packing List',
  BL: 'Bill of Lading',
  ORIGIN_CERT: '原産地証明書',
}
