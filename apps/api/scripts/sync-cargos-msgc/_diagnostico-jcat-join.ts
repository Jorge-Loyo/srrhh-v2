import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // ¿fact_asignaciones.codigo_cargo matchea dim_cargos.codigo_cargo?
  const matchCargo = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) as n
    FROM fact_asignaciones fa
    JOIN dim_cargos dc ON dc.codigo_cargo = fa.codigo_cargo
  `
  console.log('fact_asignaciones con match en dim_cargos:', matchCargo[0].n)

  // ¿fact_asignaciones.id_sial_rol matchea dim_puestos.id_sial_rol?
  const matchPuesto = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) as n
    FROM fact_asignaciones fa
    JOIN dim_puestos dp ON dp.id_sial_rol = fa.id_sial_rol
  `
  console.log('fact_asignaciones con match en dim_puestos:', matchPuesto[0].n)

  // Join completo: dim_cargos → fact_asignaciones → dim_puestos con jcat
  const joinCompleto = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) as n
    FROM dim_cargos dc
    JOIN fact_asignaciones fa ON fa.codigo_cargo = dc.codigo_cargo
    JOIN dim_puestos dp       ON dp.id_sial_rol  = fa.id_sial_rol
    WHERE dp.jcat IS NOT NULL
  `
  console.log('join completo dc→fa→dp con jcat:', joinCompleto[0].n)

  // Muestra de jcats que aparecen
  const muestra = await prisma.$queryRaw<{ codigo_registro: string; nombre_cargo: string; jcat: string; n: bigint }[]>`
    SELECT dc.codigo_registro, dc.nombre_cargo, dp.jcat, COUNT(*) as n
    FROM dim_cargos dc
    JOIN fact_asignaciones fa ON fa.codigo_cargo = dc.codigo_cargo
    JOIN dim_puestos dp       ON dp.id_sial_rol  = fa.id_sial_rol
    WHERE dp.jcat IS NOT NULL
    GROUP BY dc.codigo_registro, dc.nombre_cargo, dp.jcat
    ORDER BY n DESC
    LIMIT 20
  `
  console.log('\nMuestra (top 20 por frecuencia):')
  console.log('CR'.padEnd(6), 'JCAT'.padEnd(8), 'N'.padStart(6), ' NOMBRE_CARGO')
  console.log('─'.repeat(80))
  for (const r of muestra)
    console.log(r.codigo_registro.padEnd(6), r.jcat.padEnd(8), String(r.n).padStart(6), ' ', r.nombre_cargo)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
