// lib/rule-engine.ts
import { prisma } from './prisma'

// ─── 型定義 ────────────────────────────────────────────────────────────

export interface InvoiceItem {
  description: string | null
  hs_code: string | null
  quantity: number | null
  unit: string | null
  unit_price: number | null
  amount: number | null
  country_of_origin: string | null
}

export interface InvoiceData {
  supplier_name: string | null
  consignee_name: string | null
  invoice_number: string | null
  invoice_date: string | null
  items: InvoiceItem[]
  total_amount: number | null
  currency: string | null
  incoterm: string | null
}

export interface PackingListItem {
  description: string | null
  quantity: number | null
  unit: string | null
  gross_weight_kg: number | null
  net_weight_kg: number | null
  volume_m3: number | null
  cartons: number | null
}

export interface PackingListData {
  supplier_name: string | null
  consignee_name: string | null
  pl_number: string | null
  pl_date: string | null
  items: PackingListItem[]
  total_gross_weight_kg: number | null
  total_net_weight_kg: number | null
  total_volume_m3: number | null
  total_cartons: number | null
}

export interface BLItem {
  description: string | null
  quantity: number | null
  gross_weight_kg: number | null
  volume_m3: number | null
}

export interface BLData {
  bl_number: string | null
  bl_date: string | null
  shipper_name: string | null
  consignee_name: string | null
  notify_party: string | null
  vessel_name: string | null
  voyage_number: string | null
  port_of_loading: string | null
  port_of_discharge: string | null
  place_of_delivery: string | null
  items: BLItem[]
  total_gross_weight_kg: number | null
  total_volume_m3: number | null
  freight_amount: number | null
  freight_currency: string | null
  freight_type: string | null
}

export interface OriginCertItem {
  line_number: number | null
  description: string | null
  hs_code: string | null
  country_of_origin: string | null
  quantity: number | null
  unit: string | null
  gross_weight_kg: number | null
  transaction_value: number | null
}

export interface OriginCertData {
  cert_number: string | null
  cert_date: string | null
  exporter_name: string | null
  importer_name: string | null
  items: OriginCertItem[]
  total_gross_weight_kg: number | null
  total_transaction_value: number | null
  issuing_authority: string | null
}

export interface ExtractedDocuments {
  INVOICE?: InvoiceData | null
  PACKING_LIST?: PackingListData | null
  BL?: BLData | null
  ORIGIN_CERT?: OriginCertData | null
}

export interface DiscrepancyResult {
  fieldName: string
  docA: 'INVOICE' | 'PACKING_LIST' | 'BL' | 'ORIGIN_CERT'
  docB: 'INVOICE' | 'PACKING_LIST' | 'BL' | 'ORIGIN_CERT'
  valueA: string
  valueB: string
  severity: 'FATAL' | 'MINOR'
}

// ─── 比較ロジック ────────────────────────────────────────────────

export function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  ruleType: string,
  ruleValue: Record<string, number>
): boolean {
  const aNull = a === null || a === undefined
  const bNull = b === null || b === undefined
  if (aNull && bNull) return false
  if (aNull || bNull) return true

  if (ruleType === 'exact') {
    return String(a).trim() !== String(b).trim()
  }

  const numA = Number(a)
  const numB = Number(b)
  if (isNaN(numA) || isNaN(numB)) {
    return String(a).trim() !== String(b).trim()
  }

  const diff = Math.abs(numA - numB)

  if (ruleType === 'percentage') {
    const base = Math.max(Math.abs(numA), Math.abs(numB))
    if (base === 0) return false
    return diff / base > (ruleValue.threshold ?? 0)
  }

  if (ruleType === 'absolute') {
    return diff > (ruleValue.threshold ?? 0)
  }

  return String(a).trim() !== String(b).trim()
}

// ─── 重大度判定 ─────────────────────────────────────────────────────

const FATAL_FIELDS = new Set(['hs_code', 'country_of_origin', 'total_amount'])

function getSeverity(fieldName: string): 'FATAL' | 'MINOR' {
  return FATAL_FIELDS.has(fieldName) ? 'FATAL' : 'MINOR'
}

// ─── ルールエンジン本体 ──────────────────────────────────────────────

export async function runRuleEngine(
  docs: ExtractedDocuments,
  toleranceRules?: Array<{ fieldName: string; ruleType: string; ruleValue: unknown }>
): Promise<DiscrepancyResult[]> {
  const rules = toleranceRules ?? await prisma.toleranceRule.findMany()
  const ruleMap = new Map(rules.map(r => [r.fieldName, r]))

  const getRule = (fieldName: string) =>
    ruleMap.get(fieldName) ?? { ruleType: 'exact', ruleValue: {} as Record<string, number> }

  const discrepancies: DiscrepancyResult[] = []

  function check(
    fieldName: string,
    valueA: string | number | null | undefined,
    valueB: string | number | null | undefined,
    docA: DiscrepancyResult['docA'],
    docB: DiscrepancyResult['docB']
  ) {
    const rule = getRule(fieldName)
    if (compareValues(valueA, valueB, rule.ruleType, rule.ruleValue as Record<string, number>)) {
      discrepancies.push({
        fieldName,
        docA,
        docB,
        valueA: valueA !== null && valueA !== undefined ? String(valueA) : 'null',
        valueB: valueB !== null && valueB !== undefined ? String(valueB) : 'null',
        severity: getSeverity(fieldName),
      })
    }
  }

  const inv = docs.INVOICE
  const pl = docs.PACKING_LIST
  const bl = docs.BL
  const oc = docs.ORIGIN_CERT

  // INVOICE × PACKING_LIST
  if (inv && pl) {
    const invItem = inv.items?.[0]
    const plItem = pl.items?.[0]
    if (invItem && plItem) {
      check('description', invItem.description, plItem.description, 'INVOICE', 'PACKING_LIST')
      check('quantity', invItem.quantity, plItem.quantity, 'INVOICE', 'PACKING_LIST')
    }
  }

  // INVOICE × BL
  if (inv && bl) {
    check('supplier_name', inv.supplier_name, bl.shipper_name, 'INVOICE', 'BL')
  }

  // INVOICE × ORIGIN_CERT
  if (inv && oc) {
    const invItem = inv.items?.[0]
    const ocItem = oc.items?.[0]
    if (invItem && ocItem) {
      check('hs_code', invItem.hs_code, ocItem.hs_code, 'INVOICE', 'ORIGIN_CERT')
      check('country_of_origin', invItem.country_of_origin, ocItem.country_of_origin, 'INVOICE', 'ORIGIN_CERT')
      check('description', invItem.description, ocItem.description, 'INVOICE', 'ORIGIN_CERT')
    }
    check('total_amount', inv.total_amount, oc.total_transaction_value, 'INVOICE', 'ORIGIN_CERT')
  }

  // BL × PACKING_LIST
  if (bl && pl) {
    check('total_gross_weight_kg', bl.total_gross_weight_kg, pl.total_gross_weight_kg, 'BL', 'PACKING_LIST')
    check('total_volume_m3', bl.total_volume_m3, pl.total_volume_m3, 'BL', 'PACKING_LIST')
    check('total_cartons', bl.items?.[0]?.quantity, pl.total_cartons, 'BL', 'PACKING_LIST')
  }

  return discrepancies
}
