import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const residuos = await prisma.$queryRaw<{ id_sial_rol: string; escalafon: string | null; codigo_registro: string }[]>`
    SELECT id_sial_rol, escalafon, codigo_registro
    FROM dim_puestos
    WHERE escalafon IS NULL OR escalafon = 'planta transitoria'
    ORDER BY escalafon, codigo_registro
  `
  for (const r of residuos)
    console.log(`  ${r.id_sial_rol} | escalafon="${r.escalafon}" | cod_reg="${r.codigo_registro}"`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
