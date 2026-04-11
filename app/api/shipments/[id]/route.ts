import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        documents: { orderBy: { createdAt: 'asc' } },
        discrepancies: { orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }] },
      },
    })
    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }
    return NextResponse.json(shipment)
  } catch (error) {
    console.error('[GET /api/shipments/[id]]', error)
    return NextResponse.json({ error: 'Failed to fetch shipment' }, { status: 500 })
  }
}
