/* eslint-disable no-console */
// Los 6190 cargos con >1 ocupación activa tienen DOS registros de la misma persona:
//   - formato corto: legajo-rol           (ej: 001803020-1)
//   - formato largo: legajo-rol-cuil-rol  (ej: 001803020-1-27953045392-1)
// El formato largo es el canónico. Cerrar el corto con hasta = now().
//
// Uso:
//   npx tsx scripts/sync-cargos-msgc/cerrar-ocupaciones-duplicadas.ts           # dry-run
//   npx tsx scripts/sync-cargos-msgc/cerrar-ocupaciones-duplicadas.ts --ejecutar
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const dryRun = !process.argv.includes('--ejecutar')

// Identificar ocupaciones con formato corto (2 segmentos) que tienen un gemelo largo en el mismo cargo
const duplicados = await prisma.$queryRaw<{ ocupacion_id: string; cargo_id: string; id_sial_rol: string }[]>`
  SELECT o.id::text AS ocupacion_id, o.cargo_id::text, o.id_sial_rol
  FROM ocupaciones o
  JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL AND c.deleted_at IS NULL
    AND array_length(string_to_array(o.id_sial_rol, '-'), 1) = 2
    AND EXISTS (
      SELECT 1 FROM ocupaciones o2
      WHERE o2.cargo_id = o.cargo_id
        AND o2.hasta IS NULL
        AND o2.id_sial_rol LIKE o.id_sial_rol || '-%'
    )
`

console.log(`Ocupaciones con formato corto a cerrar: ${duplicados.length}`)
for (const d of duplicados.slice(0, 10)) {
  console.log(`  ${d.id_sial_rol} (cargo ${d.cargo_id.slice(0, 8)}...)`)
}
if (duplicados.length > 10) console.log(`  ... y ${duplicados.length - 10} más`)

if (dryRun) {
  console.log('\nModo simulación — usar --ejecutar para aplicar.')
  await prisma.$disconnect()
  process.exit(0)
}

// Cerrar los duplicados cortos
const ids = duplicados.map(d => d.ocupacion_id)
const resultado = await prisma.$executeRaw`
  UPDATE ocupaciones SET hasta = now(), updated_at = now()
  WHERE id = ANY(${ids}::uuid[])
`
console.log(`✓ Ocupaciones cerradas: ${resultado}`)

// Verificación
const restantes = await prisma.$queryRaw<{ cantidad: bigint }[]>`
  SELECT count(*) AS cantidad
  FROM (
    SELECT cargo_id FROM ocupaciones o
    JOIN cargos c ON c.id = o.cargo_id
    WHERE o.hasta IS NULL AND c.deleted_at IS NULL AND c.estado = 'vigente'
    GROUP BY cargo_id HAVING count(*) > 1
  ) sub
`
console.log(`Cargos vigentes con >1 ocupación activa restantes: ${restantes[0].cantidad}`)

await prisma.$disconnect()
