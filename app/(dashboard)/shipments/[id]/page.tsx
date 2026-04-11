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

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{shipment.name}</h1>
        <StatusBadge status={shipment.status} />
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">アップロード書類</h2>
        <div className="grid grid-cols-2 gap-4">
          {(['INVOICE', 'PACKING_LIST', 'BL', 'ORIGIN_CERT'] as DocType[]).map((docType) => {
            const doc = shipment.documents.find(d => d.docType === docType)
            return (
              <Card key={docType}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex justify-between items-center">
                    {DOC_TYPE_LABELS[docType]}
                    {doc && <StatusBadge status={doc.status} />}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {doc ? (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">{doc.fileType}</p>
                      {doc.extractedData && (
                        <ExtractedJsonDialog
                          docType={DOC_TYPE_LABELS[docType]}
                          data={doc.extractedData}
                        />
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">未アップロード</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
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
