import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// ¿Qué son los 49345 cargos "otro"?
const r1 = await p.$queryRaw<any[]>`
  SELECT codigo_cargo, COUNT(*) as cnt
  FROM dim_actividad_hechos
  WHERE codigo_cargo NOT LIKE 'CPH-%'
    AND codigo_cargo NOT LIKE 'R-CPH-%'
  GROUP BY codigo_cargo
  ORDER BY cnt DESC
  LIMIT 10
`
console.log('Muestra cargos "otro":', r1)

// Formatos de id_sial_rol
const r2 = await p.$queryRaw<any[]>`
  SELECT
    CASE
      WHEN id_sial_rol ~ '^\d{9}-\d+$' THEN 'limpio (9dig-N)'
      WHEN id_sial_rol ~ '^\d{9}-\d+-\d{11}-\d+$' THEN 'compuesto (con cuil)'
      ELSE 'otro'
    END as formato,
    COUNT(*) as cnt
  FROM dim_actividad_hechos
  GROUP BY 1
`
console.log('Formatos id_sial_rol:', r2)

// ¿Los actuales (es_actual=true) qué formato tienen?
const r3 = await p.$queryRaw<any[]>`
  SELECT
    CASE
      WHEN id_sial_rol ~ '^\d{9}-\d+$' THEN 'limpio'
      WHEN id_sial_rol ~ '^\d{9}-\d+-\d{11}-\d+$' THEN 'compuesto'
      ELSE 'otro'
    END as formato,
    COUNT(*) as cnt
  FROM dim_actividad_hechos
  WHERE es_actual = true
  GROUP BY 1
`
console.log('Formatos id_sial_rol (actuales):', r3)

// ¿Los compuestos matchean ocupaciones si tomamos solo la primera parte?
const r4 = await p.$queryRaw<{ cnt: bigint }[]>`
  SELECT COUNT(*) as cnt
  FROM dim_actividad_hechos dah
  JOIN ocupaciones o ON o.id_sial_rol = split_part(dah.id_sial_rol, '-', 1) || '-' || split_part(dah.id_sial_rol, '-', 2)
  WHERE dah.es_actual = true
    AND dah.id_sial_rol ~ '^\d{9}-\d+-\d{11}-\d+$'
`
console.log('Compuestos que matchean ocupaciones (tomando primeras 2 partes):', r4[0].cnt)

// ¿Cuántos actuales matchean ocupaciones con id_sial_rol limpio?
const r5 = await p.$queryRaw<{ cnt: bigint }[]>`
  SELECT COUNT(*) as cnt
  FROM dim_actividad_hechos dah
  JOIN ocupaciones o ON o.id_sial_rol = dah.id_sial_rol
  WHERE dah.es_actual = true
    AND dah.id_sial_rol ~ '^\d{9}-\d+$'
`
console.log('Limpios actuales que matchean ocupaciones:', r5[0].cnt)

// ¿Los CPH-J-POF- y CPH-J-POU- matchean si normalizamos el prefijo?
const r6 = await p.$queryRaw<{ cnt: bigint }[]>`
  SELECT COUNT(DISTINCT dah.codigo_cargo) as cnt
  FROM dim_actividad_hechos dah
  JOIN dim_cargos dc ON dc.codigo_cargo =
    CASE
      WHEN dah.codigo_cargo LIKE 'CPH-J-POF-%'
        THEN 'CPH-J-P-' || lpad(ltrim(split_part(dah.codigo_cargo, 'CPH-J-POF-', 2), '0'), 4, '0')
      WHEN dah.codigo_cargo LIKE 'CPH-J-POU-%'
        THEN 'CPH-J-G-' || lpad(ltrim(split_part(dah.codigo_cargo, 'CPH-J-POU-', 2), '0'), 4, '0')
      ELSE dah.codigo_cargo
    END
`
console.log('Cargos que matchean dim_cargos normalizando prefijos viejos:', r6[0].cnt)

await p.$disconnect()
