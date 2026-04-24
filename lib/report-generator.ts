import type { DocType, DocStatus, Severity, DiscrepancyStatus, ShipmentStatus, FileType } from '@prisma/client'

const DOC_LABELS: Record<DocType, string> = {
  INVOICE:      'Invoice（請求書）',
  PACKING_LIST: 'Packing List（梱包明細）',
  BL:           'Bill of Lading（船荷証券）',
  ORIGIN_CERT:  '原産地証明書',
}

interface ReportDocument {
  id: string
  docType: DocType
  fileType: FileType
  filePath: string
  status: DocStatus
  groupKey: string | null
}

interface ReportDiscrepancy {
  id: string
  groupKey: string | null
  fieldName: string
  docA: DocType
  docB: DocType
  valueA: string
  valueB: string
  severity: Severity
  correctionNote: string | null
  status: DiscrepancyStatus
}

interface ReportShipment {
  id: string
  name: string
  status: ShipmentStatus
  createdAt: Date
  documents: ReportDocument[]
  discrepancies: ReportDiscrepancy[]
}

function getGroups(shipment: ReportShipment) {
  const matchedMap = new Map<string, ReportDocument[]>()
  const unmatched: ReportDocument[] = []

  for (const doc of shipment.documents) {
    if (!doc.groupKey || doc.groupKey === 'UNMATCHED') {
      unmatched.push(doc)
    } else {
      const arr = matchedMap.get(doc.groupKey) ?? []
      arr.push(doc)
      matchedMap.set(doc.groupKey, arr)
    }
  }

  const matched = Array.from(matchedMap.entries()).map(([groupKey, docs]) => ({ groupKey, docs }))
  return { matched, unmatched }
}

function filename(filePath: string) {
  return filePath.split('/').pop() ?? filePath
}

export function generateMarkdownReport(shipment: ReportShipment): string {
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
  const { matched, unmatched } = getGroups(shipment)

  const fatalCount = shipment.discrepancies.filter(d => d.severity === 'FATAL' && d.groupKey !== 'UNMATCHED').length
  const minorCount = shipment.discrepancies.filter(d => d.severity === 'MINOR' && d.groupKey !== 'UNMATCHED').length

  let md = `# 貿易書類核対レポート\n\n`
  md += `| 項目 | 内容 |\n|------|------|\n`
  md += `| バッチ名 | ${shipment.name} |\n`
  md += `| 生成日時 | ${now} |\n`
  md += `| ステータス | ${shipment.status} |\n\n`
  md += `---\n\n`

  // Summary
  md += `## サマリー\n\n`
  md += `| 項目 | 件数 |\n|------|------|\n`
  md += `| アップロード書類数 | ${shipment.documents.length}件 |\n`
  md += `| マッチンググループ | ${matched.length}件 |\n`
  md += `| 未マッチ書類 | ${unmatched.length}件 |\n`
  md += `| FATAL差異 | **${fatalCount}件** |\n`
  md += `| MINOR差異 | ${minorCount}件 |\n\n`
  md += `---\n\n`

  // Matched groups
  for (const group of matched) {
    const groupDiscrepancies = shipment.discrepancies.filter(
      d => d.groupKey === group.groupKey && group.groupKey !== 'UNMATCHED'
    )
    const fatal = groupDiscrepancies.filter(d => d.severity === 'FATAL')
    const minor = groupDiscrepancies.filter(d => d.severity === 'MINOR')

    md += `## グループ: ${group.groupKey}\n\n`
    md += `**構成書類：** ${group.docs.map(d => DOC_LABELS[d.docType]).join('、')}\n\n`
    md += `| 書類種別 | ファイル名 | ステータス |\n|---------|----------|----------|\n`
    for (const doc of group.docs) {
      md += `| ${DOC_LABELS[doc.docType]} | \`${filename(doc.filePath)}\` | ${doc.status} |\n`
    }
    md += `\n`

    if (groupDiscrepancies.length === 0) {
      md += `✅ **差異なし** — すべての書類項目が一致しています。\n\n`
    } else {
      if (fatal.length > 0) {
        md += `### 🔴 FATAL差異（${fatal.length}件）\n\n`
        for (const d of fatal) {
          md += `#### ${d.fieldName}\n\n`
          md += `- **比較対象：** ${DOC_LABELS[d.docA]} ↔ ${DOC_LABELS[d.docB]}\n`
          md += `- **${DOC_LABELS[d.docA]}の値：** \`${d.valueA}\`\n`
          md += `- **${DOC_LABELS[d.docB]}の値：** \`${d.valueB}\`\n`
          if (d.correctionNote) md += `- **修正指示：** ${d.correctionNote}\n`
          md += `\n`
        }
      }
      if (minor.length > 0) {
        md += `### 🟡 MINOR差異（${minor.length}件）\n\n`
        for (const d of minor) {
          md += `#### ${d.fieldName}\n\n`
          md += `- **比較対象：** ${DOC_LABELS[d.docA]} ↔ ${DOC_LABELS[d.docB]}\n`
          md += `- **${DOC_LABELS[d.docA]}の値：** \`${d.valueA}\`\n`
          md += `- **${DOC_LABELS[d.docB]}の値：** \`${d.valueB}\`\n`
          if (d.correctionNote) md += `- **修正指示：** ${d.correctionNote}\n`
          md += `\n`
        }
      }
    }
    md += `---\n\n`
  }

  // Unmatched
  if (unmatched.length > 0) {
    md += `## ⚠️ 未マッチ書類（${unmatched.length}件）\n\n`
    md += `以下の書類は対応する書類が見つからなかったため、核対できませんでした。\n\n`
    md += `| 書類種別 | ファイル名 |\n|---------|----------|\n`
    for (const doc of unmatched) {
      md += `| ${DOC_LABELS[doc.docType]} | \`${filename(doc.filePath)}\` |\n`
    }
    md += `\n`
  }

  return md
}

