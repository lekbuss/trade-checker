'use client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function ExtractedJsonDialog({ docType, data }: { docType: string; data: unknown }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        抽出結果を見る
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{docType} 抽出データ</DialogTitle>
        </DialogHeader>
        <pre className="text-xs bg-gray-50 p-4 rounded overflow-auto whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </pre>
      </DialogContent>
    </Dialog>
  )
}
