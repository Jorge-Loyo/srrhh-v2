import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// Literales que SALEN del Anexo II → pasan a 'Carrera Administrativa'
const SALEN = ['capellan', 'chofer de funcionario']
// Literales que ENTRAN al Anexo II → pasan a 'Carrera Administrativa anexo II'
const ENTRAN = ['radio operador', 'radio operador de emergencias', 'chofer de ambulancias']

// Cargar ids de regímenes
const regimenes = await p.$queryRaw<{ id: string; nombre: string }[]>`
  SELECT id, nombre FROM regimenes
  WHERE nombre IN ('Carrera Administrativa', 'Carrera Administrativa anexo II')
`
const regimenPorNombre = new Map(regimenes.map(r => [r.nombre, r.id]))

const idAdm    = regimenPorNombre.get('Carrera Administrativa')
const idAnexo  = regimenPorNombre.get('Carrera Administrativa anexo II')

if (!idAdm || !idAnexo) {
  console.error('❌ No se encontraron los regímenes en la tabla regimenes')
  console.error('  Encontrados:', [...regimenPorNombre.keys()])
  process.exit(1)
}

// ─── Cargos que SALEN del Anexo II → Carrera Administrativa ──────────────────
const salen = await p.$executeRaw`
  UPDATE cargos c
  SET regimen_id = ${idAdm}::uuid
  FROM codigos_registro cr
  WHERE c.codigo_registro_id = cr.id
    AND cr.codigo = '83'
    AND LOWER(c.literal_puesto) = ANY(${SALEN}::text[])
    AND c.deleted_at IS NULL
    AND c.regimen_id != ${idAdm}::uuid
`
console.log(`Salen del Anexo II → Carrera Administrativa: ${salen} cargos`)

// ─── Cargos que ENTRAN al Anexo II → Carrera Administrativa anexo II ─────────
const entran = await p.$executeRaw`
  UPDATE cargos c
  SET regimen_id = ${idAnexo}::uuid
  FROM codigos_registro cr
  WHERE c.codigo_registro_id = cr.id
    AND cr.codigo = '83'
    AND LOWER(c.literal_puesto) = ANY(${ENTRAN}::text[])
    AND c.deleted_at IS NULL
    AND c.regimen_id != ${idAnexo}::uuid
`
console.log(`Entran al Anexo II → Carrera Administrativa anexo II: ${entran} cargos`)

// ─── Verificación post-update ─────────────────────────────────────────────────
const verificacion = await p.$queryRaw<{ literal_puesto: string; regimen: string; cnt: bigint }[]>`
  SELECT c.literal_puesto, r.nombre AS regimen, COUNT(*) AS cnt
  FROM cargos c
  JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
  JOIN regimenes r ON r.id = c.regimen_id
  WHERE cr.codigo = '83'
    AND LOWER(c.literal_puesto) = ANY(${[...SALEN, ...ENTRAN]}::text[])
    AND c.deleted_at IS NULL
  GROUP BY c.literal_puesto, r.nombre
  ORDER BY c.literal_puesto
`
console.log('\n═══ Verificación post-update ═══')
verificacion.forEach(r =>
  console.log(`  ${String(r.cnt).padStart(4)}  "${r.literal_puesto}"  →  ${r.regimen}`)
)

// Cargos con regimen NULL que quedaron sin actualizar (el capellan con NULL)
const sinRegimen = await p.$queryRaw<{ literal_puesto: string; cnt: bigint }[]>`
  SELECT c.literal_puesto, COUNT(*) AS cnt
  FROM cargos c
  JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
  WHERE cr.codigo = '83'
    AND LOWER(c.literal_puesto) = ANY(${[...SALEN, ...ENTRAN]}::text[])
    AND c.deleted_at IS NULL
    AND c.regimen_id IS NULL
  GROUP BY c.literal_puesto
`
if (sinRegimen.length > 0) {
  console.log('\n⚠️  Cargos sin regimen_id (no actualizados por ser NULL):')
  sinRegimen.forEach(r => console.log(`  ${r.cnt}  "${r.literal_puesto}"`))
}

await p.$disconnect()