export function generateHtmlReport(shipment: ReportShipment): string {
  const md = generateMarkdownReport(shipment)
  const { matched, unmatched } = getGroups(shipment)
  const fatalCount = shipment.discrepancies.filter(d => d.severity === 'FATAL' && d.groupKey !== 'UNMATCHED').length
  const minorCount = shipment.discrepancies.filter(d => d.severity === 'MINOR' && d.groupKey !== 'UNMATCHED').length
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })

  const escHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const renderDiscrepancies = (discrepancies: ReportDiscrepancy[]) => {
    if (discrepancies.length === 0) {
      return `<p class="no-diff">✅ 差異なし — すべての書類項目が一致しています。</p>`
    }
    const fatal = discrepancies.filter(d => d.severity === 'FATAL')
    const minor = discrepancies.filter(d => d.severity === 'MINOR')
    let html = ''
    if (fatal.length > 0) {
      html += `<h4 class="fatal-heading">🔴 FATAL差異（${fatal.length}件）</h4>`
      for (const d of fatal) {
        html += `<div class="diff-card fatal">
          <div class="diff-field">${escHtml(d.fieldName)}</div>
          <div class="diff-pair">${escHtml(DOC_LABELS[d.docA])} <span class="arrow">↔</span> ${escHtml(DOC_LABELS[d.docB])}</div>
          <table class="diff-table"><tr><th>${escHtml(DOC_LABELS[d.docA])}</th><th>${escHtml(DOC_LABELS[d.docB])}</th></tr>
          <tr><td><code>${escHtml(d.valueA)}</code></td><td><code>${escHtml(d.valueB)}</code></td></tr></table>
          ${d.correctionNote ? `<div class="correction"><strong>修正指示：</strong> ${escHtml(d.correctionNote)}</div>` : ''}
        </div>`
      }
    }
    if (minor.length > 0) {
      html += `<h4 class="minor-heading">🟡 MINOR差異（${minor.length}件）</h4>`
      for (const d of minor) {
        html += `<div class="diff-card minor">
          <div class="diff-field">${escHtml(d.fieldName)}</div>
          <div class="diff-pair">${escHtml(DOC_LABELS[d.docA])} <span class="arrow">↔</span> ${escHtml(DOC_LABELS[d.docB])}</div>
          <table class="diff-table"><tr><th>${escHtml(DOC_LABELS[d.docA])}</th><th>${escHtml(DOC_LABELS[d.docB])}</th></tr>
          <tr><td><code>${escHtml(d.valueA)}</code></td><td><code>${escHtml(d.valueB)}</code></td></tr></table>
          ${d.correctionNote ? `<div class="correction"><strong>修正指示：</strong> ${escHtml(d.correctionNote)}</div>` : ''}
        </div>`
      }
    }
    return html
  }

  const groupSections = matched.map(group => {
    const groupDiscs = shipment.discrepancies.filter(d => d.groupKey === group.groupKey && d.groupKey !== 'UNMATCHED')
    const docsTable = group.docs.map(doc =>
      `<tr><td>${escHtml(DOC_LABELS[doc.docType])}</td><td><code>${escHtml(filename(doc.filePath))}</code></td><td>${escHtml(doc.status)}</td></tr>`
    ).join('')
    return `
      <section class="group-section">
        <h3>グループ: ${escHtml(group.groupKey)}</h3>
        <p><strong>構成書類：</strong>${group.docs.map(d => escHtml(DOC_LABELS[d.docType])).join('、')}</p>
        <table class="doc-table"><thead><tr><th>書類種別</th><th>ファイル名</th><th>ステータス</th></tr></thead>
        <tbody>${docsTable}</tbody></table>
        ${renderDiscrepancies(groupDiscs)}
      </section>`
  }).join('')

  const unmatchedSection = unmatched.length > 0 ? `
    <section class="group-section unmatched">
      <h3>⚠️ 未マッチ書類（${unmatched.length}件）</h3>
      <p>以下の書類は対応する書類が見つからなかったため、核対できませんでした。</p>
      <table class="doc-table"><thead><tr><th>書類種別</th><th>ファイル名</th></tr></thead>
      <tbody>${unmatched.map(doc =>
        `<tr><td>${escHtml(DOC_LABELS[doc.docType])}</td><td><code>${escHtml(filename(doc.filePath))}</code></td></tr>`
      ).join('')}</tbody></table>
    </section>` : ''

  // Suppress unused variable warning
  void md

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>核対レポート — ${escHtml(shipment.name)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', sans-serif; font-size: 13px; color: #1a1a1a; background: #fff; padding: 32px; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 16px; margin: 24px 0 10px; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; }
  h3 { font-size: 14px; margin: 16px 0 8px; color: #374151; }
  h4 { font-size: 13px; margin: 14px 0 6px; }
  .meta { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
  .meta span { margin-right: 16px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
  th { background: #f3f4f6; padding: 6px 10px; text-align: left; border: 1px solid #e5e7eb; font-weight: 600; }
  td { padding: 6px 10px; border: 1px solid #e5e7eb; }
  code { background: #f1f5f9; padding: 1px 5px; border-radius: 3px; font-family: monospace; font-size: 11px; }
  .summary-table { max-width: 340px; }
  .group-section { margin: 20px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; }
  .unmatched { border-color: #fbbf24; background: #fffbeb; }
  .no-diff { color: #16a34a; margin: 10px 0; font-weight: 500; }
  .fatal-heading { color: #dc2626; margin: 12px 0 6px; }
  .minor-heading { color: #d97706; margin: 12px 0 6px; }
  .diff-card { margin: 8px 0; padding: 10px 12px; border-radius: 6px; border-left: 4px solid; }
  .diff-card.fatal { border-color: #dc2626; background: #fef2f2; }
  .diff-card.minor { border-color: #d97706; background: #fffbeb; }
  .diff-field { font-weight: 700; font-size: 13px; margin-bottom: 4px; }
  .diff-pair { font-size: 11px; color: #6b7280; margin-bottom: 6px; }
  .arrow { margin: 0 6px; }
  .diff-table { margin: 6px 0 8px; }
  .correction { font-size: 12px; color: #374151; margin-top: 6px; padding: 6px 8px; background: #f9fafb; border-radius: 4px; }
  .print-btn { position: fixed; top: 20px; right: 20px; background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
  .print-btn:hover { background: #1d4ed8; }
  @media print {
    .print-btn { display: none; }
    body { padding: 16px; }
    .group-section { break-inside: avoid; }
    @page { margin: 20mm; size: A4; }
  }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">PDF で保存</button>
<h1>貿易書類核対レポート</h1>
<div class="meta">
  <span><strong>バッチ名：</strong>${escHtml(shipment.name)}</span>
  <span><strong>生成日時：</strong>${now}</span>
  <span><strong>ステータス：</strong>${escHtml(shipment.status)}</span>
</div>

<h2>サマリー</h2>
<table class="summary-table">
  <tr><th>アップロード書類数</th><td>${shipment.documents.length}件</td></tr>
  <tr><th>マッチンググループ</th><td>${matched.length}件</td></tr>
  <tr><th>未マッチ書類</th><td>${unmatched.length}件</td></tr>
  <tr><th>FATAL差異</th><td style="color:#dc2626;font-weight:700">${fatalCount}件</td></tr>
  <tr><th>MINOR差異</th><td>${minorCount}件</td></tr>
</table>

<h2>グループ別核対結果</h2>
${groupSections}
${unmatchedSection}
</body>
</html>`
}
