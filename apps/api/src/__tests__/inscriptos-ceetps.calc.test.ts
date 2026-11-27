import { describe, it, expect } from 'vitest'
import { evaluarPasos } from '../modules/concursos-ceetps/inscriptos.calc.js'

// =============================================================================
// Pasos del concurso CEETPS: admisibilidad → examen → CV → entrevista. Cada paso
// se evalúa solo si se aprobó el anterior; null = todavía no se puede decir.
// =============================================================================
const sinMinimos = { examen: null, cv: null, entrevista: null }
const minimos = { examen: 60, cv: 7, entrevista: 5 }

const completo = {
  admitido: true,
  presentoExamen: true,
  notaExamen: 80,
  puntajeCv: 8,
  puntajeEntrevista: 6,
}

describe('evaluarPasos', () => {
  it('admisión pendiente: todo null y no es finalista', () => {
    expect(evaluarPasos({ ...completo, admitido: null }, minimos)).toEqual({
      pasaAdmision: null,
      pasaExamen: null,
      pasaCv: null,
      pasaEntrevista: null,
      finalista: false,
    })
  })

  it('no admitido corta la cadena aunque tenga notas cargadas', () => {
    expect(evaluarPasos({ ...completo, admitido: false }, minimos)).toEqual({
      pasaAdmision: false,
      pasaExamen: null,
      pasaCv: null,
      pasaEntrevista: null,
      finalista: false,
    })
  })

  it('nota igual al mínimo aprueba', () => {
    expect(evaluarPasos({ ...completo, notaExamen: 60 }, minimos).pasaExamen).toBe(true)
  })

  it('nota menor al mínimo desaprueba y corta los pasos siguientes', () => {
    const r = evaluarPasos({ ...completo, notaExamen: 59.5 }, minimos)
    expect(r.pasaExamen).toBe(false)
    expect(r.pasaCv).toBeNull()
    expect(r.finalista).toBe(false)
  })

  it('sin mínimo configurado, cualquier puntaje cargado aprueba', () => {
    expect(evaluarPasos({ ...completo, notaExamen: 1, puntajeCv: 0 }, sinMinimos)).toMatchObject({
      pasaExamen: true,
      pasaCv: true,
    })
  })

  it('no se presentó al examen: pasaExamen null', () => {
    expect(evaluarPasos({ ...completo, presentoExamen: false }, minimos).pasaExamen).toBeNull()
  })

  it('aprobó el examen pero sin puntaje de CV: pasaCv null', () => {
    const r = evaluarPasos({ ...completo, puntajeCv: null }, minimos)
    expect(r.pasaExamen).toBe(true)
    expect(r.pasaCv).toBeNull()
    expect(r.pasaEntrevista).toBeNull()
  })

  it('finalista solo con los tres pasos aprobados', () => {
    expect(evaluarPasos(completo, minimos).finalista).toBe(true)
    expect(evaluarPasos({ ...completo, puntajeEntrevista: 4 }, minimos).finalista).toBe(false)
  })
})
