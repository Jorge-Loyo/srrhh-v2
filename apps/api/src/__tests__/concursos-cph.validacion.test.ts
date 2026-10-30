// =============================================================================
// Test de la lógica pura de coincidencia de especialidad usada en la validación
// de designación de concursos CPH (getDesignacionEstadoService). Se importan las
// funciones REALES del service (puras, sin Prisma ni side effects), siguiendo el
// patrón del repo (ver concursos-cph-dedup.unit.test.ts).
//
// Fix: un concurso "sin especialidad" (null / vacío / placeholder) NO debe
// bloquear la validación por especialidad — alcanza con que coincida la carrera.
// Caso real: CPH-POU-003128 (especialidad_solicitada='sin especialidad') con la
// persona designada (Vargas Ruiz) cuyo rol vigente tiene especialidad NULL.
// Si el concurso SÍ pide una especialidad concreta, la validación sigue exigiendo
// el match (no se afloja).
// =============================================================================

import {
  especialidadCoincide,
  especialidadConcursoExigida,
} from '../modules/concursos-cph/concursos-cph.service.js'

describe('especialidadConcursoExigida — ¿el concurso pide especialidad concreta?', () => {
  it('placeholder "sin especialidad" → NO exige', () => {
    expect(especialidadConcursoExigida('sin especialidad')).toBe(false)
    expect(especialidadConcursoExigida('SIN ESPECIALIDAD')).toBe(false)
    expect(especialidadConcursoExigida('Sin Especialidad')).toBe(false)
  })

  it('null y vacío → NO exige', () => {
    expect(especialidadConcursoExigida(null)).toBe(false)
    expect(especialidadConcursoExigida(undefined)).toBe(false)
    expect(especialidadConcursoExigida('')).toBe(false)
    expect(especialidadConcursoExigida('   ')).toBe(false)
  })

  it('especialidad concreta → SÍ exige', () => {
    expect(especialidadConcursoExigida('cardiologia')).toBe(true)
    expect(especialidadConcursoExigida('Cardiología')).toBe(true)
  })
})

describe('especialidadCoincide — criterio de especialidad en la validación de designación', () => {
  // (1) Caso Vargas Ruiz: concurso "sin especialidad" + rol con especialidad
  //     NULL + (la carrera coincide aparte) → VALIDA por especialidad.
  it('concurso "sin especialidad" + rol especialidad NULL → true', () => {
    expect(especialidadCoincide('sin especialidad', null, null)).toBe(true)
  })

  // (2) concurso "sin especialidad" + rol con especialidad cualquiera → VALIDA
  //     (no exige especialidad, no se usa como criterio de bloqueo).
  it('concurso "sin especialidad" + rol con especialidad cualquiera → true', () => {
    expect(especialidadCoincide('sin especialidad', 'pediatria', null)).toBe(true)
  })

  // (3) concurso con especialidad concreta + rol que matchea → VALIDA.
  it('concurso "cardiologia" + rol "cardiologia" → true', () => {
    expect(especialidadCoincide('cardiologia', 'cardiologia', null)).toBe(true)
  })

  it('concurso "cardiologia" + rol "Cardiología" (acentos/mayúsculas) → true', () => {
    expect(especialidadCoincide('cardiologia', 'Cardiología', null)).toBe(true)
  })

  it('concurso "cardiologia" + match por especialidadCph de la persona → true', () => {
    expect(especialidadCoincide('cardiologia', null, 'Cardiología')).toBe(true)
  })

  // (4) concurso con especialidad concreta + rol que NO matchea → NO valida
  //     (lógica sensible: no debe aflojarse cuando el concurso pide especialidad).
  it('concurso "cardiologia" + rol "pediatria" → false (sigue bloqueando)', () => {
    expect(especialidadCoincide('cardiologia', 'pediatria', null)).toBe(false)
  })

  it('concurso "cardiologia" + rol especialidad NULL → false (sigue bloqueando)', () => {
    expect(especialidadCoincide('cardiologia', null, null)).toBe(false)
  })

  // (5) concurso especialidad null / '' → mismo trato que "sin especialidad".
  it('concurso null → true (no exige especialidad)', () => {
    expect(especialidadCoincide(null, null, null)).toBe(true)
    expect(especialidadCoincide(null, 'pediatria', null)).toBe(true)
  })

  it('concurso "" → true (no exige especialidad)', () => {
    expect(especialidadCoincide('', null, null)).toBe(true)
    expect(especialidadCoincide('', 'pediatria', null)).toBe(true)
  })
})
