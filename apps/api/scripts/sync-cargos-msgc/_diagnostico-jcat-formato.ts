import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const fa = await prisma.$queryRaw<{ codigo_cargo: string; id_sial_rol: string }[]>`
    SELECT codigo_cargo, id_sial_rol FROM fact_asignaciones WHERE codigo_cargo IS NOT NULL LIMIT 5
  `
  console.log('fact_asignaciones muestra:')
  for (const r of fa) console.log(' ', r.codigo_cargo, '|', r.id_sial_rol)

  const dc = await prisma.$queryRaw<{ codigo_cargo: string }[]>`
    SELECT codigo_cargo FROM dim_cargos LIMIT 5
  `
  console.log('\ndim_cargos muestra:')
  for (const r of dc) console.log(' ', r.codigo_cargo)

  const dp = await prisma.$queryRaw<{ id_sial_rol: string; jcat: string | null }[]>`
    SELECT id_sial_rol, jcat FROM dim_puestos WHERE jcat IS NOT NULL LIMIT 5
  `
  console.log('\ndim_puestos con jcat muestra:')
  for (const r of dp) console.log(' ', r.id_sial_rol, '|', r.jcat)

  // ¿dim_puestos.id_sial_rol matchea fact_asignaciones.id_sial_rol para los que tienen jcat?
  const cruce = await prisma.$queryRaw<{ fa_cargo: string; dp_rol: string; jcat: string }[]>`
    SELECT fa.codigo_cargo as fa_cargo, dp.id_sial_rol as dp_rol, dp.jcat
    FROM fact_asignaciones fa
    JOIN dim_puestos dp ON dp.id_sial_rol = fa.id_sial_rol
    WHERE dp.jcat IS NOT NULL
    LIMIT 5
  `
  console.log('\nfa→dp con jcat (muestra):')
  for (const r of cruce) console.log(' fa.codigo_cargo:', r.fa_cargo, '| dp.id_sial_rol:', r.dp_rol, '| jcat:', r.jcat)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
