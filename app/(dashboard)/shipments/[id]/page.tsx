import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'
import { ExtractedJsonDialog } from '@/components/extracted-json-dialog'
import { DiscrepancyList } from '@/components/discrepancy-list'
import type { DocType, Document, Discrepancy } from '@prisma/client'

export const dynamic = 'force-dynamic'

const DOC_TYPE_LABELS: Record<DocType, string> = {
  INVOICE:      'Invoice',
  PACKING_LIST: 'Packing List',
  BL:           'Bill of Lading',
  ORIGIN_CERT:  '原産地証明書',
}

function filename(filePath: string) {
  return filePath.split('/').pop() ?? filePath
}

function GroupSection({
  groupKey,
  docs,
  discrepancies,
  shipmentId,
}: {
  groupKey: string
  docs: Document[]
  discrepancies: Discrepancy[]
  shipmentId: string
}) {
  const isUnmatched = groupKey === 'UNMATCHED'
  const fatal = discrepancies.filter(d => d.severity === 'FATAL').length
  const minor = discrepancies.filter(d => d.severity === 'MINOR').length

  return (
    <div className={`border rounded-lg p-4 space-y-3 ${isUnmatched ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-semibold text-sm">
          {isUnmatched ? '⚠️ 未マッチ書類' : `グループ: ${groupKey}`}
        </span>
        {!isUnmatched && (
          <>
            {fatal > 0 && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">FATAL {fatal}件</span>}
            {minor > 0 && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">MINOR {minor}件</span>}
            {fatal === 0 && minor === 0 && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">差異なし</span>}
          </>
        )}
        {isUnmatched && <span className="text-xs text-amber-700">対応する書類が見つかりませんでした</span>}
      </div>

      {/* Doc cards */}
      <div className="grid grid-cols-2 gap-2">
        {docs.map(doc => (
          <Card key={doc.id} className="shadow-none">
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs flex justify-between items-center">
                <span>{DOC_TYPE_LABELS[doc.docType]}</span>
                <StatusBadge status={doc.status} />
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-1">
              <p className="text-xs text-gray-400 truncate">{filename(doc.filePath)}</p>
              <p className="text-xs text-gray-400">{doc.fileType}</p>
              {doc.extractedData && (
                <ExtractedJsonDialog docType={DOC_TYPE_LABELS[doc.docType]} data={doc.extractedData} />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Discrepancies for this group */}
      {!isUnmatched && discrepancies.length > 0 && (
        <div className="mt-2">
          <DiscrepancyList
            discrepancies={discrepancies.map(d => ({
              ...d,
              correctionNote: d.correctionNote,
              status: d.status as 'OPEN' | 'RESOLVED',
              severity: d.severity as 'FATAL' | 'MINOR',
            }))}
            shipmentId={shipmentId}
          />
        </div>
      )}
    </div>
  )
}

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const shipment = await prisma.shipment.findUnique({
    where: { id },
    include: {
      documents: { orderBy: { createdAt: 'asc' } },
      discrepancies: { orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }] },
    },
  })
  if (!shipment) notFound()

  // Group documents by groupKey
  const groupMap = new Map<string, { docs: typeof shipment.documents; discrepancies: typeof shipment.discrepancies }>()
  const ungrouped: typeof shipment.documents = []

  for (const doc of shipment.documents) {
    const key = doc.groupKey ?? '__pending__'
    if (!groupMap.has(key)) groupMap.set(key, { docs: [], discrepancies: [] })
    groupMap.get(key)!.docs.push(doc)
  }
  for (const disc of shipment.discrepancies) {
    const key = disc.groupKey ?? '__pending__'
    if (groupMap.has(key)) {
      groupMap.get(key)!.discrepancies.push(disc)
    }
  }

  const matchedGroups = Array.from(groupMap.entries()).filter(([k]) => k !== 'UNMATCHED' && k !== '__pending__')
  const unmatchedGroup = groupMap.get('UNMATCHED')
  const pendingDocs = groupMap.get('__pending__')?.docs ?? ungrouped

  const totalFatal = shipment.discrepancies.filter(d => d.severity === 'FATAL' && d.groupKey !== 'UNMATCHED').length
  const totalMinor = shipment.discrepancies.filter(d => d.severity === 'MINOR' && d.groupKey !== 'UNMATCHED').length

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">{shipment.name}</h1>
        <StatusBadge status={shipment.status} />
        <a
          href={`/api/export/${id}?format=pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-sm text-blue-600 underline hover:text-blue-800"
        >
          PDFレポートを開く
        </a>
      </div>

      {/* Summary bar */}
      <div className="bg-gray-50 border rounded-lg px-4 py-3 flex flex-wrap gap-6 text-sm">
        <span><strong>書類数：</strong>{shipment.documents.length}件</span>
        <span><strong>グループ：</strong>{matchedGroups.length}件</span>
        {unmatchedGroup && <span className="text-amber-700"><strong>未マッチ：</strong>{unmatchedGroup.docs.length}件</span>}
        {totalFatal > 0 && <span className="text-red-600 font-semibold">FATAL {totalFatal}件</span>}
        {totalMinor > 0 && <span className="text-yellow-600 font-semibold">MINOR {totalMinor}件</span>}
        {totalFatal === 0 && totalMinor === 0 && shipment.status === 'DONE' && (
          <span className="text-green-600 font-semibold">✅ 差異なし</span>
        )}
      </div>

      {/* Pending (not yet processed) */}
      {pendingDocs.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-2 text-gray-500">処理待ち書類</h2>
          <div className="grid grid-cols-2 gap-2">
            {pendingDocs.map(doc => (
              <Card key={doc.id} className="shadow-none opacity-60">
                <CardHeader className="pb-1 pt-3 px-3">
                  <CardTitle className="text-xs">{DOC_TYPE_LABELS[doc.docType]}</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  <p className="text-xs text-gray-400 truncate">{filename(doc.filePath)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Matched groups */}
      {matchedGroups.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold">核対結果</h2>
          {matchedGroups.map(([groupKey, { docs, discrepancies }]) => (
            <GroupSection
              key={groupKey}
              groupKey={groupKey}
              docs={docs}
              discrepancies={discrepancies}
              shipmentId={id}
            />
          ))}
        </section>
      )}

      {/* Unmatched */}
      {unmatchedGroup && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-amber-700">未マッチ書類</h2>
          <GroupSection
            groupKey="UNMATCHED"
            docs={unmatchedGroup.docs}
            discrepancies={[]}
            shipmentId={id}
          />
        </section>
      )}
    </div>
  )
}
