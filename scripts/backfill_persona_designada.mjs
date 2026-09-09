/**
 * backfill_persona_designada.mjs
 * 
 * Para cada ConcursoCph finalizado con cargoSial pero sin personaDesignadaId:
 *   cargoSial → Cargo.idSial → Ocupacion.personaId → ConcursoCph.personaDesignadaId
 * 
 * Flags:
 *   --dry-run   solo muestra qué haría, no escribe
 *   --id=UUID   procesa solo ese concurso
 */

import { PrismaClient } from '../apps/api/node_modules/.prisma/client/index.js'

const DB = 'postgresql://srrhh_user:srrhh_pass@127.0.0.1:5433/srrhh_db'
const p = new PrismaClient({ datasources: { db: { url: DB } } })

const dryRun = process.argv.includes('--dry-run')
const idArg  = process.argv.find(a => a.startsWith('--id='))?.split('=')[1]

console.log(`Modo: ${dryRun ? 'DRY-RUN' : 'ESCRITURA'}${idArg ? ` | solo id=${idArg}` : ''}`)

const where = {
  estado: 'finalizado',
  cargoSial: { not: null },
  personaDesignadaId: null,
  ...(idArg && { id: idArg }),
}

const concursos = await p.concursoCph.findMany({
  where,
  select: {
    id: true, cargoSial: true,
    concurso: { select: { cargo: { select: { codigo: true } } } }
  }
})

console.log(`Concursos a procesar: ${concursos.length}\n`)

let actualizados = 0, sinOcupacion = 0, sinCargo = 0, errores = 0

for (const cc of concursos) {
  const codigo = cc.concurso.cargo.codigo

  // Buscar cargo nuevo por idSial
  const cargoNuevo = await p.cargo.findFirst({
    where: { idSial: cc.cargoSial },
    select: {
      id: true, codigo: true,
      ocupaciones: {
        select: { personaId: true, situacionRevista: true },
        orderBy: { desde: 'desc' },
        take: 1,
      }
    }
  })

  if (!cargoNuevo) {
    console.log(`  SKIP ${codigo} → cargoSial=${cc.cargoSial} no existe en cargos`)
    sinCargo++
    continue
  }

  const personaId = cargoNuevo.ocupaciones[0]?.personaId
  if (!personaId) {
    console.log(`  SKIP ${codigo} → ${cargoNuevo.codigo} sin ocupacion`)
    sinOcupacion++
    continue
  }

  console.log(`  ${dryRun ? '[DRY]' : 'OK  '} ${codigo} → cargoSial=${cc.cargoSial} → ${cargoNuevo.codigo} → persona=${personaId}`)

  if (!dryRun) {
    try {
      await p.concursoCph.update({
        where: { id: cc.id },
        data: { personaDesignadaId: personaId }
      })
      actualizados++
    } catch (e) {
      console.error(`  ERROR ${codigo}: ${e.message}`)
      errores++
    }
  } else {
    actualizados++
  }
}

console.log(`\n=== RESULTADO ===`)
console.log(`  Actualizados:  ${actualizados}`)
console.log(`  Sin cargo:     ${sinCargo}`)
console.log(`  Sin ocupacion: ${sinOcupacion}`)
console.log(`  Errores:       ${errores}`)

await p.$disconnect()
