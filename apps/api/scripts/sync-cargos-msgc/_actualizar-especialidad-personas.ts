// Actualiza especialidad en dim_personas desde dim_puestos:
// toma la especialidad del puesto más reciente (mayor puesto_desde) que tenga especialidad,
// filtrando por id_sial de la persona.
// Dry-run por defecto; pasar --ejecutar para aplicar.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const EJECUTAR = process.argv.includes('--ejecutar')

async function main() {
  // Estado actual
  const stats = await prisma.$queryRaw<{ total: bigint; con_esp: bigint; sin_esp: bigint }[]>`
    SELECT COUNT(*) as total, COUNT(especialidad) as con_esp,
           COUNT(*) - COUNT(especialidad) as sin_esp
    FROM dim_personas
  `
  const s = stats[0]
  console.log(`Total: ${s.total} | Con especialidad: ${s.con_esp} | Sin: ${s.sin_esp}`)

  // Cuántas se pueden completar desde dim_puestos
  const candidatos = await prisma.$queryRaw<{ q: bigint }[]>`
    SELECT COUNT(DISTINCT p.cuil) as q
    FROM dim_personas p
    WHERE p.especialidad IS NULL
      AND EXISTS (
        SELECT 1 FROM dim_puestos dp
        WHERE split_part(dp.id_sial_rol, '-', 1) = p.id_sial
          AND dp.especialidad IS NOT NULL
      )
  `
  console.log(`Sin especialidad que tienen puesto con esp: ${candidatos[0].q}`)

  if (!EJECUTAR) { console.log('\n[DRY-RUN] Pasar --ejecutar para aplicar.'); return }

  // Actualizar: tomar especialidad del puesto más reciente con especialidad por id_sial
  const n = await prisma.$executeRawUnsafe(`
    UPDATE dim_personas p
    SET especialidad = sub.especialidad
    FROM (
      SELECT DISTINCT ON (split_part(dp.id_sial_rol, '-', 1))
        split_part(dp.id_sial_rol, '-', 1) as id_sial,
        dp.especialidad
      FROM dim_puestos dp
      WHERE dp.especialidad IS NOT NULL
      ORDER BY split_part(dp.id_sial_rol, '-', 1), dp.puesto_desde DESC NULLS LAST
    ) sub
    WHERE p.id_sial = sub.id_sial
      AND p.especialidad IS NULL
  `)
  console.log(`✓ especialidad actualizada: ${n} filas`)

  const final = await prisma.$queryRaw<{ con_esp: bigint; sin_esp: bigint }[]>`
    SELECT COUNT(especialidad) as con_esp, COUNT(*) - COUNT(especialidad) as sin_esp
    FROM dim_personas
  `
  console.log(`  Con especialidad: ${final[0].con_esp} | Sin: ${final[0].sin_esp}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
