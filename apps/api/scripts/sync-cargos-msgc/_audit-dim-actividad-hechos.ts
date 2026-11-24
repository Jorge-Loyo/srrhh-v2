import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// Volumen general
const r1 = await p.$queryRaw<any[]>`
  SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE es_actual = true) as actuales,
    COUNT(*) FILTER (WHERE es_actual = false) as historicos,
    COUNT(*) FILTER (WHERE fecha_hasta IS NULL) as sin_fecha_hasta,
    COUNT(*) FILTER (WHERE codigo_cargo IS NULL) as sin_cargo,
    COUNT(*) FILTER (WHERE cuil IS NULL) as sin_cuil,
    COUNT(*) FILTER (WHERE id_sial IS NULL) as sin_id_sial
  FROM dim_actividad_hechos
`
console.log('Volumen general:', r1[0])

// Distribución por situacion_revista
const r2 = await p.$queryRaw<any[]>`
  SELECT situacion_revista, COUNT(*) as cnt
  FROM dim_actividad_hechos
  GROUP BY situacion_revista
  ORDER BY cnt DESC
`
console.log('Por situacion_revista:', r2)

// Rango de fechas
const r3 = await p.$queryRaw<any[]>`
  SELECT
    MIN(fecha_desde) as fecha_min,
    MAX(fecha_desde) as fecha_max,
    MIN(fecha_hasta) as hasta_min,
    MAX(fecha_hasta) as hasta_max
  FROM dim_actividad_hechos
`
console.log('Rango fechas:', r3[0])

// ¿Los codigo_cargo existen en dim_cargos?
const r4 = await p.$queryRaw<any[]>`
  SELECT
    COUNT(DISTINCT dah.codigo_cargo) as total_cargos_dah,
    COUNT(DISTINCT dc.codigo_cargo) as matchean_dim_cargos,
    COUNT(DISTINCT dah.codigo_cargo) FILTER (WHERE dc.codigo_cargo IS NULL) as no_matchean
  FROM dim_actividad_hechos dah
  LEFT JOIN dim_cargos dc ON dc.codigo_cargo = dah.codigo_cargo
`
console.log('Integridad codigo_cargo vs dim_cargos:', r4[0])

// Prefijos de codigo_cargo
const r5 = await p.$queryRaw<any[]>`
  SELECT
    CASE
      WHEN codigo_cargo LIKE 'CPH-J-G-%' THEN 'CPH-J-G-'
      WHEN codigo_cargo LIKE 'CPH-J-P-%' THEN 'CPH-J-P-'
      WHEN codigo_cargo LIKE 'CPH-J-POU-%' THEN 'CPH-J-POU- (viejo)'
      WHEN codigo_cargo LIKE 'CPH-J-POF-%' THEN 'CPH-J-POF- (viejo)'
      WHEN codigo_cargo LIKE 'CPH-G-%' THEN 'CPH-G-'
      WHEN codigo_cargo LIKE 'R-CPH-%' THEN 'R-CPH-'
      ELSE 'otro'
    END as prefijo,
    COUNT(DISTINCT codigo_cargo) as cargos,
    COUNT(*) as filas
  FROM dim_actividad_hechos
  GROUP BY 1
  ORDER BY filas DESC
`
console.log('Prefijos codigo_cargo:', r5)

// ¿Los id_sial_rol actuales matchean con ocupaciones?
const r6 = await p.$queryRaw<any[]>`
  SELECT
    COUNT(*) as total_actuales,
    COUNT(o.id_sial_rol) as matchean_ocupaciones
  FROM dim_actividad_hechos dah
  LEFT JOIN ocupaciones o ON o.id_sial_rol = dah.id_sial_rol
  WHERE dah.es_actual = true
`
console.log('Actuales vs ocupaciones:', r6[0])

// Duplicados de id_sial_rol en actuales
const r7 = await p.$queryRaw<{ cnt: bigint }[]>`
  SELECT COUNT(*) as cnt FROM (
    SELECT id_sial_rol FROM dim_actividad_hechos
    WHERE es_actual = true
    GROUP BY id_sial_rol HAVING COUNT(*) > 1
  ) sub
`
console.log('id_sial_rol duplicados en actuales:', r7[0].cnt)

await p.$disconnect()
