import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Puestos existentes en el catálogo por escalafón
  const enCatalogo = await prisma.$queryRaw<{ escalafon: string; n: bigint }[]>`
    SELECT e.codigo AS escalafon, COUNT(*) AS n
    FROM puestos_cargo pc
    JOIN escalafones e ON e.id = pc.escalafon_id
    GROUP BY e.codigo ORDER BY e.codigo
  `
  console.log('\n── Puestos en catálogo (puestos_cargo) por escalafón ──')
  for (const r of enCatalogo) console.log(`  ${r.escalafon.padEnd(15)} ${r.n} puestos`)

  // Puestos distintos activos en dim_puestos por escalafón
  const enDim = await prisma.$queryRaw<{ escalafon: string; n: bigint }[]>`
    SELECT dc.escalafon, COUNT(DISTINCT dp.literal_puesto) AS n
    FROM dim_puestos dp
    JOIN dim_carreras dc ON dc.codigo_registro = dp.codigo_registro
    WHERE dp.literal_puesto IS NOT NULL AND dp.puesto_hasta IS NULL
    GROUP BY dc.escalafon ORDER BY dc.escalafon
  `
  console.log('\n── Puestos distintos activos en dim_puestos por escalafón ──')
  for (const r of enDim) console.log(`  ${r.escalafon.padEnd(15)} ${r.n} puestos distintos`)

  // Cuántos puestos de dim_puestos SÍ matchean (para ver cobertura)
  const conMatch = await prisma.$queryRaw<{ escalafon: string; con_match: bigint; sin_match: bigint }[]>`
    SELECT
      dc.escalafon,
      COUNT(DISTINCT dp.literal_puesto) FILTER (WHERE EXISTS (
        SELECT 1 FROM puestos_cargo pc
        JOIN escalafones e ON e.id = pc.escalafon_id
        WHERE e.codigo = dc.escalafon
          AND lower(unaccent(pc.nombre)) = lower(unaccent(dp.literal_puesto))
      )) AS con_match,
      COUNT(DISTINCT dp.literal_puesto) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM puestos_cargo pc
        JOIN escalafones e ON e.id = pc.escalafon_id
        WHERE e.codigo = dc.escalafon
          AND lower(unaccent(pc.nombre)) = lower(unaccent(dp.literal_puesto))
      )) AS sin_match
    FROM dim_puestos dp
    JOIN dim_carreras dc ON dc.codigo_registro = dp.codigo_registro
    WHERE dp.literal_puesto IS NOT NULL AND dp.puesto_hasta IS NULL
    GROUP BY dc.escalafon ORDER BY dc.escalafon
  `
  console.log('\n── Cobertura por escalafón (puestos distintos activos) ──')
  console.log(`${'ESCALAFON'.padEnd(15)} ${'CON MATCH'.padStart(10)} ${'SIN MATCH'.padStart(10)}`)
  console.log('─'.repeat(38))
  for (const r of conMatch) {
    const total = Number(r.con_match) + Number(r.sin_match)
    const pct = Math.round(Number(r.con_match) / total * 100)
    console.log(`  ${r.escalafon.padEnd(13)} ${String(r.con_match).padStart(10)} ${String(r.sin_match).padStart(10)}  (${pct}%)`)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
