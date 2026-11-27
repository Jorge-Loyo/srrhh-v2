import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// ─── dim_tipos_cargos ─────────────────────────────────────────────────────────
const tiposCargos = await p.$queryRaw<{id: number; codigo_registro: string; nombre: string; tipo_cargo: string; activo: boolean; n_cargos: bigint}[]>`
  SELECT tc.id, tc.codigo_registro, tc.nombre, tc.tipo_cargo, tc.activo,
         COUNT(dc.codigo_cargo) as n_cargos
  FROM dim_tipos_cargos tc
  LEFT JOIN dim_cargos dc ON dc.tipo_cargo_id = tc.id
  GROUP BY tc.id, tc.codigo_registro, tc.nombre, tc.tipo_cargo, tc.activo
  ORDER BY tc.codigo_registro, tc.nombre
`
console.log(`dim_tipos_cargos: ${tiposCargos.length} filas`)
tiposCargos.forEach(r =>
  console.log(`  [${r.id}] CR=${r.codigo_registro} tipo=${r.tipo_cargo} cargos=${r.n_cargos} | ${r.nombre}`)
)

// ─── dim_especialidades ───────────────────────────────────────────────────────
const especialidades = await p.$queryRaw<{id: number; tipo_cargo_id: number; nombre: string; activo: boolean; n_cargos: bigint}[]>`
  SELECT e.id, e.tipo_cargo_id, e.nombre, e.activo,
         COUNT(dc.codigo_cargo) as n_cargos
  FROM dim_especialidades e
  LEFT JOIN dim_cargos dc ON dc.especialidad_id = e.id
  GROUP BY e.id, e.tipo_cargo_id, e.nombre, e.activo
  ORDER BY e.tipo_cargo_id, e.nombre
`
console.log(`\ndim_especialidades: ${especialidades.length} filas`)
especialidades.forEach(r =>
  console.log(`  [${r.id}] tipo_cargo_id=${r.tipo_cargo_id} cargos=${r.n_cargos} | ${r.nombre}`)
)

// ─── puestos_cargo: estructura actual ─────────────────────────────────────────
const puestosCargo = await p.$queryRaw<{id: string; escalafon_id: string; modalidad: string; nombre: string; tipo_puesto: string; n_cargos: bigint; n_esp: bigint}[]>`
  SELECT pc.id, pc.escalafon_id, pc.modalidad, pc.nombre, pc.tipo_puesto,
         COUNT(DISTINCT c.id) as n_cargos,
         COUNT(DISTINCT ep.id) as n_esp
  FROM puestos_cargo pc
  LEFT JOIN cargos c ON c.puesto_cargo_id = pc.id
  LEFT JOIN especialidades_puesto ep ON ep.puesto_carg_id = pc.id
  GROUP BY pc.id, pc.escalafon_id, pc.modalidad, pc.nombre, pc.tipo_puesto
  ORDER BY pc.escalafon_id, pc.nombre
  LIMIT 40
`
console.log(`\npuestos_cargo (top 40):`)
puestosCargo.forEach(r =>
  console.log(`  modalidad=${r.modalidad} tipo=${r.tipo_puesto} cargos=${r.n_cargos} esp=${r.n_esp} | ${r.nombre}`)
)

// ─── Relación entre dim_tipos_cargos y puestos_cargo ─────────────────────────
// ¿Cuántos nombres de dim_tipos_cargos matchean puestos_cargo.nombre?
const matchTC = await p.$queryRaw<{match: bigint; total: bigint}[]>`
  SELECT
    COUNT(DISTINCT CASE WHEN EXISTS (
      SELECT 1 FROM puestos_cargo pc WHERE LOWER(pc.nombre) = LOWER(tc.nombre)
    ) THEN tc.id END) as match,
    COUNT(DISTINCT tc.id) as total
  FROM dim_tipos_cargos tc
`
console.log(`\ndim_tipos_cargos con match en puestos_cargo: ${matchTC[0].match}/${matchTC[0].total}`)

// ─── dim_cargos: cobertura de tipo_cargo_id y especialidad_id ─────────────────
const cobertura = await p.$queryRaw<{con_tipo: bigint; con_esp: bigint; total: bigint}[]>`
  SELECT
    COUNT(CASE WHEN tipo_cargo_id IS NOT NULL THEN 1 END) as con_tipo,
    COUNT(CASE WHEN especialidad_id IS NOT NULL THEN 1 END) as con_esp,
    COUNT(*) as total
  FROM dim_cargos
`
console.log(`\ndim_cargos cobertura:`)
console.log(`  con tipo_cargo_id:   ${cobertura[0].con_tipo}/${cobertura[0].total}`)
console.log(`  con especialidad_id: ${cobertura[0].con_esp}/${cobertura[0].total}`)

await p.$disconnect()
