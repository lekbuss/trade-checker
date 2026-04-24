import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'
import { ExtractedJsonDialog } from '@/components/extracted-json-dialog'
import { DiscrepancyList } from '@/components/discrepancy-list'
import type { DocType } from '@prisma/client'

export const dynamic = 'force-dynamic'

const DOC_TYPE_LABELS: Record<DocType, string> = {
  INVOICE:      'Invoice',
  PACKING_LIST: 'Packing List',
  BL:           'Bill of Lading',
  ORIGIN_CERT:  '原産地証明書',
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

  const uploadedDocs = shipment.documents.filter(d => d.status !== 'ERROR' || d.extractedData)

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{shipment.name}</h1>
        <StatusBadge status={shipment.status} />
      </div>

      {/* アップロードサマリー */}
      <section className="bg-gray-50 rounded-lg px-4 py-3 border text-sm text-gray-700">
        <span className="font-medium">アップロード済み書類：{shipment.documents.length}件</span>
        {shipment.documents.length > 0 && (
          <span className="ml-2 text-gray-500">
            ({shipment.documents.map(d => DOC_TYPE_LABELS[d.docType]).join('、')})
          </span>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">書類詳細</h2>
        <div className="grid grid-cols-2 gap-4">
          {shipment.documents.map((doc) => (
            <Card key={doc.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex justify-between items-center">
                  {DOC_TYPE_LABELS[doc.docType]}
                  <StatusBadge status={doc.status} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">{doc.fileType}</p>
                  {doc.extractedData && (
                    <ExtractedJsonDialog
                      docType={DOC_TYPE_LABELS[doc.docType]}
                      data={doc.extractedData}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {uploadedDocs.length === 0 && (
            <p className="text-xs text-gray-400 col-span-2">書類がありません</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          差異レポート
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({shipment.discrepancies.length} 件)
          </span>
        </h2>
        <DiscrepancyList
          discrepancies={shipment.discrepancies.map(d => ({
            ...d,
            correctionNote: d.correctionNote,
            status: d.status as 'OPEN' | 'RESOLVED',
            severity: d.severity as 'FATAL' | 'MINOR',
          }))}
          shipmentId={shipment.id}
        />
      </section>
    </div>
  )
}
