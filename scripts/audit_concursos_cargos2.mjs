import { PrismaClient } from '../apps/api/node_modules/.prisma/client/index.js'

const p = new PrismaClient({ datasources: { db: { url: 'postgresql://srrhh_user:srrhh_pass@127.0.0.1:5433/srrhh_db' } } })

console.log('=== AUDITORÍA CONCURSOS CPH ↔ CARGOS (idSial) ===\n')

// 1. Estado general
const total = await p.concursoCph.count()
const conCargoId = await p.$queryRaw`SELECT COUNT(*) as n FROM concursos_cph WHERE cargo_id IS NOT NULL`
console.log(`Total concursos CPH: ${total}`)
console.log(`Con cargo_id: ${conCargoId[0].n}`)

// 2. ¿Cuántos concursos tienen su cargo con idSial NULL?
const sinIdSial = await p.$queryRaw`
  SELECT COUNT(*) as n FROM concursos_cph cc
  JOIN cargos c ON c.id = cc.cargo_id
  WHERE c.id_sial IS NULL
`
console.log(`Concursos cuyo cargo no tiene idSial: ${sinIdSial[0].n}`)

// 3. Estado de los cargos vinculados a concursos
const estadosCargos = await p.$queryRaw`
  SELECT c.estado, COUNT(*) as n
  FROM concursos_cph cc
  JOIN cargos c ON c.id = cc.cargo_id
  GROUP BY c.estado
  ORDER BY n DESC
`
console.log('\nEstado del cargo original en concursos:')
estadosCargos.forEach(r => console.log(`  ${r.estado}: ${r.n}`))

// 4. Concursos activos con cargo no_vigente (inconsistencia)
const inconsistentes = await p.$queryRaw`
  SELECT cc.id, c.codigo, c.id_sial, cc.estado as estado_concurso, c.estado as estado_cargo
  FROM concursos_cph cc
  JOIN cargos c ON c.id = cc.cargo_id
  WHERE cc.estado = 'activo' AND c.estado = 'no_vigente'
  LIMIT 10
`
console.log(`\nConcursos ACTIVOS con cargo NO_VIGENTE (inconsistencia): ${inconsistentes.length}`)
inconsistentes.forEach(r => console.log(`  ${r.codigo} | idSial=${r.id_sial} | concurso=${r.estado_concurso} | cargo=${r.estado_cargo}`))

// 5. La pregunta clave: ¿hay concursos cuyo cargoId apunta a un cargo
//    que tiene el mismo idSial que otro cargo (duplicado)?
const duplicadosEnConcursos = await p.$queryRaw`
  SELECT c.id_sial, COUNT(DISTINCT c.id) as n_cargos, array_agg(DISTINCT c.codigo) as codigos
  FROM concursos_cph cc
  JOIN cargos c ON c.id = cc.cargo_id
  WHERE c.id_sial IS NOT NULL
  GROUP BY c.id_sial
  HAVING COUNT(DISTINCT c.id) > 1
`
console.log(`\nIdSial duplicados entre cargos vinculados a concursos: ${duplicadosEnConcursos.length}`)

// 6. ¿Hay concursos cuyo cargo tiene un idSial que también existe en OTRO cargo?
//    (el concurso apunta al cargo equivocado)
const cargosMalVinculados = await p.$queryRaw`
  SELECT cc_cargo.codigo as cargo_concurso, cc_cargo.id_sial,
         otro.codigo as otro_cargo, cc.estado as estado_concurso
  FROM concursos_cph cc
  JOIN cargos cc_cargo ON cc_cargo.id = cc.cargo_id
  JOIN cargos otro ON otro.id_sial = cc_cargo.id_sial AND otro.id != cc_cargo.id
  LIMIT 20
`
console.log(`\nConcursos cuyo cargo tiene idSial duplicado en otro cargo: ${cargosMalVinculados.length}`)
cargosMalVinculados.forEach(r => 
  console.log(`  concurso→${r.cargo_concurso} (${r.id_sial}) | otro cargo: ${r.otro_cargo} | estado: ${r.estado_concurso}`)
)

// 7. Resumen: concursos por estado
const porEstado = await p.$queryRaw`
  SELECT estado, COUNT(*) as n FROM concursos_cph GROUP BY estado ORDER BY n DESC
`
console.log('\nConcursos por estado:')
porEstado.forEach(r => console.log(`  ${r.estado}: ${r.n}`))

// 8. ¿Cuántos concursos finalizados tienen personaDesignadaId ahora?
const conPersona = await p.concursoCph.count({ where: { estado: 'finalizado', personaDesignadaId: { not: null } } })
const sinPersona = await p.concursoCph.count({ where: { estado: 'finalizado', personaDesignadaId: null, dispoDesierta: null } })
console.log(`\nFinalizados con personaDesignadaId: ${conPersona}`)
console.log(`Finalizados sin personaDesignadaId y sin dispoDesierta: ${sinPersona}`)

await p.$disconnect()
