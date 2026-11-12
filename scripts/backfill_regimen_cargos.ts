/**
 * backfill_regimen_cargos.ts  (FEAT-003)
 *
 * Backfill del RÉGIMEN persistido (cargos.regimen_id) para los cargos ya
 * existentes, aplicando la MISMA regla CR→régimen que el pipeline en vivo. NO
 * duplica la lógica: importa `derivarRegimen` (núcleo puro) y `normalizarTexto`
 * del código fuente TS; así el backfill y el alta online nunca divergen.
 *
 * Para cada cargo NO borrado (deleted_at IS NULL):
 *   - crCodigo = código del CR del cargo (via codigos_registro).
 *   - decision = derivarRegimen(crCodigo, normalizarTexto(literal_puesto)).
 *   - Si regimenNombre != null y existe en el catálogo → update { regimen_id }.
 *   - Si regimenNombre == null (o el nombre no está en el catálogo) → se deja
 *     regimen_id en NULL, se marca revision_dato=true y se CONCATENA el motivo
 *     al revision_motivo existente (' | ', truncado a 200) sin pisarlo.
 *
 * La columna legacy cargos.regimen NO se toca.
 *
 * Toma la conexión de process.env.DATABASE_URL (NO hardcodea la URL). Correr
 * con tsx desde el workspace de la api para que resuelvan los imports de
 * workspace, igual que db:seed. Ejemplos:
 *
 *   # dry-run (no escribe; imprime desglose por régimen + conteo a revisión)
 *   pnpm --filter @srrhh/api exec tsx --env-file=../../.env ../../scripts/backfill_regimen_cargos.ts --dry-run
 *
 *   # escritura real
 *   pnpm --filter @srrhh/api exec tsx --env-file=../../.env ../../scripts/backfill_regimen_cargos.ts
 *
 * ADVERTENCIA: el schema local apunta a Neon (producción). NO ejecutar contra
 * Neon sin el visto bueno del responsable. Este script se ENTREGA escrito; lo
 * aplica el usuario a mano.
 */
import { PrismaClient } from '@prisma/client'
import { normalizarTexto } from '@srrhh/normalizacion'
import { derivarRegimen } from '../apps/api/src/modules/padron/derivarRegimen.js'

const LOTE = 2000

const dryRun = process.argv.includes('--dry-run')

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: falta DATABASE_URL en el entorno (usá --env-file=.env).')
    process.exit(1)
  }

  const prisma = new PrismaClient()
  console.log(`Modo: ${dryRun ? 'DRY-RUN (no escribe)' : 'ESCRITURA'}\n`)

  try {
    // ── Catálogos (una sola vez) ──
    const regimenes = await prisma.regimen.findMany({ select: { id: true, nombre: true } })
    const regimenPorNombre = new Map(regimenes.map((r) => [r.nombre, r]))

    const crs = await prisma.codigoRegistro.findMany({ select: { id: true, codigo: true } })
    const crCodigoPorId = new Map(crs.map((c) => [c.id, c.codigo]))

    // ── Recorrido por lotes (keyset por id) ──
    const porRegimen = new Map<string, number>() // nombre de régimen → cantidad
    let aRevision = 0
    let actualizados = 0
    let total = 0
    let cursorId: string | undefined

    for (;;) {
      const lote = await prisma.cargo.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          literalPuesto: true,
          codigoRegistroId: true,
          revisionDato: true,
          revisionMotivo: true,
        },
        orderBy: { id: 'asc' },
        take: LOTE,
        ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      })
      if (lote.length === 0) break
      cursorId = lote[lote.length - 1]!.id

      for (const cargo of lote) {
        total++
        const crCodigo = cargo.codigoRegistroId
          ? (crCodigoPorId.get(cargo.codigoRegistroId) ?? null)
          : null
        const decision = derivarRegimen(crCodigo, normalizarTexto(cargo.literalPuesto))

        if (decision.regimenNombre !== null) {
          const regimen = regimenPorNombre.get(decision.regimenNombre)
          if (regimen) {
            porRegimen.set(decision.regimenNombre, (porRegimen.get(decision.regimenNombre) ?? 0) + 1)
            if (!dryRun) {
              await prisma.cargo.update({
                where: { id: cargo.id },
                data: { regimenId: regimen.id },
              })
            }
            actualizados++
            continue
          }
        }

        // No derivable (o nombre ausente del catálogo): regimen_id NULL +
        // marca de revisión aditiva (sin pisar un motivo preexistente).
        aRevision++
        const motivo =
          decision.revision?.motivo ??
          `régimen derivado "${decision.regimenNombre}" no existe en el catálogo regimenes`
        if (!dryRun) {
          const motivoFinal = (
            cargo.revisionMotivo ? `${cargo.revisionMotivo} | ${motivo}` : motivo
          ).slice(0, 200)
          await prisma.cargo.update({
            where: { id: cargo.id },
            data: { regimenId: null, revisionDato: true, revisionMotivo: motivoFinal },
          })
        }
      }
    }

    console.log('=== DESGLOSE POR RÉGIMEN ===')
    for (const [nombre, cant] of [...porRegimen.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${cant.toString().padStart(6)}  ${nombre}`)
    }
    console.log('\n=== RESUMEN ===')
    console.log(`  Cargos evaluados: ${total}`)
    console.log(`  Con régimen:      ${actualizados}`)
    console.log(`  A revisión:       ${aRevision}`)
    if (dryRun) console.log('\n  (DRY-RUN: no se escribió nada)')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
