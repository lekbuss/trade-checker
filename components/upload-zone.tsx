'use client'
import { useRef, useState } from 'react'
import { Card } from '@/components/ui/card'

interface UploadZoneProps {
  docType: 'INVOICE' | 'PACKING_LIST' | 'BL' | 'ORIGIN_CERT'
  onFileSelect: (file: File) => void
}

const DOC_LABELS: Record<string, string> = {
  INVOICE:      'Invoice（請求書）',
  PACKING_LIST: 'Packing List（梱包明細）',
  BL:           'Bill of Lading（船荷証券）',
  ORIGIN_CERT:  '原産地証明書',
}

export function UploadZone({ docType, onFileSelect }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFile = (file: File) => {
    setFileName(file.name)
    onFileSelect(file)
  }

  return (
    <Card
      className={`p-4 border-2 border-dashed cursor-pointer transition-colors ${
        isDragging ? 'border-blue-500 bg-blue-50' : fileName ? 'border-green-500 bg-green-50' : 'border-gray-300'
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) handleFile(file)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.xlsx,.xls,.eml"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
      <div className="text-center">
        <p className="font-medium text-sm">{DOC_LABELS[docType]}</p>
        {fileName ? (
          <p className="text-green-600 text-xs mt-1 truncate max-w-[200px] mx-auto">{fileName}</p>
        ) : (
          <p className="text-gray-400 text-xs mt-1">クリックまたはドラッグ＆ドロップ</p>
        )}
      </div>
    </Card>
  )
}
