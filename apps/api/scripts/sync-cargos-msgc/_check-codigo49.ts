import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // ¿Existe 49 en codigos_registro?
  const existe49 = await prisma.$queryRaw<{ codigo: string; literal: string; escalafon: string }[]>`
    SELECT cr.codigo, cr.literal, e.nombre as escalafon
    FROM codigos_registro cr
    JOIN escalafones e ON e.id = cr.escalafon_id
    WHERE cr.codigo IN ('49', '16T')
  `
  console.log('── codigos_registro 49 y 16T en el sistema ──────────────')
  if (existe49.length === 0) console.log('  Ninguno encontrado')
  else for (const r of existe49) console.log(`  ${r.codigo} | "${r.literal}" | escalafon="${r.escalafon}"`)

  // Los 3 puestos con codigo 49
  const puestos49 = await prisma.$queryRaw<{ id_sial_rol: string; escalafon: string; codigo_registro: string; puesto_hasta: Date | null }[]>`
    SELECT id_sial_rol, escalafon, codigo_registro, puesto_hasta
    FROM dim_puestos
    WHERE codigo_registro = '49'
  `
  console.log('\n── dim_puestos con codigo_registro=49 ───────────────────')
  for (const r of puestos49) console.log(`  ${r.id_sial_rol} | escalafon="${r.escalafon}" | hasta=${r.puesto_hasta ?? 'activo'}`)

  // ¿Aparecen en el CSV de bajas con qué LIT_COD_REG?
  console.log('\n── En el padrón (buscar en Bajas) estos id_sial_rol ─────')
  console.log('  (verificar manualmente en el CSV si tienen LIT_COD_REG para 49)')

  // Los 3 con "planta transitoria" y su codigo
  const plantaT = await prisma.$queryRaw<{ id_sial_rol: string; escalafon: string; codigo_registro: string; puesto_hasta: Date | null }[]>`
    SELECT id_sial_rol, escalafon, codigo_registro, puesto_hasta
    FROM dim_puestos
    WHERE escalafon = 'planta transitoria'
  `
  console.log('\n── dim_puestos con escalafon="planta transitoria" ───────')
  for (const r of plantaT) console.log(`  ${r.id_sial_rol} | cod_reg="${r.codigo_registro}" | hasta=${r.puesto_hasta ?? 'activo'}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
