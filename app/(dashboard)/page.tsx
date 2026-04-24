'use client'
import { useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type DocType = 'INVOICE' | 'PACKING_LIST' | 'BL' | 'ORIGIN_CERT'

const DOC_LABELS: Record<DocType, string> = {
  INVOICE:      'Invoice（請求書）',
  PACKING_LIST: 'Packing List（梱包明細）',
  BL:           'Bill of Lading（船荷証券）',
  ORIGIN_CERT:  '原産地証明書',
}

type UploadItem = {
  id: string
  file: File
  status: 'ready' | 'uploading' | 'done' | 'error'
  detectedType?: DocType
  errorMsg?: string
}

export default function HomePage() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [batchName, setBatchName] = useState('')
  const [items, setItems] = useState<UploadItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [step, setStep] = useState('')
  const [error, setError] = useState<string | null>(null)

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const arr = Array.from(fileList)
    setItems(prev => [
      ...prev,
      ...arr.map(f => ({ id: crypto.randomUUID(), file: f, status: 'ready' as const })),
    ])
  }, [])

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id))

  const canSubmit = items.length >= 2 && batchName.trim().length > 0 && !processing

  const handleSubmit = async () => {
    if (!canSubmit) return
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

      setStep('ファイルをアップロード・種別検出中…')
      for (const item of items) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'uploading' } : i))
        const fd = new FormData()
        fd.append('file', item.file)
        fd.append('shipmentId', shipment.id)
        // docType は送らない → サーバー側で AI が自動判定
        try {
          const res = await fetch('/api/documents/upload', { method: 'POST', body: fd })
          if (!res.ok) throw new Error('upload failed')
          const result = await res.json() as { detectedType?: DocType }
          setItems(prev => prev.map(i =>
            i.id === item.id ? { ...i, status: 'done', detectedType: result.detectedType } : i
          ))
        } catch {
          setItems(prev => prev.map(i =>
            i.id === item.id ? { ...i, status: 'error', errorMsg: 'アップロード失敗' } : i
          ))
        }
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

          {/* 単一アップロードゾーン */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              processing
                ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                : isDragging
                  ? 'border-blue-500 bg-blue-50 cursor-pointer'
                  : 'border-gray-300 hover:border-gray-400 cursor-pointer'
            }`}
            onClick={() => !processing && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); if (!processing) setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragging(false)
              if (!processing) addFiles(e.dataTransfer.files)
            }}
          >
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.xlsx,.xls,.eml"
              onChange={(e) => { if (e.target.files) addFiles(e.target.files) }}
              disabled={processing}
            />
            <p className="text-gray-500 text-sm font-medium">書類をドラッグ＆ドロップ、またはクリックして選択</p>
            <p className="text-gray-400 text-xs mt-1">
              PDF・Excel・メール対応 ／ 複数選択可 ／ AIが種別を自動判定
            </p>
          </div>

          {/* アップロード済みファイル一覧 */}
          {items.length > 0 && (
            <ul className="space-y-2">
              {items.map(item => (
                <li key={item.id} className="flex items-center gap-3 text-sm px-3 py-2 bg-gray-50 rounded-lg border">
                  <span className="flex-1 truncate text-gray-700">{item.file.name}</span>
                  {item.status === 'ready' && (
                    <span className="text-gray-400 text-xs shrink-0">待機中</span>
                  )}
                  {item.status === 'uploading' && (
                    <span className="text-blue-500 text-xs shrink-0">種別検出中…</span>
                  )}
                  {item.status === 'done' && item.detectedType && (
                    <span className="text-green-600 text-xs font-medium shrink-0">
                      ✓ {DOC_LABELS[item.detectedType]}
                    </span>
                  )}
                  {item.status === 'error' && (
                    <span className="text-red-500 text-xs shrink-0">{item.errorMsg}</span>
                  )}
                  {!processing && item.status === 'ready' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeItem(item.id) }}
                      className="text-gray-300 hover:text-gray-500 text-xs shrink-0 leading-none"
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p className="text-red-600 text-sm bg-red-50 p-3 rounded">{error}</p>
          )}

          {processing && (
            <div className="text-center py-2">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mb-2" />
              <p className="text-sm text-gray-600">{step}</p>
            </div>
          )}

          {items.length === 1 && !processing && (
            <p className="text-amber-600 text-xs text-center">あと1件以上追加してください</p>
          )}

          <Button
            className="w-full"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            処理を開始する
          </Button>

        </CardContent>
      </Card>
    </div>
  )
}
