import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// Cuántos hay antes
const antes = await p.$queryRaw<any[]>`
  SELECT
    COUNT(*) FILTER (WHERE codigo_cargo LIKE 'CPH-J-POF-%') as pof_viejo,
    COUNT(*) FILTER (WHERE codigo_cargo LIKE 'CPH-J-POU-%') as pou_viejo
  FROM dim_actividad_hechos
`
console.log('Antes:', antes[0])

const updPof = await p.$executeRaw`
  UPDATE dim_actividad_hechos
  SET codigo_cargo = 'CPH-J-P-' || lpad(ltrim(split_part(codigo_cargo, 'CPH-J-POF-', 2), '0'), 4, '0')
  WHERE codigo_cargo LIKE 'CPH-J-POF-%'
`
console.log('CPH-J-POF- normalizados:', updPof)

const updPou = await p.$executeRaw`
  UPDATE dim_actividad_hechos
  SET codigo_cargo = 'CPH-J-G-' || lpad(ltrim(split_part(codigo_cargo, 'CPH-J-POU-', 2), '0'), 4, '0')
  WHERE codigo_cargo LIKE 'CPH-J-POU-%'
`
console.log('CPH-J-POU- normalizados:', updPou)

// Verificar integridad con dim_cargos post-normalización
const match = await p.$queryRaw<any[]>`
  SELECT
    COUNT(DISTINCT dah.codigo_cargo) as total_distintos,
    COUNT(DISTINCT dc.codigo_cargo)  as matchean_dim_cargos
  FROM dim_actividad_hechos dah
  LEFT JOIN dim_cargos dc ON dc.codigo_cargo = dah.codigo_cargo
`
console.log('Integridad post-normalización:', match[0])

// Prefijos restantes
const prefijos = await p.$queryRaw<any[]>`
  SELECT
    CASE
      WHEN codigo_cargo LIKE 'CPH-J-G-%' THEN 'CPH-J-G-'
      WHEN codigo_cargo LIKE 'CPH-J-P-%' THEN 'CPH-J-P-'
      WHEN codigo_cargo LIKE 'CPH-G-%'   THEN 'CPH-G-'
      WHEN codigo_cargo LIKE 'R-CPH-%'   THEN 'R-CPH-'
      ELSE 'otro'
    END as prefijo,
    COUNT(DISTINCT codigo_cargo) as cargos,
    COUNT(*) as filas
  FROM dim_actividad_hechos
  GROUP BY 1 ORDER BY filas DESC
`
console.log('Prefijos restantes:', prefijos)

await p.$disconnect()
