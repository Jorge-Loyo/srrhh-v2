import { PrismaClient } from '../apps/api/node_modules/.prisma/client/index.js'

const p = new PrismaClient({ datasources: { db: { url: 'postgresql://srrhh_user:srrhh_pass@127.0.0.1:5433/srrhh_db' } } })

console.log('=== AUDITORÍA CARGOS / CONCURSOS CPH ===\n')

// 1. Total de cargos CPH
const totalCargos = await p.cargo.count({ where: { escalafon: { nombre: { contains: 'Profesional Hospitalaria' } } } })
console.log(`Total cargos CPH: ${totalCargos}`)

// 2. Concursos finalizados con cargoSial
const finalizados = await p.concursoCph.findMany({
  where: { estado: 'finalizado', cargoSial: { not: null } },
  select: {
    id: true, cargoSial: true, personaDesignadaId: true,
    concurso: { select: { cargo: { select: { id: true, idSial: true, codigo: true } } } }
  }
})
console.log(`Concursos finalizados con cargoSial: ${finalizados.length}`)
console.log(`  → con personaDesignadaId: ${finalizados.filter(c => c.personaDesignadaId).length}`)
console.log(`  → sin personaDesignadaId: ${finalizados.filter(c => !c.personaDesignadaId).length}`)

// 3. De los que tienen cargoSial: ¿el cargoSial existe en tabla cargos?
let cargoSialExiste = 0, cargoSialNoExiste = 0
let cargoSialEsMismoCargo = 0, cargoSialEsOtroCargo = 0
let cargoSialConOcupacion = 0, cargoSialSinOcupacion = 0

const resultados = []
for (const cc of finalizados) {
  const cargoNuevo = await p.cargo.findFirst({
    where: { idSial: cc.cargoSial },
    select: { id: true, idSial: true, codigo: true, ocupaciones: { select: { personaId: true, situacionRevista: true }, take: 1 } }
  })
  if (!cargoNuevo) {
    cargoSialNoExiste++
    resultados.push({ concursoCodigo: cc.concurso.cargo.codigo, cargoOriginalIdSial: cc.concurso.cargo.idSial, cargoSial: cc.cargoSial, situacion: 'CARGO_SIAL_NO_EXISTE', cargoNuevoCodigo: null, personaId: null })
    continue
  }
  cargoSialExiste++
  const esMismo = cargoNuevo.id === cc.concurso.cargo.id
  if (esMismo) cargoSialEsMismoCargo++
  else cargoSialEsOtroCargo++
  if (cargoNuevo.ocupaciones[0]?.personaId) cargoSialConOcupacion++
  else cargoSialSinOcupacion++
  resultados.push({
    concursoCodigo: cc.concurso.cargo.codigo,
    cargoOriginalIdSial: cc.concurso.cargo.idSial,
    cargoSial: cc.cargoSial,
    situacion: esMismo ? 'MISMO_CARGO' : 'CARGO_NUEVO',
    cargoNuevoCodigo: cargoNuevo.codigo,
    personaId: cargoNuevo.ocupaciones[0]?.personaId ?? null,
    situacionRevista: cargoNuevo.ocupaciones[0]?.situacionRevista ?? null,
  })
}

console.log(`\n  cargoSial existe en tabla cargos: ${cargoSialExiste}`)
console.log(`  cargoSial NO existe en tabla cargos: ${cargoSialNoExiste}`)
console.log(`  cargoSial = mismo cargo original: ${cargoSialEsMismoCargo}`)
console.log(`  cargoSial = cargo DISTINTO (nuevo): ${cargoSialEsOtroCargo}`)
console.log(`  cargoSial con ocupacion (persona): ${cargoSialConOcupacion}`)
console.log(`  cargoSial sin ocupacion: ${cargoSialSinOcupacion}`)

// 4. Muestra de casos MISMO_CARGO (el cargoSial apunta al mismo cargo que se concursó)
const mismoCargo = resultados.filter(r => r.situacion === 'MISMO_CARGO')
if (mismoCargo.length > 0) {
  console.log(`\n--- MISMO_CARGO (${mismoCargo.length} casos) ---`)
  mismoCargo.slice(0, 10).forEach(r => console.log(`  ${r.concursoCodigo} → cargoSial=${r.cargoSial} (mismo cargo) persona=${r.personaId ? 'SI' : 'NO'}`))
}

// 5. Muestra de casos CARGO_SIAL_NO_EXISTE
const noExiste = resultados.filter(r => r.situacion === 'CARGO_SIAL_NO_EXISTE')
if (noExiste.length > 0) {
  console.log(`\n--- CARGO_SIAL_NO_EXISTE (${noExiste.length} casos) ---`)
  noExiste.slice(0, 10).forEach(r => console.log(`  ${r.concursoCodigo} → cargoSial=${r.cargoSial}`))
}

// 6. Muestra de CARGO_NUEVO sin persona
const sinPersona = resultados.filter(r => r.situacion === 'CARGO_NUEVO' && !r.personaId)
if (sinPersona.length > 0) {
  console.log(`\n--- CARGO_NUEVO sin persona (${sinPersona.length} casos) ---`)
  sinPersona.slice(0, 10).forEach(r => console.log(`  ${r.concursoCodigo} → cargoSial=${r.cargoSial} → ${r.cargoNuevoCodigo}`))
}

// 7. Concursos finalizados SIN cargoSial y sin personaDesignadaId
const sinCargoSial = await p.concursoCph.count({
  where: { estado: 'finalizado', cargoSial: null, personaDesignadaId: null, dispoDesierta: null }
})
console.log(`\nFinalizados sin cargoSial, sin personaDesignadaId, sin dispoDesierta: ${sinCargoSial}`)

await p.$disconnect()
