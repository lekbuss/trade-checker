import { describe, it, expect } from 'vitest'
import { compareValues, runRuleEngine } from '../rule-engine'
import type { ExtractedDocuments } from '../rule-engine'

describe('compareValues', () => {
  it('exact: 同じ値は差異なし', () => {
    expect(compareValues('8471.30', '8471.30', 'exact', {})).toBe(false)
  })

  it('exact: 異なる値は差異あり', () => {
    expect(compareValues('8471.30', '8471.31', 'exact', {})).toBe(true)
  })

  it('percentage: 閾値内は差異なし', () => {
    // 100 vs 100.4 → diff 0.4/100.4 = 0.398% < 0.5%
    expect(compareValues('100', '100.4', 'percentage', { threshold: 0.005 })).toBe(false)
  })

  it('percentage: 閾値超えは差異あり', () => {
    // 100 vs 101 → diff 1/101 = 0.99% > 0.5%
    expect(compareValues('100', '101', 'percentage', { threshold: 0.005 })).toBe(true)
  })

  it('absolute: 閾値内は差異なし', () => {
    expect(compareValues('10', '11', 'absolute', { threshold: 1 })).toBe(false)
  })

  it('absolute: 閾値超えは差異あり', () => {
    expect(compareValues('10', '12', 'absolute', { threshold: 1 })).toBe(true)
  })

  it('片方が null の場合は差異あり', () => {
    expect(compareValues(null, '100', 'exact', {})).toBe(true)
  })

  it('両方 null の場合は差異なし', () => {
    expect(compareValues(null, null, 'exact', {})).toBe(false)
  })
})

describe('runRuleEngine', () => {
  const mockRules = [
    { fieldName: 'total_gross_weight_kg', ruleType: 'percentage', ruleValue: { threshold: 0.005 } },
    { fieldName: 'total_volume_m3',       ruleType: 'percentage', ruleValue: { threshold: 0.01  } },
    { fieldName: 'total_amount',          ruleType: 'percentage', ruleValue: { threshold: 0.005 } },
    { fieldName: 'quantity',              ruleType: 'absolute',   ruleValue: { threshold: 1     } },
    { fieldName: 'hs_code',               ruleType: 'exact',      ruleValue: {}                   },
    { fieldName: 'country_of_origin',     ruleType: 'exact',      ruleValue: {}                   },
  ]

  const baseDocuments: ExtractedDocuments = {
    INVOICE: {
      supplier_name: 'ABC Corp',
      consignee_name: 'XYZ Ltd',
      invoice_number: 'INV-001',
      invoice_date: '2024-01-01',
      items: [{ description: 'Widget A', hs_code: '8471.30', quantity: 100, unit: 'PCS', unit_price: 10, amount: 1000, country_of_origin: 'Japan' }],
      total_amount: 1000,
      currency: 'USD',
      incoterm: 'FOB',
    },
    PACKING_LIST: {
      supplier_name: 'ABC Corp',
      consignee_name: 'XYZ Ltd',
      pl_number: 'PL-001',
      pl_date: '2024-01-01',
      items: [{ description: 'Widget A', quantity: 100, unit: 'PCS', gross_weight_kg: 500, net_weight_kg: 450, volume_m3: 1.0, cartons: 10 }],
      total_gross_weight_kg: 500,
      total_net_weight_kg: 450,
      total_volume_m3: 1.0,
      total_cartons: 10,
    },
    BL: {
      bl_number: 'BL-001',
      bl_date: '2024-01-01',
      shipper_name: 'ABC Corp',
      consignee_name: 'XYZ Ltd',
      notify_party: null,
      vessel_name: 'MV Test',
      voyage_number: 'V001',
      port_of_loading: 'Tokyo',
      port_of_discharge: 'Los Angeles',
      place_of_delivery: 'Los Angeles',
      items: [{ description: 'Widget A', quantity: 10, gross_weight_kg: 500, volume_m3: 1.0 }],
      total_gross_weight_kg: 500,
      total_volume_m3: 1.0,
      freight_amount: null,
      freight_currency: null,
      freight_type: 'PREPAID',
    },
    ORIGIN_CERT: {
      cert_number: 'OC-001',
      cert_date: '2024-01-01',
      exporter_name: 'ABC Corp',
      importer_name: 'XYZ Ltd',
      items: [{ line_number: 1, description: 'Widget A', hs_code: '8471.30', country_of_origin: 'Japan', quantity: 100, unit: 'PCS', gross_weight_kg: 500, transaction_value: 1000 }],
      total_gross_weight_kg: 500,
      total_transaction_value: 1000,
      issuing_authority: 'Japan Chamber',
    },
  }

  it('全データ一致の場合は差異なし', async () => {
    const result = await runRuleEngine(baseDocuments, mockRules)
    expect(result).toHaveLength(0)
  })

  it('HS コード不一致は FATAL', async () => {
    const docs: ExtractedDocuments = {
      ...baseDocuments,
      ORIGIN_CERT: {
        ...baseDocuments.ORIGIN_CERT!,
        items: [{ ...baseDocuments.ORIGIN_CERT!.items[0], hs_code: '9999.99' }],
      },
    }
    const result = await runRuleEngine(docs, mockRules)
    const hsDiscrepancy = result.find(d => d.fieldName === 'hs_code')
    expect(hsDiscrepancy).toBeDefined()
    expect(hsDiscrepancy?.severity).toBe('FATAL')
  })

  it('重量が容許誤差内は差異なし', async () => {
    const docs: ExtractedDocuments = {
      ...baseDocuments,
      BL: { ...baseDocuments.BL!, total_gross_weight_kg: 502 }, // 0.4% diff < 0.5%
    }
    const result = await runRuleEngine(docs, mockRules)
    const weightDiscrepancy = result.find(
      d => d.fieldName === 'total_gross_weight_kg' && d.docA === 'BL' && d.docB === 'PACKING_LIST'
    )
    expect(weightDiscrepancy).toBeUndefined()
  })

  it('country_of_origin 不一致は FATAL', async () => {
    const docs: ExtractedDocuments = {
      ...baseDocuments,
      ORIGIN_CERT: {
        ...baseDocuments.ORIGIN_CERT!,
        items: [{ ...baseDocuments.ORIGIN_CERT!.items[0], country_of_origin: 'China' }],
      },
    }
    const result = await runRuleEngine(docs, mockRules)
    const coDiscrepancy = result.find(d => d.fieldName === 'country_of_origin')
    expect(coDiscrepancy).toBeDefined()
    expect(coDiscrepancy?.severity).toBe('FATAL')
  })
})
