import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// ¿Los compuestos tienen siempre un registro limpio equivalente?
const r1 = await p.$queryRaw<{ con_par: bigint, sin_par: bigint }[]>`
  SELECT
    COUNT(*) FILTER (WHERE limpio.id_sial_rol IS NOT NULL) as con_par,
    COUNT(*) FILTER (WHERE limpio.id_sial_rol IS NULL)     as sin_par
  FROM dim_actividad_hechos compuesto
  LEFT JOIN dim_actividad_hechos limpio
    ON limpio.id_sial_rol = split_part(compuesto.id_sial_rol, '-', 1) || '-' || split_part(compuesto.id_sial_rol, '-', 2)
    AND limpio.codigo_cargo = compuesto.codigo_cargo
  WHERE LENGTH(compuesto.id_sial_rol) IN (25, 27)
`
console.log('Compuestos con/sin par limpio:', r1[0])

// ¿Difieren en algo más allá del id_sial_rol?
const r2 = await p.$queryRaw<any[]>`
  SELECT
    compuesto.id_sial_rol as compuesto,
    limpio.id_sial_rol as limpio,
    compuesto.fecha_desde as c_desde, limpio.fecha_desde as l_desde,
    compuesto.fecha_hasta as c_hasta, limpio.fecha_hasta as l_hasta,
    compuesto.situacion_revista as c_sit, limpio.situacion_revista as l_sit,
    compuesto.es_actual as c_actual, limpio.es_actual as l_actual
  FROM dim_actividad_hechos compuesto
  JOIN dim_actividad_hechos limpio
    ON limpio.id_sial_rol = split_part(compuesto.id_sial_rol, '-', 1) || '-' || split_part(compuesto.id_sial_rol, '-', 2)
    AND limpio.codigo_cargo = compuesto.codigo_cargo
  WHERE LENGTH(compuesto.id_sial_rol) IN (25, 27)
  LIMIT 5
`
console.log('Comparación compuesto vs limpio:', r2)

// Cuántos compuestos hay en total
const r3 = await p.$queryRaw<{ cnt: bigint }[]>`
  SELECT COUNT(*) as cnt FROM dim_actividad_hechos WHERE LENGTH(id_sial_rol) IN (25, 27)
`
console.log('Total compuestos a eliminar:', r3[0].cnt)

// ¿Cuántos codigo_cargo legacy matchean dim_cargos si normalizamos?
const r4 = await p.$queryRaw<any[]>`
  SELECT
    COUNT(DISTINCT dah.codigo_cargo) FILTER (WHERE dah.codigo_cargo LIKE 'CPH-G-%') as cpg_total,
    COUNT(DISTINCT dc.codigo_cargo) FILTER (WHERE dah.codigo_cargo LIKE 'CPH-G-%') as cpg_match
  FROM dim_actividad_hechos dah
  LEFT JOIN dim_cargos dc ON dc.codigo_cargo = dah.codigo_cargo
`
console.log('CPH-G- en dim_cargos:', r4[0])

await p.$disconnect()
