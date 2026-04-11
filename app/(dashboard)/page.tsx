'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { UploadZone } from '@/components/upload-zone'

type DocType = 'INVOICE' | 'PACKING_LIST' | 'BL' | 'ORIGIN_CERT'
const DOC_TYPES: DocType[] = ['INVOICE', 'PACKING_LIST', 'BL', 'ORIGIN_CERT']

export default function HomePage() {
  const router = useRouter()
  const [batchName, setBatchName] = useState('')
  const [files, setFiles] = useState<Partial<Record<DocType, File>>>({})
  const [processing, setProcessing] = useState(false)
  const [step, setStep] = useState('')
  const [error, setError] = useState<string | null>(null)

  const allUploaded = DOC_TYPES.every(t => files[t])

  const handleSubmit = async () => {
    if (!batchName.trim() || !allUploaded) return
    setProcessing(true)
    setError(null)

    try {
      setStep('バッチを作成中…')
      const shipmentRes = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: batchName }),
      })
      if (!shipmentRes.ok) throw new Error('バッチ作成に失敗しました')
      const shipment = await shipmentRes.json() as { id: string }

      setStep('ファイルをアップロード中…')
      for (const docType of DOC_TYPES) {
        const file = files[docType]!
        const fd = new FormData()
        fd.append('file', file)
        fd.append('shipmentId', shipment.id)
        fd.append('docType', docType)
        const res = await fetch('/api/documents/upload', { method: 'POST', body: fd })
        if (!res.ok) throw new Error(`${docType} のアップロードに失敗しました`)
      }

      setStep('AIが書類を分析中…（しばらくお待ちください）')
      const processRes = await fetch(`/api/process/${shipment.id}`, { method: 'POST' })
      if (!processRes.ok) throw new Error('処理に失敗しました')

      router.push(`/shipments/${shipment.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '予期せぬエラーが発生しました')
      setProcessing(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>新規バッチ作成</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="batch-name">バッチ名</Label>
            <Input
              id="batch-name"
              placeholder="例：2024-01 ABC Corp 輸入便"
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              disabled={processing}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {DOC_TYPES.map(docType => (
              <UploadZone
                key={docType}
                docType={docType}
                onFileSelect={(file) => setFiles(prev => ({ ...prev, [docType]: file }))}
              />
            ))}
          </div>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 p-3 rounded">{error}</p>
          )}

          {processing && (
            <div className="text-center py-4">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2" />
              <p className="text-sm text-gray-600">{step}</p>
            </div>
          )}

          <Button
            className="w-full"
            disabled={!batchName.trim() || !allUploaded || processing}
            onClick={handleSubmit}
          >
            処理を開始する
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
