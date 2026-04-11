import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shipmentId: string }> }
) {
  const { shipmentId } = await params
  const format = request.nextUrl.searchParams.get('format') ?? 'json'

  try {
    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        documents: true,
        discrepancies: { orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }] },
      },
    })
    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    if (format === 'csv') {
      const headers = ['fieldName', 'docA', 'docB', 'valueA', 'valueB', 'severity', 'status', 'correctionNote']
      const rows = shipment.discrepancies.map(d =>
        headers.map(h => {
          const val = (d as Record<string, unknown>)[h]
          const str = val !== null && val !== undefined ? String(val) : ''
          return `"${str.replace(/"/g, '""')}"`
        }).join(',')
      )
      const csv = [headers.join(','), ...rows].join('\n')
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="shipment-${shipmentId}.csv"`,
        },
      })
    }

    return NextResponse.json(shipment, {
      headers: {
        'Content-Disposition': `attachment; filename="shipment-${shipmentId}.json"`,
      },
    })
  } catch (error) {
    console.error('[GET /api/export]', error)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
