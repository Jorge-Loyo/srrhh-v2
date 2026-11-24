import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// Cargos CR 87 y 85 con puesto de enfermería, cruzados con su especialidad actual
const resultado = await p.$queryRaw<{
  codigo_registro: string
  especialidad: string | null
  cnt: bigint
}[]>`
  SELECT
    cr.codigo AS codigo_registro,
    ep.nombre AS especialidad,
    COUNT(*) AS cnt
  FROM cargos c
  JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
  LEFT JOIN especialidades_puesto ep ON ep.id = c.especialidad_puesto_id
  WHERE cr.codigo IN ('87', '85')
    AND c.deleted_at IS NULL
  GROUP BY cr.codigo, ep.nombre
  ORDER BY cr.codigo, cnt DESC
`

console.log('═══ Cargos CR 87/85 por especialidad actual ═══')
resultado.forEach(r =>
  console.log(`  [${r.codigo_registro}]  ${String(r.cnt).padStart(5)}  "${r.especialidad ?? '(sin especialidad)'}"`)
)

// Cuántos dim_cargos de CR 87/85 podemos cruzar via cargo_id_sistema
const enDim = await p.$queryRaw<{ codigo_registro: string; cnt: bigint }[]>`
  SELECT dc.codigo_registro, COUNT(*) AS cnt
  FROM dim_cargos dc
  WHERE dc.codigo_registro IN ('87', '85')
  GROUP BY dc.codigo_registro
  ORDER BY dc.codigo_registro
`
console.log('\n═══ dim_cargos CR 87/85 ═══')
enDim.forEach(r => console.log(`  [${r.codigo_registro}]  ${r.cnt} cargos`))

// Cuántos tienen cargo_id_sistema poblado (para poder cruzar)
const conLink = await p.$queryRaw<{ codigo_registro: string; con_link: bigint; sin_link: bigint }[]>`
  SELECT
    dc.codigo_registro,
    COUNT(dc.cargo_id_sistema) AS con_link,
    COUNT(*) - COUNT(dc.cargo_id_sistema) AS sin_link
  FROM dim_cargos dc
  WHERE dc.codigo_registro IN ('87', '85')
  GROUP BY dc.codigo_registro
`
console.log('\n═══ dim_cargos CR 87/85 con/sin cargo_id_sistema ═══')
conLink.forEach(r =>
  console.log(`  [${r.codigo_registro}]  con link: ${r.con_link}  sin link: ${r.sin_link}`)
)

// Preview del cruce: cuántos quedarían ATP vs ATC
const preview = await p.$queryRaw<{ jornada: string; cnt: bigint }[]>`
  SELECT
    CASE
      WHEN ep.nombre ILIKE '%atp%' THEN 'ATP'
      ELSE 'ATC'
    END AS jornada,
    COUNT(*) AS cnt
  FROM dim_cargos dc
  JOIN cargos c ON c.id = dc.cargo_id_sistema
  JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
  LEFT JOIN especialidades_puesto ep ON ep.id = c.especialidad_puesto_id
  WHERE dc.codigo_registro IN ('87', '85')
    AND c.deleted_at IS NULL
  GROUP BY 1
`
console.log('\n═══ Preview backfill: ATP vs ATC ═══')
preview.forEach(r => console.log(`  ${r.jornada}: ${r.cnt}`))

await p.$disconnect()
