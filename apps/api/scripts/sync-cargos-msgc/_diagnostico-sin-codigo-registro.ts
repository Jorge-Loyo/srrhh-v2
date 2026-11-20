import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // ¿Activos vs históricos?
  const porEstado = await prisma.$queryRaw<{ activo: boolean; q: bigint }[]>`
    SELECT (puesto_hasta IS NULL) as activo, COUNT(*) as q
    FROM dim_puestos
    WHERE codigo_registro IS NULL
    GROUP BY activo
  `
  console.log('── Sin codigo_registro: activos vs históricos ───────────')
  for (const r of porEstado) console.log(`  ${r.activo ? 'activos (puesto_hasta NULL)' : 'históricos (puesto_hasta NOT NULL)'}: ${r.q}`)

  // ¿Tienen match en cargos por id_sial pero sin codigo_registro_id?
  const sinCodRegEnCargo = await prisma.$queryRaw<{ q: bigint }[]>`
    SELECT COUNT(*) as q
    FROM dim_puestos dp
    JOIN cargos c ON c.id_sial = dp.id_sial_rol
    WHERE dp.codigo_registro IS NULL
      AND c.codigo_registro_id IS NULL
  `
  console.log(`\n── Tienen cargo pero cargo sin codigo_registro_id: ${sinCodRegEnCargo[0].q}`)

  // ¿No tienen ningún cargo en el sistema?
  const sinCargo = await prisma.$queryRaw<{ q: bigint }[]>`
    SELECT COUNT(*) as q
    FROM dim_puestos dp
    WHERE dp.codigo_registro IS NULL
      AND NOT EXISTS (SELECT 1 FROM cargos c WHERE c.id_sial = dp.id_sial_rol)
  `
  console.log(`── Sin ningún cargo en el sistema: ${sinCargo[0].q}`)

  // Muestra de escalafon de los sin match (para ver si hay patrón)
  const porEscalafon = await prisma.$queryRaw<{ escalafon: string; q: bigint }[]>`
    SELECT COALESCE(escalafon, 'NULL') as escalafon, COUNT(*) as q
    FROM dim_puestos
    WHERE codigo_registro IS NULL
    GROUP BY escalafon
    ORDER BY q DESC
  `
  console.log('\n── Sin codigo_registro por escalafon ────────────────────')
  for (const r of porEscalafon) console.log(`  "${r.escalafon}": ${r.q}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
