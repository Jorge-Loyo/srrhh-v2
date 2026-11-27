import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// Puestos de enfermería CR 85 (excluye auxiliar y cuidador, igual que esPuestoEnfermeria())
const PUESTOS_ENFERMERIA_85 = [
  'enfermero profesional',
  'licenciado en enfermeria',
  'enfermero profes. atp',
]

// ─── CR 87: todos son enfermería por definición de la carrera ─────────────────
const cr87 = await p.$executeRaw`
  UPDATE dim_cargos
  SET jornada_enfermeria = 'ATC'
  WHERE codigo_registro = '87'
    AND jornada_enfermeria IS NULL
`
console.log(`CR 87 → ATC: ${cr87} filas`)

// ─── CR 85: cruzar via dim_actividad_hechos → dim_puestos (tipo_cargo_id no poblado) ───
const cr85 = await p.$executeRaw`
  UPDATE dim_cargos dc
  SET jornada_enfermeria = 'ATC'
  WHERE dc.codigo_registro = '85'
    AND dc.jornada_enfermeria IS NULL
    AND EXISTS (
      SELECT 1
      FROM dim_actividad_hechos dah
      JOIN dim_puestos dp ON dp.id_sial_rol = dah.id_sial_rol
      WHERE dah.codigo_cargo = dc.codigo_cargo
        AND LOWER(dp.literal_puesto) = ANY(${PUESTOS_ENFERMERIA_85}::text[])
      LIMIT 1
    )
`
console.log(`CR 85 enfermería → ATC: ${cr85} filas`)

// ─── Resultado final ──────────────────────────────────────────────────────────
const resumen = await p.$queryRaw<{
  codigo_registro: string
  jornada_enfermeria: string | null
  cnt: bigint
}[]>`
  SELECT codigo_registro, jornada_enfermeria, COUNT(*) AS cnt
  FROM dim_cargos
  WHERE codigo_registro IN ('87', '85')
  GROUP BY codigo_registro, jornada_enfermeria
  ORDER BY codigo_registro, jornada_enfermeria
`

console.log('\n═══ Estado final dim_cargos CR 87/85 ═══')
resumen.forEach(r =>
  console.log(`  [${r.codigo_registro}]  jornada: ${r.jornada_enfermeria ?? 'NULL (no enfermería)'}  →  ${r.cnt} cargos`)
)

await p.$disconnect()
