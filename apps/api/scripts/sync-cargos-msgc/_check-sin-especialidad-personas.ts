import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Cruzar via id_sial → dim_puestos → dim_carreras
  const porCarrera = await prisma.$queryRaw<{ carrera: string; q: bigint }[]>`
    SELECT COALESCE(dc.lit_cod_reg, 'sin puesto') as carrera, COUNT(DISTINCT p.cuil) as q
    FROM dim_personas p
    LEFT JOIN dim_puestos dp ON split_part(dp.id_sial_rol, '-', 1) = p.id_sial
    LEFT JOIN dim_carreras dc ON dc.codigo_registro = dp.codigo_registro
    WHERE p.especialidad IS NULL
    GROUP BY dc.lit_cod_reg
    ORDER BY q DESC
  `
  console.log('── Sin especialidad por carrera ──────────────────────────')
  for (const r of porCarrera) console.log(`  "${r.carrera}": ${r.q}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
