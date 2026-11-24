import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// Ver formato real de id_sial_rol
const r1 = await p.$queryRaw<any[]>`
  SELECT id_sial_rol, id_sial, cuil, codigo_cargo, es_actual
  FROM dim_actividad_hechos
  LIMIT 10
`
console.log('Muestra raw:', r1)

// Ver actuales
const r2 = await p.$queryRaw<any[]>`
  SELECT id_sial_rol, id_sial, cuil, codigo_cargo
  FROM dim_actividad_hechos
  WHERE es_actual = true
  LIMIT 10
`
console.log('Actuales muestra:', r2)

// Longitudes de id_sial_rol
const r3 = await p.$queryRaw<any[]>`
  SELECT LENGTH(id_sial_rol) as len, COUNT(*) as cnt
  FROM dim_actividad_hechos
  GROUP BY 1
  ORDER BY cnt DESC
  LIMIT 10
`
console.log('Longitudes id_sial_rol:', r3)

// ¿id_sial_rol en dim_actividad_hechos matchea con ocupaciones.id_sial_rol?
const r4 = await p.$queryRaw<any[]>`
  SELECT o.id_sial_rol, dah.id_sial_rol as dah_rol
  FROM dim_actividad_hechos dah
  JOIN ocupaciones o ON o.id_sial_rol = dah.id_sial_rol
  LIMIT 5
`
console.log('Match directo con ocupaciones:', r4)

// ¿id_sial en dim_actividad_hechos matchea con split_part de ocupaciones?
const r5 = await p.$queryRaw<{ cnt: bigint }[]>`
  SELECT COUNT(*) as cnt
  FROM dim_actividad_hechos dah
  JOIN ocupaciones o ON split_part(o.id_sial_rol, '-', 1) = dah.id_sial
  WHERE dah.es_actual = true
`
console.log('Actuales que matchean ocupaciones via id_sial:', r5[0].cnt)

await p.$disconnect()
