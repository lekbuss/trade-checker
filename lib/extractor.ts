// lib/extractor.ts
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MODEL = 'claude-sonnet-4-20250514'

// ─── Prompt 定義 ──────────────────────────────────────────────────────

const PROMPTS: Record<string, string> = {
  INVOICE: `あなたは貿易文書のデータ抽出専門家です。
添付のInvoice（請求書）から以下の項目を抽出してください。
抽出項目：
- supplier_name: 発行元（サプライヤー）名
- consignee_name: 受取人名
- invoice_number: Invoice番号
- invoice_date: 発行日（YYYY-MM-DD形式）
- items: 商品リスト（配列）
  - description, hs_code, quantity, unit, unit_price, amount, country_of_origin
- total_amount: 合計金額
- currency: 通貨
- incoterm: インコタームズ
必ずJSON形式のみで返答してください。マークダウンのコードブロックや説明文は不要です。抽出できない項目はnullとしてください。`,

  PACKING_LIST: `あなたは貿易文書のデータ抽出専門家です。
添付のPacking List（梱包明細書）から以下の項目を抽出してください。
抽出項目：
- supplier_name, consignee_name, pl_number, pl_date
- items: 配列（description, quantity, unit, gross_weight_kg, net_weight_kg, volume_m3, cartons）
- total_gross_weight_kg, total_net_weight_kg, total_volume_m3, total_cartons
必ずJSON形式のみで返答してください。マークダウンのコードブロックや説明文は不要です。抽出できない項目はnullとしてください。`,

  BL: `あなたは貿易文書のデータ抽出専門家です。
添付のBill of Lading（船荷証券）から以下の項目を抽出してください。
抽出項目：
- bl_number, bl_date, shipper_name, consignee_name, notify_party
- vessel_name, voyage_number, port_of_loading, port_of_discharge, place_of_delivery
- items: 配列（description, quantity, gross_weight_kg, volume_m3）
- total_gross_weight_kg, total_volume_m3, freight_amount, freight_currency, freight_type
必ずJSON形式のみで返答してください。マークダウンのコードブロックや説明文は不要です。抽出できない項目はnullとしてください。`,

  ORIGIN_CERT: `あなたは貿易文書のデータ抽出専門家です。
添付の原産地証明書（Certificate of Origin / DUCA）から以下の項目を抽出してください。
抽出項目：
- cert_number, cert_date, exporter_name, importer_name
- items: 配列（line_number, description, hs_code, country_of_origin, quantity, unit, gross_weight_kg, transaction_value）
- total_gross_weight_kg, total_transaction_value, issuing_authority
必ずJSON形式のみで返答してください。マークダウンのコードブロックや説明文は不要です。抽出できない項目はnullとしてください。`,
}

// ─── レスポンスパーサー ────────────────────────────────────────────────

export function parseClaudeResponse(raw: string): Record<string, unknown> | null {
  try {
    const cleaned = raw
      .replace(/^```(?:json)?\n?/m, '')
      .replace(/\n?```$/m, '')
      .trim()
    if (!cleaned) return null
    return JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    return null
  }
}

// ─── 抽出関数 ─────────────────────────────────────────────────────────

export async function extractFromText(
  docType: string,
  text: string
): Promise<{ data: Record<string, unknown> | null; rawResponse: string }> {
  const prompt = PROMPTS[docType]
  if (!prompt) throw new Error(`Unknown docType: ${docType}`)

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'text', text: `\n\n---\n\n${text}` },
        ],
      },
    ],
  })

  const rawResponse = response.content[0].type === 'text' ? response.content[0].text : ''
  const data = parseClaudeResponse(rawResponse)
  return { data, rawResponse }
}

export async function extractFromImages(
  docType: string,
  base64Images: string[]
): Promise<{ data: Record<string, unknown> | null; rawResponse: string }> {
  const prompt = PROMPTS[docType]
  if (!prompt) throw new Error(`Unknown docType: ${docType}`)

  const imageContent = base64Images.map(b64 => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: 'image/jpeg' as const,
      data: b64,
    },
  }))

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          ...imageContent,
          { type: 'text', text: prompt },
        ],
      },
    ],
  })

  const rawResponse = response.content[0].type === 'text' ? response.content[0].text : ''
  const data = parseClaudeResponse(rawResponse)
  return { data, rawResponse }
}
