import { describe, expect, it } from 'vitest'
import { coincideCarrera } from './incidencias.clasificacion.js'

describe('coincideCarrera', () => {
  it('sin filtro coincide siempre', () => {
    expect(coincideCarrera('', 'X', null)).toBe(true)
    expect(coincideCarrera(undefined, null, null)).toBe(true)
  })
  it('cr:<código> separa 22 y 37 dentro del mismo escalafón', () => {
    expect(coincideCarrera('cr:22', 'Nueva Carrera Prof. Hosp', '22')).toBe(true)
    expect(coincideCarrera('cr:22', 'Nueva Carrera Prof. Hosp', '37')).toBe(false)
    expect(coincideCarrera('cr:37', 'Nueva Carrera Prof. Hosp', '37')).toBe(true)
    expect(coincideCarrera('cr:37', 'Nueva Carrera Prof. Hosp', null)).toBe(false)
  })
  it('por nombre de escalafón (normalizado), como antes', () => {
    expect(coincideCarrera('enfermeria', 'Enfermería', '87')).toBe(true)
    expect(coincideCarrera('Técnico', 'Profesional', '85')).toBe(false)
  })
})
