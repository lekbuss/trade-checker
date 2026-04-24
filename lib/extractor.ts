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

// ─── 文書種別自動検出 ──────────────────────────────────────────────────

const VALID_DOC_TYPES = ['INVOICE', 'PACKING_LIST', 'BL', 'ORIGIN_CERT'] as const
export type DetectableDocType = typeof VALID_DOC_TYPES[number]

const DETECT_PROMPT = `あなたは貿易文書の分類専門家です。提供された文書を読み、以下の4種類のうちどれに該当するかを判定してください。

種類の定義：
- INVOICE: 商業インボイス（請求書）。商品の価格・数量・合計金額・インコタームズ等が記載。
- PACKING_LIST: 梱包明細書。重量・体積・梱包数・カートン数等が記載。
- BL: 船荷証券（Bill of Lading）。船名・航次・積港・揚港・荷送人・荷受人等が記載。
- ORIGIN_CERT: 原産地証明書（Certificate of Origin）。原産国・HSコード・発給機関等が記載。

必ずJSONのみで返答してください（例）：{"docType": "INVOICE"}`

export async function detectDocType(
  text: string,
  images: string[]
): Promise<DetectableDocType> {
  type ImageBlock = { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } }
  type TextBlock = { type: 'text'; text: string }
  let content: Array<ImageBlock | TextBlock>

  if (images.length > 0) {
    content = [
      ...images.slice(0, 2).map(b64 => ({
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: b64 },
      })),
      { type: 'text' as const, text: DETECT_PROMPT },
    ]
  } else {
    content = [
      { type: 'text' as const, text: DETECT_PROMPT },
      { type: 'text' as const, text: `\n\n---\n\n${text.slice(0, 3000)}` },
    ]
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 64,
    messages: [{ role: 'user', content }],
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
  const cleaned = rawText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()

  try {
    const parsed = JSON.parse(cleaned) as { docType: string }
    if ((VALID_DOC_TYPES as readonly string[]).includes(parsed.docType)) {
      return parsed.docType as DetectableDocType
    }
  } catch { /* ignore */ }

  return 'INVOICE'
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
