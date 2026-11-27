import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // nombre_cargo en dim_cargos que no matchean con puestos_cargo
  const sinMatch = await prisma.$queryRaw<{
    codigo_registro: string; nombre_cargo: string; n: bigint
  }[]>`
    SELECT
      dc.codigo_registro,
      dc.nombre_cargo,
      COUNT(*) AS n
    FROM dim_cargos dc
    WHERE dc.nombre_cargo IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM puestos_cargo pc
        JOIN escalafones e ON e.id = pc.escalafon_id
        JOIN codigos_registro cr ON cr.escalafon_id = e.id AND cr.codigo = dc.codigo_registro
        WHERE lower(unaccent(pc.nombre)) = lower(unaccent(dc.nombre_cargo))
      )
    GROUP BY dc.codigo_registro, dc.nombre_cargo
    ORDER BY n DESC, dc.codigo_registro, dc.nombre_cargo
  `

  const total = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM dim_cargos WHERE nombre_cargo IS NOT NULL
  `
  const sinNombre = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM dim_cargos WHERE nombre_cargo IS NULL
  `

  console.log(`\ndim_cargos: ${total[0].n} con nombre_cargo | ${sinNombre[0].n} sin nombre_cargo`)
  console.log(`Sin match en puestos_cargo: ${sinMatch.length} combinaciones distintas\n`)

  if (sinMatch.length === 0) {
    console.log('✓ Todos los nombre_cargo de dim_cargos tienen match en puestos_cargo')
    return
  }

  console.log(`${'CR'.padEnd(8)} ${'N'.padStart(6)}  NOMBRE_CARGO`)
  console.log('─'.repeat(70))
  for (const r of sinMatch) {
    console.log(`${r.codigo_registro.padEnd(8)} ${String(r.n).padStart(6)}  ${r.nombre_cargo}`)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
