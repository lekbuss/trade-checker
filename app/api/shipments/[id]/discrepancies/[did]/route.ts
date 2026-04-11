import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; did: string }> }
) {
  try {
    const { id, did } = await params
    const { status } = await request.json() as { status?: string }
    if (status !== 'OPEN' && status !== 'RESOLVED') {
      return NextResponse.json({ error: 'status must be OPEN or RESOLVED' }, { status: 400 })
    }
    const discrepancy = await prisma.discrepancy.update({
      where: { id: did, shipmentId: id },
      data: { status },
    })
    return NextResponse.json(discrepancy)
  } catch (error) {
    console.error('[PATCH discrepancy]', error)
    return NextResponse.json({ error: 'Failed to update discrepancy' }, { status: 500 })
  }
}
