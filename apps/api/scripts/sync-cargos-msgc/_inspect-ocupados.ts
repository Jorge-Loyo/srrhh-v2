/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// Cargos con ocupación activa (hasta IS NULL) — cómo están clasificados en el sistema
const conOcupacion = await p.$queryRaw<{ estado: string; sub_estado: string | null; cantidad: number }[]>`
  SELECT c.estado::text, c.sub_estado::text, count(*)::int AS cantidad
  FROM cargos c
  WHERE c.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL)
  GROUP BY 1, 2
  ORDER BY 3 DESC
`
console.log('Cargos con ocupación activa (hasta IS NULL) por estado/sub_estado:')
let total = 0
for (const r of conOcupacion) {
  console.log(`  ${r.estado} | ${r.sub_estado ?? 'NULL'}: ${r.cantidad}`)
  total += r.cantidad
}
console.log(`  TOTAL con ocupación activa: ${total}`)

// Cargos vigentes vacantes que tienen ocupación activa (inconsistencia)
const vacantesConOcup = await p.$queryRaw<{ cantidad: number }[]>`
  SELECT count(*)::int AS cantidad
  FROM cargos c
  WHERE c.deleted_at IS NULL AND c.estado = 'vigente' AND c.sub_estado = 'vacante'
    AND EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL)
`
console.log(`\nVigentes sub_estado=vacante CON ocupación activa (inconsistencia): ${vacantesConOcup[0].cantidad}`)

// Cargos vigentes ocupado SIN ocupación activa (inconsistencia inversa)
const ocupadosSinOcup = await p.$queryRaw<{ cantidad: number }[]>`
  SELECT count(*)::int AS cantidad
  FROM cargos c
  WHERE c.deleted_at IS NULL AND c.estado = 'vigente' AND c.sub_estado = 'ocupado'
    AND NOT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL)
`
console.log(`Vigentes sub_estado=ocupado SIN ocupación activa (inconsistencia): ${ocupadosSinOcup[0].cantidad}`)

await p.$disconnect()
