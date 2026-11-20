import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const stats = await prisma.$queryRaw<{ total: bigint; con: bigint; sin: bigint }[]>`
    SELECT COUNT(*) as total, COUNT(doc_respald_alta) as con,
           COUNT(*) - COUNT(doc_respald_alta) as sin
    FROM dim_puestos
  `
  const s = stats[0]
  console.log(`Total:             ${s.total}`)
  console.log(`Con doc_respald_alta: ${s.con}`)
  console.log(`Sin doc_respald_alta: ${s.sin}`)

  if (s.sin > 0n) {
    // ¿Los sin doc_respald_alta están en el CSV de cargos activos?
    const porPadron = await prisma.$queryRaw<{ padron_exist: Date | null; bajas_exist: Date | null; q: bigint }[]>`
      SELECT padron_exist, bajas_exist, COUNT(*) as q
      FROM dim_puestos
      WHERE doc_respald_alta IS NULL
      GROUP BY padron_exist, bajas_exist
      ORDER BY q DESC
    `
    console.log('\n── Sin doc_respald_alta: ¿en qué padrón están? ─────────')
    for (const r of porPadron)
      console.log(`  padron_exist=${r.padron_exist?.toISOString().slice(0,10) ?? 'NULL'} | bajas_exist=${r.bajas_exist?.toISOString().slice(0,10) ?? 'NULL'}: ${r.q}`)

    // Por carrera
    const porCarrera = await prisma.$queryRaw<{ lit_cod_reg: string; q: bigint }[]>`
      SELECT dc.lit_cod_reg, COUNT(*) as q
      FROM dim_puestos dp
      JOIN dim_carreras dc ON dc.codigo_registro = dp.codigo_registro
      WHERE dp.doc_respald_alta IS NULL
      GROUP BY dc.lit_cod_reg
      ORDER BY q DESC
    `
    console.log('\n── Sin doc_respald_alta por carrera ─────────────────────')
    for (const r of porCarrera) console.log(`  "${r.lit_cod_reg}": ${r.q}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
