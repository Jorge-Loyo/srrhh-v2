/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// Clasificar los cargos con >1 ocupación activa
const clasificacion = await p.$queryRaw<{
  tipo: string
  cargos: number
  ocupaciones: number
}[]>`
  WITH multiples AS (
    SELECT cargo_id, array_agg(situacion_revista ORDER BY situacion_revista) AS sit_revs, count(*) AS cant
    FROM ocupaciones WHERE hasta IS NULL
    GROUP BY cargo_id HAVING count(*) > 1
  )
  SELECT
    CASE
      -- Retención legítima: una es retencion_de_cargo y otra es activo/comisionado
      WHEN 'retencion_de_cargo' = ANY(sit_revs) AND (
        'activo' = ANY(sit_revs) OR 'comisionado' = ANY(sit_revs)
      ) THEN 'retencion_legitima'
      -- Todas son retencion_de_cargo
      WHEN NOT ('activo' = ANY(sit_revs)) AND NOT ('comisionado' = ANY(sit_revs))
        THEN 'solo_retenciones'
      -- Todas activo (duplicado real)
      WHEN NOT ('retencion_de_cargo' = ANY(sit_revs))
        THEN 'duplicado_activos'
      ELSE 'otro'
    END AS tipo,
    count(*)::int AS cargos,
    sum(cant)::int AS ocupaciones
  FROM multiples
  GROUP BY 1
  ORDER BY 2 DESC
`

console.log('Clasificación de cargos con >1 ocupación activa:')
for (const r of clasificacion) console.log(`  ${r.tipo}: ${r.cargos} cargos, ${r.ocupaciones} ocupaciones`)

// Detalle de duplicados_activos (los más problemáticos)
const dupActivos = await p.$queryRaw<{ codigo: string | null; cantidad: number; sit_revs: string }[]>`
  SELECT c.codigo, count(*)::int AS cantidad,
    string_agg(o.situacion_revista, ' | ' ORDER BY o.situacion_revista) AS sit_revs
  FROM ocupaciones o
  JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL
  GROUP BY c.id, c.codigo
  HAVING count(*) > 1
    AND NOT ('retencion_de_cargo' = ANY(array_agg(o.situacion_revista)))
  ORDER BY 2 DESC
  LIMIT 20
`
console.log(`\nDuplicados sin retención (top 20):`)
for (const r of dupActivos) console.log(`  ${r.codigo}: ${r.cantidad} ocupaciones [${r.sit_revs}]`)

await p.$disconnect()
