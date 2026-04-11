import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const shipments = await prisma.shipment.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        discrepancies: { select: { severity: true } },
      },
    })
    return NextResponse.json(shipments)
  } catch (error) {
    console.error('[GET /api/shipments]', error)
    return NextResponse.json({ error: 'Failed to fetch shipments' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json() as { name?: string }
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    const shipment = await prisma.shipment.create({
      data: { name: name.trim() },
    })
    return NextResponse.json(shipment, { status: 201 })
  } catch (error) {
    console.error('[POST /api/shipments]', error)
    return NextResponse.json({ error: 'Failed to create shipment' }, { status: 500 })
  }
}
