// lib/claude.ts
import Anthropic from '@anthropic-ai/sdk'
import type { DiscrepancyResult } from './rule-engine'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MODEL = 'claude-sonnet-4-20250514'

export async function generateCorrectionNotes(
  discrepancies: DiscrepancyResult[]
): Promise<string[]> {
  if (discrepancies.length === 0) return []

  const discrepanciesJson = JSON.stringify(
    discrepancies.map((d, i) => ({
      id: i,
      fieldName: d.fieldName,
      docA: d.docA,
      docB: d.docB,
      valueA: d.valueA,
      valueB: d.valueB,
      severity: d.severity,
    })),
    null,
    2
  )

  const prompt = `あなたは貿易書類の専門家です。
以下の差異情報をもとに、担当者が即座に対応できる修正指示を日本語で生成してください。

差異データ：
${discrepanciesJson}

各差異について以下を含む修正指示をJSON配列で返してください。
フォーマット：
[
  {
    "id": 0,
    "instruction": "差異の内容、影響、具体的な修正手順、優先度（FATAL/MINOR）を含む簡潔な修正指示"
  }
]

必ずJSON配列のみで返答してください。マークダウンのコードブロックや説明文は不要です。`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const cleaned = rawText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()

  try {
    const parsed: Array<{ id: number; instruction: string }> = JSON.parse(cleaned)
    return discrepancies.map((_, i) => {
      const found = parsed.find(p => p.id === i)
      return found?.instruction ?? '修正指示の生成に失敗しました。'
    })
  } catch {
    return discrepancies.map(() => '修正指示の生成に失敗しました。')
  }
}
