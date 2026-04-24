import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-20250514'

export interface DocForGrouping {
  id: string
  docType: string
  extractedData: Record<string, unknown> | null
}

export interface GroupingResult {
  groups: Array<{ groupKey: string; docIds: string[] }>
  unmatched: string[]
}

function extractKeyFields(docType: string, data: Record<string, unknown> | null): unknown {
  if (!data) return null
  switch (docType) {
    case 'INVOICE':
      return {
        invoice_number: data.invoice_number,
        supplier_name: data.supplier_name,
        consignee_name: data.consignee_name,
        invoice_date: data.invoice_date,
        total_amount: data.total_amount,
        currency: data.currency,
      }
    case 'PACKING_LIST':
      return {
        pl_number: data.pl_number,
        supplier_name: data.supplier_name,
        consignee_name: data.consignee_name,
        pl_date: data.pl_date,
      }
    case 'BL':
      return {
        bl_number: data.bl_number,
        shipper_name: data.shipper_name,
        consignee_name: data.consignee_name,
        bl_date: data.bl_date,
        port_of_loading: data.port_of_loading,
        port_of_discharge: data.port_of_discharge,
      }
    case 'ORIGIN_CERT':
      return {
        cert_number: data.cert_number,
        exporter_name: data.exporter_name,
        importer_name: data.importer_name,
        cert_date: data.cert_date,
      }
    default:
      return data
  }
}

export async function groupDocuments(docs: DocForGrouping[]): Promise<GroupingResult> {
  if (docs.length === 0) return { groups: [], unmatched: [] }
  if (docs.length === 1) return { groups: [], unmatched: [docs[0].id] }

  // If all docs are the same type, no cross-comparison is possible
  const types = new Set(docs.map(d => d.docType))
  if (types.size === 1) return { groups: [], unmatched: docs.map(d => d.id) }

  const docSummaries = docs.map(d => ({
    id: d.id,
    docType: d.docType,
    keyData: extractKeyFields(d.docType, d.extractedData),
  }))

  const prompt = `あなたは貿易書類のマッチング専門家です。以下の書類リストを分析し、同一貨物に関する書類をグループ化してください。

マッチング基準（重要度順）：
1. 参照番号の一致（Invoice番号、BL番号、PL番号が互いに言及している場合）
2. 荷送人名・荷受人名の一致（表記ゆれ・略称は同一とみなす）
3. 金額・数量・品名の一致
4. 日付の近さ（同月以内）

ルール：
- 同一グループに同じ書類種別を2枚以上含めないこと
- 他の書類と一致しない書類は "unmatched" に入れる
- グループには必ず2種類以上の異なる書類種別が必要

書類データ：
${JSON.stringify(docSummaries, null, 2)}

JSONのみで返答してください：
{
  "groups": [
    { "groupKey": "group_1", "docIds": ["id1", "id2"] }
  ],
  "unmatched": ["id3"]
}`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
  const cleaned = rawText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()

  try {
    const parsed = JSON.parse(cleaned) as GroupingResult
    // Validate that all docIds are real
    const allIds = new Set(docs.map(d => d.id))
    const groupedIds = new Set(parsed.groups.flatMap(g => g.docIds))
    const unmatchedIds = new Set(parsed.unmatched)

    // Any doc not in groups or unmatched → add to unmatched
    for (const doc of docs) {
      if (!groupedIds.has(doc.id) && !unmatchedIds.has(doc.id)) {
        parsed.unmatched.push(doc.id)
      }
    }

    // Remove any invalid IDs
    parsed.groups = parsed.groups
      .map(g => ({ ...g, docIds: g.docIds.filter(id => allIds.has(id)) }))
      .filter(g => g.docIds.length >= 2)

    return parsed
  } catch {
    // Fallback: all unmatched
    return { groups: [], unmatched: docs.map(d => d.id) }
  }
}
