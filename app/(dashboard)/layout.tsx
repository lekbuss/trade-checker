import Link from 'next/link'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
          <span className="font-bold text-lg">Trade Checker</span>
          <nav className="flex gap-4 text-sm">
            <Link href="/" className="text-gray-600 hover:text-black transition-colors">アップロード</Link>
            <Link href="/shipments" className="text-gray-600 hover:text-black transition-colors">バッチ一覧</Link>
            <Link href="/export" className="text-gray-600 hover:text-black transition-colors">エクスポート</Link>
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
