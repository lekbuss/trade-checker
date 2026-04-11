import { describe, it, expect } from 'vitest'
import { parseClaudeResponse } from '../extractor'

describe('parseClaudeResponse', () => {
  it('正常な JSON 文字列をパースできる', () => {
    const raw = '{"invoice_number": "INV-001", "total_amount": 1000}'
    expect(parseClaudeResponse(raw)).toEqual({ invoice_number: 'INV-001', total_amount: 1000 })
  })

  it('マークダウンコードブロック（json）を除去してパースできる', () => {
    const raw = '```json\n{"invoice_number": "INV-001"}\n```'
    expect(parseClaudeResponse(raw)).toEqual({ invoice_number: 'INV-001' })
  })

  it('マークダウンコードブロック（無ラベル）を除去してパースできる', () => {
    const raw = '```\n{"invoice_number": "INV-002"}\n```'
    expect(parseClaudeResponse(raw)).toEqual({ invoice_number: 'INV-002' })
  })

  it('不正な JSON の場合は null を返す', () => {
    expect(parseClaudeResponse('not json')).toBeNull()
  })

  it('空文字列は null を返す', () => {
    expect(parseClaudeResponse('')).toBeNull()
  })
})
