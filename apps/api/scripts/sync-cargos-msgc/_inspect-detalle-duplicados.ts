/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// Ver detalle de las ocupaciones duplicadas: fechas, created_at, desde
const detalle = await p.$queryRaw<{
  codigo: string | null
  id_sial_rol: string
  desde: Date | null
  cargo_desde: Date | null
  created_at: Date
  situacion_revista: string | null
}[]>`
  SELECT c.codigo, o.id_sial_rol, o.desde, o.cargo_desde AS cargo_desde, o.cargo_hasta AS cargo_hasta,
    o.created_at, o.situacion_revista
  FROM ocupaciones o
  JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL
    AND o.cargo_id IN (
      SELECT cargo_id FROM ocupaciones WHERE hasta IS NULL
      GROUP BY cargo_id HAVING count(*) > 1
        AND NOT ('retencion_de_cargo' = ANY(array_agg(situacion_revista)))
      ORDER BY count(*) DESC
      LIMIT 5
    )
  ORDER BY c.codigo, o.created_at DESC
`

let cargoActual = ''
for (const r of detalle) {
  if (r.codigo !== cargoActual) {
    cargoActual = r.codigo ?? ''
    console.log(`\n${r.codigo}:`)
  }
  console.log(`  id_sial_rol=${r.id_sial_rol} desde=${r.desde?.toISOString().slice(0,10) ?? 'NULL'} cargo_desde=${r.cargo_desde?.toISOString().slice(0,10) ?? 'NULL'} created_at=${r.created_at.toISOString().slice(0,10)} sit=${r.situacion_revista}`)
}

await p.$disconnect()
