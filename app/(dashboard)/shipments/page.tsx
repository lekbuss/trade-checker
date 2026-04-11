import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'

export const dynamic = 'force-dynamic'

export default async function ShipmentsPage() {
  const shipments = await prisma.shipment.findMany({
    orderBy: { createdAt: 'desc' },
    include: { discrepancies: { select: { severity: true } } },
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">バッチ一覧</h1>
        <Button render={<Link href="/" />}>新規作成</Button>
      </div>
      <div className="bg-white rounded-lg shadow-sm border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>バッチ名</TableHead>
              <TableHead>ステータス</TableHead>
              <TableHead className="text-red-600">FATAL</TableHead>
              <TableHead className="text-yellow-600">MINOR</TableHead>
              <TableHead>作成日時</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shipments.map((s) => {
              const fatalCount = s.discrepancies.filter(d => d.severity === 'FATAL').length
              const minorCount = s.discrepancies.filter(d => d.severity === 'MINOR').length
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                  <TableCell>
                    {fatalCount > 0 ? <span className="text-red-600 font-bold">{fatalCount}</span> : '—'}
                  </TableCell>
                  <TableCell>
                    {minorCount > 0 ? <span className="text-yellow-600 font-bold">{minorCount}</span> : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {new Date(s.createdAt).toLocaleString('ja-JP')}
                  </TableCell>
                  <TableCell>
                    <Button render={<Link href={`/shipments/${s.id}`} />} variant="outline" size="sm">詳細</Button>
                  </TableCell>
                </TableRow>
              )
            })}
            {shipments.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-400 py-8">
                  バッチがありません
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
