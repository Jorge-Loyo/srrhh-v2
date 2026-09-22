/**
 * backfill_cadenas_retencion.mjs (S18-2)
 *
 * Para cada Ocupacion activa con situacionRevista = 'Retencion de Cargo':
 *   cargo retenido = ocupacion.cargoId
 *   buscar cargo remplazante candidato: mismo hospital + código con prefijo
 *   del retenido + sufijo -R- o -TTR- + sin ocupación activa (vacante)
 *   → asignar cargoRetenidoId en el remplazante
 *
 * Luego, para cada remplazante con cargoRetenidoId asignado: recorrer la
 * cadena hacia atrás hasta el cargo sin cargoRetenidoId (el base) y asignar
 * ese id como cargoBaseId. El base mismo queda con cargoBaseId = null.
 *
 * Idempotente: si un remplazante ya tiene cargoRetenidoId asignado, se
 * saltea en el primer paso (no se reasigna). Los casos ambiguos (más de un
 * candidato) se loguean para revisión manual y no se tocan.
 *
 * Flags:
 *   --dry-run   solo muestra qué haría, no escribe
 */

import { PrismaClient } from '@prisma/client'

const DB = process.env.DATABASE_URL ?? 'postgresql://srrhh_user:srrhh_pass@localhost:5432/srrhh_db'
const p = new PrismaClient({ datasources: { db: { url: DB } } })

const dryRun = process.argv.includes('--dry-run')
console.log(`Modo: ${dryRun ? 'DRY-RUN' : 'ESCRITURA'}\n`)

function prefijoDeCodigo(codigo) {
  // Quita el secuencial final de 6 dígitos: "CPH-POF-000042" → "CPH-POF"
  return codigo.replace(/-\d{6}$/, '')
}

// ─── Paso 1: mapear retenciones existentes → cargoRetenidoId ────────────────

const ocupacionesRetenidas = await p.ocupacion.findMany({
  where: { situacionRevista: 'Retencion de Cargo', hasta: null },
  select: { id: true, cargoId: true, personaId: true },
})

console.log(`Ocupaciones con "Retencion de Cargo" activas: ${ocupacionesRetenidas.length}\n`)

let asignados = 0, yaAsignados = 0, sinCandidato = 0, ambiguos = 0, errores = 0

for (const ocup of ocupacionesRetenidas) {
  const retenido = await p.cargo.findUnique({ where: { id: ocup.cargoId } })
  if (!retenido) {
    console.log(`  SKIP ocupacion=${ocup.id} → cargo ${ocup.cargoId} no existe`)
    errores++
    continue
  }
  if (!retenido.codigo) {
    console.log(`  SKIP ${retenido.id} (sin código, no se puede derivar prefijo de remplazante)`)
    errores++
    continue
  }

  const prefijo = prefijoDeCodigo(retenido.codigo)

  const candidatos = await p.cargo.findMany({
    where: {
      hospitalId: retenido.hospitalId,
      OR: [
        { codigo: { startsWith: `${prefijo}-R-` } },
        { codigo: { startsWith: `${prefijo}-TTR-` } },
      ],
      ocupaciones: { none: { hasta: null } },
    },
  })

  const yaVinculado = candidatos.find((c) => c.cargoRetenidoId === retenido.id)
  if (yaVinculado) {
    yaAsignados++
    continue
  }

  const libres = candidatos.filter((c) => c.cargoRetenidoId === null)

  if (libres.length === 0) {
    console.log(`  SIN CANDIDATO: ${retenido.codigo} (prefijo ${prefijo}-R-/-TTR-, hospital ${retenido.hospitalId})`)
    sinCandidato++
    continue
  }
  if (libres.length > 1) {
    console.log(`  AMBIGUO: ${retenido.codigo} → ${libres.length} candidatos (${libres.map((c) => c.codigo).join(', ')}) — revisar a mano`)
    ambiguos++
    continue
  }

  const remplazante = libres[0]
  console.log(`  ${dryRun ? '[DRY]' : 'OK  '} ${retenido.codigo} → ${remplazante.codigo} (cargoRetenidoId)`)

  if (!dryRun) {
    await p.cargo.update({ where: { id: remplazante.id }, data: { cargoRetenidoId: retenido.id } })
  }
  asignados++
}

// ─── Paso 2: recorrer cada cadena hacia atrás y asignar cargoBaseId ─────────

const todosLosRemplazantes = await p.cargo.findMany({
  where: { cargoRetenidoId: { not: null } },
  select: { id: true, codigo: true, cargoRetenidoId: true, cargoBaseId: true },
})
const porId = new Map(todosLosRemplazantes.map((c) => [c.id, c]))

let baseAsignados = 0

for (const nodo of todosLosRemplazantes) {
  let actual = nodo
  let baseId = null
  const visitados = new Set()
  while (actual?.cargoRetenidoId) {
    if (visitados.has(actual.id)) { baseId = null; break } // ciclo defensivo
    visitados.add(actual.id)
    baseId = actual.cargoRetenidoId
    actual = porId.get(actual.cargoRetenidoId) ?? await p.cargo.findUnique({
      where: { id: actual.cargoRetenidoId },
      select: { id: true, codigo: true, cargoRetenidoId: true, cargoBaseId: true },
    })
  }
  if (!baseId) continue
  if (nodo.cargoBaseId === baseId) continue // ya correcto, idempotente

  console.log(`  ${dryRun ? '[DRY]' : 'OK  '} cargoBaseId(${nodo.codigo}) = ${baseId}`)
  if (!dryRun) {
    await p.cargo.update({ where: { id: nodo.id }, data: { cargoBaseId: baseId } })
  }
  baseAsignados++
}

console.log(`\n=== RESULTADO ===`)
console.log(`  cargoRetenidoId asignados: ${asignados}`)
console.log(`  Ya asignados (idempotente): ${yaAsignados}`)
console.log(`  Sin candidato:              ${sinCandidato}`)
console.log(`  Ambiguos (revisar a mano):  ${ambiguos}`)
console.log(`  Errores:                    ${errores}`)
console.log(`  cargoBaseId asignados:      ${baseAsignados}`)

await p.$disconnect()
