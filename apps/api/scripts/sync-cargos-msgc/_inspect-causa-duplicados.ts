/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// Confirmar: los duplicados tienen id_sial_rol distintos?
const muestra = await p.$queryRaw<{
  codigo: string | null
  id_sial_rols: string
  cantidad: number
}[]>`
  SELECT c.codigo, count(*)::int AS cantidad,
    string_agg(o.id_sial_rol, ' | ' ORDER BY o.id_sial_rol) AS id_sial_rols
  FROM ocupaciones o
  JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL
  GROUP BY c.id, c.codigo
  HAVING count(*) > 1
    AND NOT ('retencion_de_cargo' = ANY(array_agg(o.situacion_revista)))
  ORDER BY 2 DESC
  LIMIT 10
`
console.log('Muestra de duplicados (id_sial_rols distintos en el mismo cargo):')
for (const r of muestra) console.log(`  ${r.codigo}: [${r.id_sial_rols}]`)

// Cuántos id_sial_rol distintos hay en esos duplicados
const stats = await p.$queryRaw<{
  cargos_afectados: number
  ocupaciones_extra: number
  id_sial_rols_distintos: number
}[]>`
  SELECT
    count(DISTINCT cargo_id)::int AS cargos_afectados,
    sum(cant - 1)::int AS ocupaciones_extra,
    sum(cant)::int - count(DISTINCT cargo_id)::int AS id_sial_rols_distintos
  FROM (
    SELECT cargo_id, count(*) AS cant
    FROM ocupaciones WHERE hasta IS NULL
    GROUP BY cargo_id HAVING count(*) > 1
      AND NOT ('retencion_de_cargo' = ANY(array_agg(situacion_revista)))
  ) t
`
console.log(`\nEstadísticas:`)
console.log(`  Cargos afectados:      ${stats[0].cargos_afectados}`)
console.log(`  Ocupaciones extra:     ${stats[0].ocupaciones_extra}`)

// La causa: estos id_sial_rol del Excel resolvieron al mismo cargo_id
// porque padron_historico tiene el mismo cargo_id para varios id_sial_rol
const causaPadron = await p.$queryRaw<{ cantidad: number }[]>`
  SELECT count(*)::int AS cantidad
  FROM (
    SELECT cargo_id, count(DISTINCT id_sial_rol) AS roles
    FROM padron_historico
    GROUP BY cargo_id
    HAVING count(DISTINCT id_sial_rol) > 1
  ) t
`
console.log(`\n  Cargos con >1 id_sial_rol en padron_historico: ${causaPadron[0].cantidad}`)
console.log(`  → Estos son cargos que tuvieron distintas personas a lo largo del tiempo`)
console.log(`    (cada persona tiene su propio id_sial_rol pero el cargo es el mismo)`)
console.log(`    Es el comportamiento CORRECTO — un cargo puede tener muchos ocupantes históricos`)
console.log(`    El problema es que hay múltiples ocupaciones ACTIVAS (hasta IS NULL) en el mismo cargo`)

await p.$disconnect()
