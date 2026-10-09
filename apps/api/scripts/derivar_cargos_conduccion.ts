/**
 * S24-4/5: CLI del backfill de cargos de conducción vacantes del organigrama.
 *
 * La lógica vive en src/shared/derivarCargosConduccion.ts (reutilizada por
 * reemplazarOrganigramaService para la re-sincronización S24-7). Este script
 * es solo el envoltorio de línea de comandos.
 *
 * Uso:
 *   cd apps/api
 *   pnpm exec tsx scripts/derivar_cargos_conduccion.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client'
import { derivarCargosConduccionService } from '../src/shared/derivarCargosConduccion.js'

const prisma = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')

async function main() {
  console.log(`🏗️  Derivación de cargos de conducción vacantes (S24-4/5)${dryRun ? ' [DRY RUN]' : ''}...\n`)

  const res = await derivarCargosConduccionService(prisma, { dryRun })

  console.log(`   Nodos candidatos: ${res.candidatos}\n`)
  if (res.candidatos === 0) {
    console.log('🎉 Sin nodos a procesar (todos ya tienen cargo generado o jefatura activa).')
    return
  }

  for (const d of res.detalle) {
    console.log(`   ✅ ${d.codigoRepa}  →  ${d.codigo}${d.frio ? '  ⚠️ fría' : ''}`)
  }

  console.log(`\n📊 Resultado:`)
  console.log(`   Cargos ${dryRun ? 'a generar' : 'generados'}:  ${res.creados}`)
  console.log(`   Saltados (error de mapeo): ${res.saltados}`)
  if (res.errores.length > 0) {
    console.log(`\n⚠️  Errores de mapeo:`)
    for (const e of res.errores) console.log(`   · ${e}`)
  }
  console.log(`\n🎉 ${dryRun ? 'Dry-run completado.' : 'Derivación completada.'}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
