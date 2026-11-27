import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// ═══════════════════════════════════════════════════════════════════════════════
// 4.7.1 — Cargos afectados por el cambio en ANEXO_II_83
// ═══════════════════════════════════════════════════════════════════════════════

// Literales que SALEN del Anexo II (hoy están en ANEXO_II_83 pero no en ANEXO_II_EXCEL)
const salen = ['capellan', 'chofer de funcionario']
// Literales que ENTRAN al Anexo II (están en ANEXO_II_EXCEL pero no en ANEXO_II_83)
const entran = ['radio operador', 'radio operador de emergencias']

const afectadosSalen = await p.$queryRaw<{ literal_puesto: string; cnt: bigint; regimen: string }[]>`
  SELECT c.literal_puesto, COUNT(*) AS cnt, r.nombre AS regimen
  FROM cargos c
  JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
  LEFT JOIN regimenes r ON r.id = c.regimen_id
  WHERE cr.codigo = '83'
    AND LOWER(c.literal_puesto) = ANY(${salen}::text[])
    AND c.deleted_at IS NULL
  GROUP BY c.literal_puesto, r.nombre
  ORDER BY cnt DESC
`
console.log('═══ 4.7.1 — Cargos CR 83 que SALEN del Anexo II (cambiarán de "Anexo II" → "Administrativa") ═══')
if (afectadosSalen.length === 0) console.log('  (ninguno)')
else afectadosSalen.forEach(r => console.log(`  ${String(r.cnt).padStart(4)}  "${r.literal_puesto}"  →  régimen actual: ${r.regimen ?? 'NULL'}`))

const afectadosEntran = await p.$queryRaw<{ literal_puesto: string; cnt: bigint; regimen: string }[]>`
  SELECT c.literal_puesto, COUNT(*) AS cnt, r.nombre AS regimen
  FROM cargos c
  JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
  LEFT JOIN regimenes r ON r.id = c.regimen_id
  WHERE cr.codigo = '83'
    AND LOWER(c.literal_puesto) = ANY(${entran}::text[])
    AND c.deleted_at IS NULL
  GROUP BY c.literal_puesto, r.nombre
  ORDER BY cnt DESC
`
console.log('\n═══ 4.7.1 — Cargos CR 83 que ENTRAN al Anexo II (cambiarán de "Administrativa" → "Anexo II") ═══')
if (afectadosEntran.length === 0) console.log('  (ninguno)')
else afectadosEntran.forEach(r => console.log(`  ${String(r.cnt).padStart(4)}  "${r.literal_puesto}"  →  régimen actual: ${r.regimen ?? 'NULL'}`))

// ═══════════════════════════════════════════════════════════════════════════════
// 4.7.2 — especialidad "enfermeria" en dim_puestos y dim_personas
// ═══════════════════════════════════════════════════════════════════════════════

const enfPuestos = await p.$queryRaw<{ especialidad: string; cnt: bigint }[]>`
  SELECT especialidad, COUNT(*) AS cnt
  FROM dim_puestos
  WHERE LOWER(especialidad) = 'enfermeria'
  GROUP BY especialidad
`
console.log('\n═══ 4.7.2 — "enfermeria" en dim_puestos ═══')
if (enfPuestos.length === 0) console.log('  (ninguno)')
else enfPuestos.forEach(r => console.log(`  ${String(r.cnt).padStart(5)}  "${r.especialidad}"`))

const enfPersonas = await p.$queryRaw<{ especialidad: string; cnt: bigint }[]>`
  SELECT especialidad, COUNT(*) AS cnt
  FROM dim_personas
  WHERE LOWER(especialidad) = 'enfermeria'
  GROUP BY especialidad
`
console.log('\n═══ 4.7.2 — "enfermeria" en dim_personas ═══')
if (enfPersonas.length === 0) console.log('  (ninguno)')
else enfPersonas.forEach(r => console.log(`  ${String(r.cnt).padStart(5)}  "${r.especialidad}"`))

// ═══════════════════════════════════════════════════════════════════════════════
// 4.7.3 — Residencias RB / RPB / RES-J en dim_puestos
// ═══════════════════════════════════════════════════════════════════════════════

const residencias = await p.$queryRaw<{ literal_puesto: string; cnt: bigint }[]>`
  SELECT literal_puesto, COUNT(*) AS cnt
  FROM dim_puestos
  WHERE codigo_registro = '24'
  GROUP BY literal_puesto
  ORDER BY cnt DESC
`
console.log('\n═══ 4.7.3 — Literales CR 24 (Residencias) en dim_puestos ═══')
residencias.forEach(r => console.log(`  ${String(r.cnt).padStart(5)}  "${r.literal_puesto}"`))

// Cruzar con la regla de acronimoMsgc para ver cuántos quedan sin acrónimo
const sinAcronimo = residencias.filter(r => {
  const p = (r.literal_puesto ?? '').toLowerCase()
  if (p.includes('instructor') || p.includes('jefe de residentes')) return false // RES-J
  if (/post[ -]?basica/.test(p)) return false // RPB
  if (p.includes('basica')) return false // RB
  return true
})
console.log(`\n  Sin acrónimo derivable (quedarían null): ${sinAcronimo.length} literales`)
sinAcronimo.forEach(r => console.log(`    "${r.literal_puesto}"  (${r.cnt} puestos)`))

await p.$disconnect()
