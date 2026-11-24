import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Puestos distintos activos en dim_puestos sin match en puestos_cargo
  // Join correcto: dim_carreras.escalafon = escalafones.nombre
  const sinMatch = await prisma.$queryRaw<{
    escalafon: string; literal_puesto: string; codigo_registro: string; n: bigint
  }[]>`
    SELECT
      dc.escalafon,
      dp.literal_puesto,
      dp.codigo_registro,
      COUNT(*) AS n
    FROM dim_puestos dp
    JOIN dim_carreras dc ON dc.codigo_registro = dp.codigo_registro
    WHERE dp.literal_puesto IS NOT NULL
      AND dp.puesto_hasta IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM puestos_cargo pc
        JOIN escalafones e ON e.id = pc.escalafon_id
        WHERE e.nombre = dc.escalafon
          AND lower(unaccent(pc.nombre)) = lower(unaccent(dp.literal_puesto))
      )
    GROUP BY dc.escalafon, dp.literal_puesto, dp.codigo_registro
    ORDER BY n DESC, dc.escalafon, dp.literal_puesto
  `

  console.log(`\nPuestos activos en dim_puestos sin match en puestos_cargo: ${sinMatch.length} combinaciones distintas\n`)
  console.log(`${'CR'.padEnd(6)} ${'ESCALAFON'.padEnd(12)} ${'N'.padStart(6)}  LITERAL_PUESTO`)
  console.log('─'.repeat(80))
  for (const r of sinMatch) {
    console.log(`${r.codigo_registro.padEnd(6)} ${r.escalafon.padEnd(12)} ${String(r.n).padStart(6)}  ${r.literal_puesto}`)
  }

  // Cobertura por escalafón
  const cobertura = await prisma.$queryRaw<{ escalafon: string; con_match: bigint; sin_match: bigint }[]>`
    SELECT
      dc.escalafon,
      COUNT(DISTINCT dp.literal_puesto) FILTER (WHERE EXISTS (
        SELECT 1 FROM puestos_cargo pc
        JOIN escalafones e ON e.id = pc.escalafon_id
        WHERE e.nombre = dc.escalafon
          AND lower(unaccent(pc.nombre)) = lower(unaccent(dp.literal_puesto))
      )) AS con_match,
      COUNT(DISTINCT dp.literal_puesto) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM puestos_cargo pc
        JOIN escalafones e ON e.id = pc.escalafon_id
        WHERE e.nombre = dc.escalafon
          AND lower(unaccent(pc.nombre)) = lower(unaccent(dp.literal_puesto))
      )) AS sin_match
    FROM dim_puestos dp
    JOIN dim_carreras dc ON dc.codigo_registro = dp.codigo_registro
    WHERE dp.literal_puesto IS NOT NULL AND dp.puesto_hasta IS NULL
    GROUP BY dc.escalafon ORDER BY dc.escalafon
  `
  console.log(`\n── Cobertura por escalafón ──`)
  console.log(`${'ESCALAFON'.padEnd(45)} ${'CON'.padStart(6)} ${'SIN'.padStart(6)}  %`)
  console.log('─'.repeat(62))
  let totalCon = 0, totalSin = 0
  for (const r of cobertura) {
    const con = Number(r.con_match), sin = Number(r.sin_match)
    const pct = con + sin > 0 ? Math.round(con / (con + sin) * 100) : 0
    totalCon += con; totalSin += sin
    console.log(`  ${r.escalafon.padEnd(43)} ${String(con).padStart(6)} ${String(sin).padStart(6)}  ${pct}%`)
  }
  const pctTotal = Math.round(totalCon / (totalCon + totalSin) * 100)
  console.log(`  ${'TOTAL'.padEnd(43)} ${String(totalCon).padStart(6)} ${String(totalSin).padStart(6)}  ${pctTotal}%`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
