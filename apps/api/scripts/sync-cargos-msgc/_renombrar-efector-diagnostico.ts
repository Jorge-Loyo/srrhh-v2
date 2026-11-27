import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE dim_puestos RENAME COLUMN hospital_sigla TO efector
  `)
  console.log('✓ Columna renombrada: hospital_sigla → efector')

  const stats = await prisma.$queryRaw<{ total: bigint; con_efector: bigint; sin_efector: bigint }[]>`
    SELECT COUNT(*) as total,
           COUNT(efector) as con_efector,
           COUNT(*) - COUNT(efector) as sin_efector
    FROM dim_puestos
  `
  const s = stats[0]
  console.log(`\nTotal:       ${s.total}`)
  console.log(`Con efector: ${s.con_efector}`)
  console.log(`Sin efector: ${s.sin_efector}`)

  if (s.sin_efector > 0n) {
    const porCarrera = await prisma.$queryRaw<{ lit_cod_reg: string; q: bigint }[]>`
      SELECT dc.lit_cod_reg, COUNT(*) as q
      FROM dim_puestos dp
      JOIN dim_carreras dc ON dc.codigo_registro = dp.codigo_registro
      WHERE dp.efector IS NULL
      GROUP BY dc.lit_cod_reg
      ORDER BY q DESC
    `
    console.log('\n── Sin efector por carrera ───────────────────────────────')
    for (const r of porCarrera) console.log(`  "${r.lit_cod_reg}": ${r.q}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
