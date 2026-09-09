/**
 * backfill_cargo_real.mjs
 *
 * Para cada ConcursoCph finalizado con cargoSial:
 *   cargoSial → Cargo.idSial = cargo real
 *   Si cargo real != cargo original → actualizar:
 *     - concursos_cph.cargo_id = cargo real
 *     - concursos.cargo_id     = cargo real
 *
 * Flags:
 *   --dry-run   solo muestra qué haría, no escribe
 *   --id=UUID   procesa solo ese concurso
 */

import { PrismaClient } from '../apps/api/node_modules/.prisma/client/index.js'

const p = new PrismaClient({ datasources: { db: { url: 'postgresql://srrhh_user:srrhh_pass@127.0.0.1:5433/srrhh_db' } } })

const dryRun = process.argv.includes('--dry-run')
const idArg  = process.argv.find(a => a.startsWith('--id='))?.split('=')[1]

console.log(`Modo: ${dryRun ? 'DRY-RUN' : 'ESCRITURA'}${idArg ? ` | solo id=${idArg}` : ''}\n`)

const concursos = await p.concursoCph.findMany({
  where: {
    estado: 'finalizado',
    cargoSial: { not: null },
    ...(idArg && { id: idArg }),
  },
  select: {
    id: true, cargoSial: true,
    concurso: { select: { id: true, cargo: { select: { id: true, codigo: true, idSial: true } } } }
  }
})

console.log(`Concursos a evaluar: ${concursos.length}\n`)

let actualizados = 0, yaCorrectos = 0, sinCargoReal = 0, errores = 0

for (const cc of concursos) {
  const cargoOriginal = cc.concurso.cargo

  const cargoReal = await p.cargo.findFirst({
    where: { idSial: cc.cargoSial },
    select: { id: true, codigo: true, idSial: true }
  })

  if (!cargoReal) {
    console.log(`  SKIP ${cargoOriginal.codigo} → cargoSial=${cc.cargoSial} no existe`)
    sinCargoReal++
    continue
  }

  if (cargoReal.id === cargoOriginal.id) {
    yaCorrectos++
    continue
  }

  console.log(`  ${dryRun ? '[DRY]' : 'OK  '} ${cargoOriginal.codigo} → ${cargoReal.codigo} (${cc.cargoSial})`)

  if (!dryRun) {
    try {
      // Actualizar en transacción: concursos_cph.cargo_id y concursos.cargo_id
      await p.$transaction([
        p.concursoCph.update({
          where: { id: cc.id },
          data: { cargoId: cargoReal.id }
        }),
        p.concurso.update({
          where: { id: cc.concurso.id },
          data: { cargoId: cargoReal.id }
        }),
      ])
      actualizados++
    } catch (e) {
      console.error(`  ERROR ${cargoOriginal.codigo}: ${e.message}`)
      errores++
    }
  } else {
    actualizados++
  }
}

console.log(`\n=== RESULTADO ===`)
console.log(`  Actualizados:   ${actualizados}`)
console.log(`  Ya correctos:   ${yaCorrectos}`)
console.log(`  Sin cargo real: ${sinCargoReal}`)
console.log(`  Errores:        ${errores}`)

await p.$disconnect()
