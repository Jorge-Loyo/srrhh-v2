import { describe, it, expect } from 'vitest'
import { esValidableContraConcurso } from './padron.service.js'

// ─── Paso 2 — enganche automático padrón → concurso designado ────────────────
//
// Unit del predicado puro `esValidableContraConcurso`, que decide si un diff del
// padrón "cierra" un concurso designado: SOLO cuando coinciden carrera
// (escalafón) Y especialidad. Es la guarda que evita enganches indebidos: un
// match sólo por CUIL (sin carrera/especialidad) NO engancha y queda para la
// decisión manual existente.

describe('esValidableContraConcurso — guarda carrera + especialidad', () => {
  const ESC_A = 'escalafon-a'
  const ESC_B = 'escalafon-b'

  it('match validable (carrera + especialidad coinciden) → engancha', () => {
    const r = esValidableContraConcurso({
      escalafonDiffId: ESC_A,
      especialidadDiff: 'Clínica Médica',
      escalafonConcursoId: ESC_A,
      especialidadConcurso: 'Clinica Medica', // sin acento: la normalización ignora tildes/mayúsculas
    })
    expect(r.carreraCoincide).toBe(true)
    expect(r.especialidadCoincide).toBe(true)
    expect(r.validable).toBe(true)
  })

  it('carrera NO coincide → NO engancha', () => {
    const r = esValidableContraConcurso({
      escalafonDiffId: ESC_A,
      especialidadDiff: 'Clínica Médica',
      escalafonConcursoId: ESC_B,
      especialidadConcurso: 'Clínica Médica',
    })
    expect(r.carreraCoincide).toBe(false)
    expect(r.validable).toBe(false)
  })

  it('especialidad NO coincide → NO engancha', () => {
    const r = esValidableContraConcurso({
      escalafonDiffId: ESC_A,
      especialidadDiff: 'Pediatría',
      escalafonConcursoId: ESC_A,
      especialidadConcurso: 'Clínica Médica',
    })
    expect(r.especialidadCoincide).toBe(false)
    expect(r.validable).toBe(false)
  })

  it('sin escalafón resuelto del diff → NO engancha', () => {
    const r = esValidableContraConcurso({
      escalafonDiffId: null,
      especialidadDiff: 'Clínica Médica',
      escalafonConcursoId: ESC_A,
      especialidadConcurso: 'Clínica Médica',
    })
    expect(r.carreraCoincide).toBe(false)
    expect(r.validable).toBe(false)
  })

  it('especialidad vacía en el concurso o en el diff → NO engancha', () => {
    expect(
      esValidableContraConcurso({
        escalafonDiffId: ESC_A,
        especialidadDiff: null,
        escalafonConcursoId: ESC_A,
        especialidadConcurso: 'Clínica Médica',
      }).validable,
    ).toBe(false)
    expect(
      esValidableContraConcurso({
        escalafonDiffId: ESC_A,
        especialidadDiff: 'Clínica Médica',
        escalafonConcursoId: ESC_A,
        especialidadConcurso: null,
      }).validable,
    ).toBe(false)
  })
})

// ─── Integración transaccional (requiere DB — la corre Jorge) ────────────────
//
// El enganche real (resolver vincularConcursoId por CUIL, delegar en
// aprobarDiffNuevoService, reconciliar la ocupación MANUAL, ocupar el cargo del
// concurso y recalcular a 'o-alta sial') toca Prisma dentro de una transacción
// y no puede ejecutarse en esta suite pura (sin DB). Se deja como esqueleto el
// contrato a verificar contra una DB de prueba:
describe.skip('enganche automático padrón → ocupado (integración DB)', () => {
  it('diff nuevo con CUIL de un designado validable: ocupa el cargo del CONCURSO, no crea un cargo paralelo por id_sial', () => {
    // 1) Seed: concurso en n-designado con persona designada (CUIL X), cargo del
    //    concurso sin ocupación. Snapshot con un diff "nuevo" cuyo CUIL == X,
    //    mismo escalafón y especialidad que el concurso.
    // 2) aprobarTodosDiffsPendientesService resuelve vincularConcursoId por CUIL.
    // 3) Esperar: NO aparece un segundo cargo por datos.id_sial; el cargo del
    //    concurso queda estado='vigente' + sub_estado='ocupado'; el concurso
    //    queda validado=true y subEstado='o-alta sial'.
    expect(true).toBe(true)
  })

  it('reconciliación de la ocupación MANUAL: actualiza el idSialRol en vez de crear otra', () => {
    // 1) Seed: cargo del concurso con una Ocupacion viva idSialRol
    //    'MANUAL-{cargo8}-2026-01-01' (designación manual previa).
    // 2) Diff del padrón trae el id_sial_rol real.
    // 3) Esperar: la MISMA ocupación queda con idSialRol = diff.idSialRol (no se
    //    crea una segunda; no se viola Ocupacion.idSialRol @unique).
    expect(true).toBe(true)
  })

  it('reejecución de "aprobar todos" es idempotente (no re-valida ni duplica ocupación)', () => {
    expect(true).toBe(true)
  })
})
