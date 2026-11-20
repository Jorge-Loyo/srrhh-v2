/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const resultado = await prisma.$queryRaw<{
  formato: string
  cantidad: bigint
  ejemplo: string
}[]>`
  SELECT
    CASE
      WHEN array_length(string_to_array(id_sial_rol, '-'), 1) = 2 THEN 'corto (idSial-rol)'
      WHEN array_length(string_to_array(id_sial_rol, '-'), 1) = 4 THEN 'largo (idSial-rol-cuil-rol)'
      ELSE 'otro (' || array_length(string_to_array(id_sial_rol, '-'), 1)::text || ' partes)'
    END AS formato,
    COUNT(*)::bigint AS cantidad,
    MIN(id_sial_rol) AS ejemplo
  FROM ocupaciones
  GROUP BY 1
  ORDER BY 2 DESC
`

console.log('\n── Formatos de id_sial_rol en ocupaciones ───────────────────────────────────\n')
for (const r of resultado) {
  console.log(`  ${r.formato}`)
  console.log(`    cantidad: ${r.cantidad}`)
  console.log(`    ejemplo:  ${r.ejemplo}`)
}

// Verificar las 32 recién creadas (sin snapshot_id, created_at reciente)
const recientes = await prisma.$queryRaw<{ id_sial_rol: string; created_at: Date }[]>`
  SELECT id_sial_rol, created_at
  FROM ocupaciones
  WHERE created_at > now() - interval '1 hour'
    AND hasta IS NULL
  ORDER BY created_at DESC
  LIMIT 5
`
console.log(`\n── Últimas ocupaciones creadas (última hora) ────────────────────────────────\n`)
for (const r of recientes) {
  console.log(`  ${r.id_sial_rol}  (${r.created_at.toISOString()})`)
}

await prisma.$disconnect()
