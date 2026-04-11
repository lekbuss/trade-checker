'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Label } from '@/components/ui/label'

interface Shipment { id: string; name: string }

export default function ExportPage() {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    fetch('/api/shipments')
      .then(r => r.json())
      .then(data => setShipments(data as Shipment[]))
      .catch(console.error)
  }, [])

  const download = (format: 'json' | 'csv') => {
    if (!selectedId) return
    window.location.href = `/api/export/${selectedId}?format=${format}`
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-6">エクスポート</h1>
      <Card>
        <CardHeader>
          <CardTitle>バッチを選択してダウンロード</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>バッチ</Label>
            <Select onValueChange={(v) => setSelectedId(v ?? '')} value={selectedId}>
              <SelectTrigger>
                <SelectValue placeholder="バッチを選択してください" />
              </SelectTrigger>
              <SelectContent>
                {shipments.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3 flex-wrap">
            <Button variant="outline" disabled={!selectedId} onClick={() => download('json')}>
              JSON ダウンロード
            </Button>
            <Button variant="outline" disabled={!selectedId} onClick={() => download('csv')}>
              CSV ダウンロード
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger render={<span />}>
                  <Button disabled variant="secondary">NASSC 連携</Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>接口対接中（実装予定）</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
