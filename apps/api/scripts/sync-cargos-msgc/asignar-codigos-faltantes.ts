/* eslint-disable no-console */
// Asigna códigos a todos los cargos sin código (deleted_at IS NULL, codigo IS NULL).
// Deriva el acrónimo desde los datos del cargo (escalafón, CR, literal puesto, sub_estado)
// y asigna el siguiente secuencial libre por prefijo.
//
// Uso:
//   npx tsx scripts/sync-cargos-msgc/asignar-codigos-faltantes.ts           # dry-run
//   npx tsx scripts/sync-cargos-msgc/asignar-codigos-faltantes.ts --ejecutar
import { PrismaClient } from '@prisma/client'
import { acronimoMsgc } from '../../src/shared/acronimoMsgc.js'

const prisma = new PrismaClient()
const dryRun = !process.argv.includes('--ejecutar')

interface CargoBruto {
  id: string
  escalafon: string | null
  codigo_registro: string | null
  literal_puesto: string | null
  planta_guardia: string | null
  tiene_linea_arbol: boolean
  sub_estado: string | null
  estado: string
  origen: string
}

try {
  // Leer todos los cargos sin código con sus datos necesarios
  const cargos = await prisma.$queryRaw<CargoBruto[]>`
    SELECT
      c.id::text,
      e.nombre AS escalafon,
      cr.codigo AS codigo_registro,
      c.literal_puesto,
      c.regimen AS planta_guardia,
      (c.codigo_repa IS NOT NULL) AS tiene_linea_arbol,
      c.sub_estado::text,
      c.estado::text,
      c.origen
    FROM cargos c
    LEFT JOIN escalafones e ON e.id = c.escalafon_id
    LEFT JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
    WHERE c.deleted_at IS NULL AND c.codigo IS NULL
    ORDER BY c.estado, c.origen, c.id
  `

  console.log(`Cargos sin código: ${cargos.length}`)

  // Derivar acrónimo para cada cargo
  const plan: { id: string; prefijo: string }[] = []
  const sinRegla: { id: string; escalafon: string | null; cr: string | null; literal: string | null }[] = []

  for (const c of cargos) {
    const cr = c.codigo_registro?.trim() ?? ''
    const literal = c.literal_puesto ?? ''
    const plantaGuardia = c.planta_guardia ?? null
    // Conducción si tiene sub_estado ocupado y literal sugiere jefatura, o tiene linea arbol
    const esConduccion = c.tiene_linea_arbol &&
      (literal.toLowerCase().includes('jefe') || literal.toLowerCase().includes('director') ||
       literal.toLowerCase().includes('gerente') || literal.toLowerCase().includes('subdirector'))

    const nivel = esConduccion
      ? (literal.toLowerCase().includes('subdirector') ? 'SDHOS'
        : literal.toLowerCase().includes('director') ? 'DHOS'
        : 'SECC')
      : ''

    const acron = cr
      ? acronimoMsgc({ cr, literalPuesto: literal, plantaGuardia, nivelConduccion: nivel, tieneLineaArbol: c.tiene_linea_arbol })
      : null

    if (acron) {
      plan.push({ id: c.id, prefijo: acron })
    } else {
      sinRegla.push({ id: c.id, escalafon: c.escalafon, cr: c.codigo_registro, literal: c.literal_puesto })
    }
  }

  // Agrupar por prefijo y calcular secuenciales
  // Primero leer el máximo actual por prefijo en la BD
  const prefijosUnicos = [...new Set(plan.map((p) => p.prefijo))]
  const maximos = new Map<string, number>()

  for (const prefijo of prefijosUnicos) {
    const rows = await prisma.$queryRaw<{ max_seq: number | null }[]>`
      SELECT MAX(CAST(SUBSTRING(codigo FROM '([0-9]{6})$') AS INTEGER)) AS max_seq
      FROM cargos
      WHERE codigo LIKE ${prefijo + '-%'}
        AND codigo ~ ${'^' + prefijo.replace(/-/g, '\\-') + '-[0-9]{6}$'}
    `
    maximos.set(prefijo, rows[0]?.max_seq ?? 0)
  }

  // Asignar código a cada cargo
  const asignaciones: { id: string; codigo: string }[] = []
  for (const item of plan) {
    const siguiente = (maximos.get(item.prefijo) ?? 0) + 1
    maximos.set(item.prefijo, siguiente)
    asignaciones.push({ id: item.id, codigo: `${item.prefijo}-${String(siguiente).padStart(6, '0')}` })
  }

  // Resumen por prefijo
  const porPrefijo = new Map<string, number>()
  for (const a of asignaciones) {
    const p = a.codigo.replace(/-[0-9]{6}$/, '')
    porPrefijo.set(p, (porPrefijo.get(p) ?? 0) + 1)
  }

  console.log(`\nPlan de asignación (${asignaciones.length} cargos):`)
  for (const [p, n] of [...porPrefijo.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${p}: ${n} nuevos`)
  }

  if (sinRegla.length > 0) {
    console.log(`\nSin regla de acrónimo (${sinRegla.length}) — se omiten:`)
    for (const s of sinRegla.slice(0, 20)) {
      console.log(`  escalafon="${s.escalafon}" cr="${s.cr}" literal="${s.literal}"`)
    }
    if (sinRegla.length > 20) console.log(`  ... y ${sinRegla.length - 20} más`)
  }

  if (dryRun) {
    console.log('\nModo simulación — no se escribió nada. Usar --ejecutar para aplicar.')
    process.exit(0)
  }

  // Ejecutar en lotes de 500
  console.log('\nAsignando códigos...')
  let asignados = 0
  const LOTE = 500
  for (let i = 0; i < asignaciones.length; i += LOTE) {
    const lote = asignaciones.slice(i, i + LOTE)
    const json = JSON.stringify(lote.map((a) => ({ id: a.id, codigo: a.codigo })))
    await prisma.$executeRaw`
      UPDATE cargos c
      SET codigo = v.codigo, updated_at = now()
      FROM json_to_recordset(${json}::json) AS v(id uuid, codigo text)
      WHERE c.id = v.id AND c.codigo IS NULL
    `
    asignados += lote.length
    process.stdout.write(`\r  ${asignados}/${asignaciones.length}`)
  }

  // Verificar
  const restantes = await prisma.$queryRaw<{ cantidad: number }[]>`
    SELECT count(*)::int AS cantidad FROM cargos WHERE deleted_at IS NULL AND codigo IS NULL
  `
  console.log(`\n\nVerificación: sin código restantes = ${restantes[0].cantidad}`)
  console.log(restantes[0].cantidad === sinRegla.length
    ? `✓ Completado. ${sinRegla.length} sin regla de acrónimo quedan sin código.`
    : `✗ Diferencia inesperada.`)

} finally {
  await prisma.$disconnect()
}
