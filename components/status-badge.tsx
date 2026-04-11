'use client'
import { Badge } from '@/components/ui/badge'

type Status = 'PENDING' | 'PROCESSING' | 'DONE' | 'ERROR'

const statusConfig: Record<Status, { label: string; variant: 'secondary' | 'default' | 'outline' | 'destructive' }> = {
  PENDING:    { label: '待機中',   variant: 'secondary'   },
  PROCESSING: { label: '処理中',   variant: 'default'     },
  DONE:       { label: '完了',     variant: 'outline'     },
  ERROR:      { label: 'エラー',   variant: 'destructive' },
}

export function StatusBadge({ status }: { status: Status }) {
  const config = statusConfig[status] ?? statusConfig.PENDING
  return <Badge variant={config.variant}>{config.label}</Badge>
}
