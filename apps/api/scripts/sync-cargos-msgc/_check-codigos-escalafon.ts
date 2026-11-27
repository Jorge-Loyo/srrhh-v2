import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Verificar codigos 85 y 87
  const check = await prisma.$queryRaw<{ codigo: string; literal: string; escalafon: string }[]>`
    SELECT cr.codigo, cr.literal, e.nombre as escalafon
    FROM codigos_registro cr
    JOIN escalafones e ON e.id = cr.escalafon_id
    WHERE cr.codigo IN ('85','87','83','19','22','37')
    ORDER BY cr.codigo
  `
  console.log('── codigos_registro relevantes ──────────────────────────')
  for (const r of check) console.log(`  ${r.codigo} | literal="${r.literal}" | escalafon="${r.escalafon}"`)

  // Muestra de los "ceetps" con codigo 85
  const muestra = await prisma.$queryRaw<{ id_sial_rol: string; escalafon: string; codigo_registro: string }[]>`
    SELECT id_sial_rol, escalafon, codigo_registro
    FROM dim_puestos
    WHERE codigo_registro = '85'
    LIMIT 5
  `
  console.log('\n── Muestra dim_puestos con codigo_registro=85 ───────────')
  for (const r of muestra) console.log(`  ${r.id_sial_rol} | escalafon="${r.escalafon}" | cod=${r.codigo_registro}`)

  // Muestra de los con codigo 87
  const muestra87 = await prisma.$queryRaw<{ id_sial_rol: string; escalafon: string; codigo_registro: string }[]>`
    SELECT id_sial_rol, escalafon, codigo_registro
    FROM dim_puestos
    WHERE codigo_registro = '87'
    LIMIT 5
  `
  console.log('\n── Muestra dim_puestos con codigo_registro=87 ───────────')
  for (const r of muestra87) console.log(`  ${r.id_sial_rol} | escalafon="${r.escalafon}" | cod=${r.codigo_registro}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
