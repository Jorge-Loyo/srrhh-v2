import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const stats = await prisma.$queryRaw<{ total: bigint; con_literal: bigint; sin_literal: bigint; vacios: bigint }[]>`
    SELECT
      COUNT(*) as total,
      COUNT(literal_puesto) as con_literal,
      COUNT(*) - COUNT(literal_puesto) as sin_literal,
      COUNT(*) FILTER (WHERE literal_puesto = '') as vacios
    FROM dim_puestos
  `
  const s = stats[0]
  console.log(`Total:        ${s.total}`)
  console.log(`Con literal:  ${s.con_literal}`)
  console.log(`Sin literal:  ${s.sin_literal}`)
  console.log(`Vacíos '':    ${s.vacios}`)

  if (s.sin_literal > 0n || s.vacios > 0n) {
    const porCarrera = await prisma.$queryRaw<{ lit_cod_reg: string; q: bigint }[]>`
      SELECT dc.lit_cod_reg, COUNT(*) as q
      FROM dim_puestos dp
      JOIN dim_carreras dc ON dc.codigo_registro = dp.codigo_registro
      WHERE dp.literal_puesto IS NULL OR dp.literal_puesto = ''
      GROUP BY dc.lit_cod_reg
      ORDER BY q DESC
    `
    console.log('\n── Sin literal_puesto por carrera ───────────────────────')
    for (const r of porCarrera) console.log(`  "${r.lit_cod_reg}": ${r.q}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
