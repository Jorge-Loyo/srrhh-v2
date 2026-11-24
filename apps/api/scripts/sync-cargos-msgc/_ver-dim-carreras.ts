import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.$queryRaw<{ codigo_registro: string; lit_cod_reg: string; escalafon: string | null }[]>`
    SELECT codigo_registro, lit_cod_reg, escalafon FROM dim_carreras ORDER BY codigo_registro
  `
  console.log(`${'CR'.padEnd(6)} ${'ESCALAFON'.padEnd(55)} LIT_COD_REG`)
  console.log('─'.repeat(120))
  for (const r of rows)
    console.log(`${r.codigo_registro.padEnd(6)} ${(r.escalafon ?? '').padEnd(55)} ${r.lit_cod_reg}`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
