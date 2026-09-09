import { PrismaClient } from '../apps/api/node_modules/.prisma/client/index.js'

const p = new PrismaClient({ datasources: { db: { url: 'postgresql://srrhh_user:srrhh_pass@127.0.0.1:5433/srrhh_db' } } })

console.log('=== AUDITORÍA: concurso.cargoId vs cargoSial → cargo real ===\n')

// Para cada concurso finalizado con cargoSial:
// - cargo original = concurso.cargo (el que entró en concurso)
// - cargo real     = Cargo donde idSial = cargoSial (el que se asignó a la persona)
// Si son distintos → el concurso debería estar vinculado al cargo real

const finalizados = await p.concursoCph.findMany({
  where: { estado: 'finalizado', cargoSial: { not: null } },
  select: {
    id: true, cargoSial: true,
    concurso: { select: {
      id: true,
      cargo: { select: { id: true, idSial: true, codigo: true, literalPuesto: true,
        hospital: { select: { sigla: true } }
      }}
    }}
  }
})

let mismoHospital = 0, distintoHospital = 0
let mismoCargo = 0, distinto = 0
const casos = []

for (const cc of finalizados) {
  const cargoOriginal = cc.concurso.cargo
  const cargoReal = await p.cargo.findFirst({
    where: { idSial: cc.cargoSial },
    select: { id: true, idSial: true, codigo: true, literalPuesto: true,
      hospital: { select: { sigla: true } }
    }
  })
  if (!cargoReal) continue

  if (cargoReal.id === cargoOriginal.id) {
    mismoCargo++
    continue
  }

  distinto++
  const mismoH = cargoReal.hospital?.sigla === cargoOriginal.hospital?.sigla
  if (mismoH) mismoHospital++
  else distintoHospital++

  casos.push({
    concursoId: cc.id,
    cargoOriginalCodigo: cargoOriginal.codigo,
    cargoOriginalIdSial: cargoOriginal.idSial,
    cargoRealCodigo: cargoReal.codigo,
    cargoRealIdSial: cargoReal.idSial,
    mismoHospital: mismoH,
    hospital: cargoOriginal.hospital?.sigla,
  })
}

console.log(`Total finalizados con cargoSial: ${finalizados.length}`)
console.log(`  cargoSial = mismo cargo original: ${mismoCargo}`)
console.log(`  cargoSial = cargo DISTINTO (real): ${distinto}`)
console.log(`    → mismo hospital: ${mismoHospital}`)
console.log(`    → distinto hospital: ${distintoHospital}`)

console.log('\nMuestra de casos (cargo original vs cargo real):')
casos.slice(0, 20).forEach(c =>
  console.log(`  ${c.cargoOriginalCodigo} (${c.cargoOriginalIdSial}) → real: ${c.cargoRealCodigo} (${c.cargoRealIdSial}) | hospital: ${c.hospital} | mismoH: ${c.mismoHospital}`)
)

// ¿El cargo original tiene OTRO concurso también? (para saber si es duplicado puro)
console.log('\nVerificando si los cargos originales tienen otros concursos...')
let cargoOriginalSinOtroConcurso = 0, cargoOriginalConOtroConcurso = 0
for (const c of casos.slice(0, 10)) {
  const otrosConcursos = await p.concursoCph.count({
    where: { concurso: { cargoId: (await p.cargo.findFirst({ where: { codigo: c.cargoOriginalCodigo }, select: { id: true } }))?.id } }
  })
  if (otrosConcursos <= 1) cargoOriginalSinOtroConcurso++
  else cargoOriginalConOtroConcurso++
  console.log(`  ${c.cargoOriginalCodigo} → ${otrosConcursos} concurso(s)`)
}

await p.$disconnect()
