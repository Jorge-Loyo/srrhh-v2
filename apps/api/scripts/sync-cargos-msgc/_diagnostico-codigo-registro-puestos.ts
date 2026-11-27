// Diagnóstico: por qué codigo_registro quedó en 0 en dim_puestos
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Muestra de id_sial_rol en dim_puestos y su primera parte
  const muestraPuestos = await prisma.$queryRaw<{ id_sial_rol: string; parte1: string }[]>`
    SELECT id_sial_rol, split_part(id_sial_rol, '-', 1) as parte1
    FROM dim_puestos LIMIT 5
  `
  console.log('── dim_puestos: id_sial_rol y split_part(1) ─────────────')
  for (const r of muestraPuestos) console.log(`  "${r.id_sial_rol}" → parte1="${r.parte1}"`)

  // Muestra de id_sial en cargos
  const muestraCargos = await prisma.$queryRaw<{ id_sial: string }[]>`
    SELECT id_sial FROM cargos WHERE id_sial IS NOT NULL LIMIT 5
  `
  console.log('\n── cargos: id_sial ──────────────────────────────────────')
  for (const r of muestraCargos) console.log(`  "${r.id_sial}"`)

  // ¿Hay match directo id_sial_rol = cargos.id_sial?
  const matchDirecto = await prisma.$queryRaw<{ q: bigint }[]>`
    SELECT COUNT(*) as q FROM dim_puestos dp
    JOIN cargos c ON c.id_sial = dp.id_sial_rol
  `
  console.log(`\n── Match directo id_sial_rol = cargos.id_sial: ${matchDirecto[0].q}`)

  // ¿Hay match via id_sial en cargos con la parte1?
  const matchParte1 = await prisma.$queryRaw<{ q: bigint }[]>`
    SELECT COUNT(*) as q FROM dim_puestos dp
    JOIN cargos c ON c.id_sial = split_part(dp.id_sial_rol, '-', 1)
  `
  console.log(`── Match parte1 = cargos.id_sial: ${matchParte1[0].q}`)

  // ¿Cargos tiene codigo_registro_id poblado?
  const conCodReg = await prisma.$queryRaw<{ q: bigint }[]>`
    SELECT COUNT(*) as q FROM cargos WHERE codigo_registro_id IS NOT NULL
  `
  console.log(`── cargos con codigo_registro_id: ${conCodReg[0].q}`)

  // Alternativa: cruzar via fact_asignaciones
  const matchFact = await prisma.$queryRaw<{ q: bigint }[]>`
    SELECT COUNT(DISTINCT dp.id_sial_rol) as q
    FROM dim_puestos dp
    JOIN fact_asignaciones fa ON fa.id_sial_rol = dp.id_sial_rol
    JOIN cargos c ON c.codigo = fa.codigo_cargo
    WHERE c.codigo_registro_id IS NOT NULL
  `
  console.log(`── Match via fact_asignaciones → cargos.codigo: ${matchFact[0].q}`)

  // Alternativa: cruzar via dim_cargos que ya tiene codigo_registro
  const matchDimCargos = await prisma.$queryRaw<{ q: bigint }[]>`
    SELECT COUNT(DISTINCT dp.id_sial_rol) as q
    FROM dim_puestos dp
    JOIN fact_asignaciones fa ON fa.id_sial_rol = dp.id_sial_rol
    JOIN dim_cargos dc ON dc.codigo_cargo = fa.codigo_cargo
    WHERE dc.codigo_registro IS NOT NULL
  `
  console.log(`── Match via fact_asignaciones → dim_cargos.codigo_registro: ${matchDimCargos[0].q}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
