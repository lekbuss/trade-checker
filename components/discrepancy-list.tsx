'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface Discrepancy {
  id: string
  fieldName: string
  docA: string
  docB: string
  valueA: string
  valueB: string
  severity: 'FATAL' | 'MINOR'
  correctionNote: string | null
  status: 'OPEN' | 'RESOLVED'
}

export function DiscrepancyList({
  discrepancies,
  shipmentId,
}: {
  discrepancies: Discrepancy[]
  shipmentId: string
}) {
  const [items, setItems] = useState(discrepancies)

  const toggleStatus = async (did: string, current: 'OPEN' | 'RESOLVED') => {
    const next = current === 'OPEN' ? 'RESOLVED' : 'OPEN'
    const res = await fetch(`/api/shipments/${shipmentId}/discrepancies/${did}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === did ? { ...i, status: next } : i))
    }
  }

  if (items.length === 0) {
    return <p className="text-green-600 text-sm py-4">差異は検出されませんでした ✓</p>
  }

  return (
    <div className="space-y-3">
      {items.map((d) => (
        <div
          key={d.id}
          className={`border-l-4 p-4 rounded-r bg-white shadow-sm ${
            d.severity === 'FATAL' ? 'border-red-500' : 'border-yellow-400'
          }`}
        >
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={d.severity === 'FATAL' ? 'destructive' : 'secondary'}>
                {d.severity}
              </Badge>
              <span className="font-mono text-sm font-semibold">{d.fieldName}</span>
              <span className="text-gray-500 text-xs">{d.docA} × {d.docB}</span>
            </div>
            <Button
              size="sm"
              variant={d.status === 'RESOLVED' ? 'outline' : 'default'}
              onClick={() => toggleStatus(d.id, d.status)}
            >
              {d.status === 'RESOLVED' ? '再オープン' : '解決済みにする'}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm mb-2">
            <div className="bg-red-50 p-2 rounded">
              <span className="text-xs text-gray-500">{d.docA}</span>
              <p className="font-medium break-all">{d.valueA}</p>
            </div>
            <div className="bg-blue-50 p-2 rounded">
              <span className="text-xs text-gray-500">{d.docB}</span>
              <p className="font-medium break-all">{d.valueB}</p>
            </div>
          </div>
          {d.correctionNote && (
            <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded">{d.correctionNote}</p>
          )}
        </div>
      ))}
    </div>
  )
}
