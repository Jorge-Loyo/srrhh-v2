/**
 * Backfill one-shot: normaliza `organigramas.desc_rep` a minúscula + sin
 * tilde (mantiene ñ) — regla del proyecto (§9.1), misma que ya aplica
 * Dotaneitor sobre cargos/personas/ocupaciones desde S22. El árbol legacy
 * (import-organigrama.ts / reemplazarOrganigramaService) nunca pasó por esa
 * normalización — hallazgo 2026-10-05 al revisar toda la BD. Ambos puntos de
 * escritura ya quedaron parcheados para que las próximas cargas del Excel
 * entren normalizadas solas; este script es solo para las 4.310 filas que
 * ya estaban cargadas.
 *
 * No toca tipo/codigo_reparticion/sigla/padre/universo_totalizador/
 * regimen_empleo (códigos/claves usados en comparaciones exactas en otro
 * lado del código) — solo desc_rep, que es texto libre de display.
 *
 * Uso:
 *   cd apps/api
 *   pnpm exec tsx scripts/normalizar_organigrama.ts --dry-run
 *   pnpm exec tsx scripts/normalizar_organigrama.ts
 */
import { PrismaClient } from '@prisma/client'
import { normalizarTexto } from '@srrhh/normalizacion'

const prisma = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')

async function main() {
  const filas = await prisma.organigrama.findMany({
    select: { codigoReparticion: true, descRep: true },
  })

  let cambios = 0
  const ejemplos: Array<{ antes: string; despues: string }> = []

  for (const f of filas) {
    if (f.descRep === null) continue
    const normalizado = normalizarTexto(f.descRep)
    if (normalizado === f.descRep) continue
    cambios++
    if (ejemplos.length < 8) ejemplos.push({ antes: f.descRep, despues: normalizado })
    if (!dryRun) {
      await prisma.organigrama.update({
        where: { codigoReparticion: f.codigoReparticion },
        data: { descRep: normalizado },
      })
    }
  }

  console.log(`${dryRun ? '[DRY RUN] ' : ''}${cambios} / ${filas.length} filas de organigramas.desc_rep normalizadas`)
  for (const e of ejemplos) console.log(`  "${e.antes}" -> "${e.despues}"`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
