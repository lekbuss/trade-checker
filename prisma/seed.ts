import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/trade_checker'
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  const rules = [
    { fieldName: 'total_gross_weight_kg', ruleType: 'percentage', ruleValue: { threshold: 0.005 } },
    { fieldName: 'total_volume_m3',       ruleType: 'percentage', ruleValue: { threshold: 0.01  } },
    { fieldName: 'total_amount',          ruleType: 'percentage', ruleValue: { threshold: 0.005 } },
    { fieldName: 'quantity',              ruleType: 'absolute',   ruleValue: { threshold: 1     } },
    { fieldName: 'hs_code',               ruleType: 'exact',      ruleValue: {}                   },
    { fieldName: 'country_of_origin',     ruleType: 'exact',      ruleValue: {}                   },
  ]

  for (const rule of rules) {
    await prisma.toleranceRule.upsert({
      where: { fieldName: rule.fieldName },
      update: rule,
      create: rule,
    })
  }

  console.log('Seeded', rules.length, 'tolerance rules.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
