import { describe, expect, it } from 'vitest'
import { aplanarFechasCeetps, errorEnCadenaFechas } from '@srrhh/types'

const base = aplanarFechasCeetps({
  fechaCaratulacion: '2026-01-10',
  fechaAutorizacion: '2026-02-01',
  fechaIfacs: '2026-06-01',
  fechaInsal: '2026-07-01',
  cronograma: {
    inscripcion_desde: '2026-03-01',
    examen: '2026-04-15',
    adjudicacion_cargos: '2026-12-01',
  },
})

describe('errorEnCadenaFechas', () => {
  it('acepta fechas iguales o posteriores a las anteriores', () => {
    expect(errorEnCadenaFechas(base, { fechaAptoMedico: '2026-07-01' })).toBeNull()
    expect(errorEnCadenaFechas(base, { fechaAptoMedico: '2026-08-10' })).toBeNull()
  })
  it('rechaza una fecha anterior a un paso previo', () => {
    const e = errorEnCadenaFechas(base, { fechaAptoMedico: '2026-06-30' })
    expect(e).toContain('Fecha apto médico')
    expect(e).toContain('anterior a «Fecha INSAL»')
  })
  it('rechaza mover un paso previo más allá de uno posterior', () => {
    const e = errorEnCadenaFechas(base, { fechaIfacs: '2026-08-01' })
    expect(e).toContain('posterior a «Fecha INSAL»')
  })
  it('valida el cronograma contra el resto de la cadena', () => {
    expect(errorEnCadenaFechas(base, { 'cronograma.analisis_curricular': '2026-05-01' })).toBeNull()
    expect(errorEnCadenaFechas(base, { 'cronograma.analisis_curricular': '2026-06-15' })).toContain(
      'posterior a «Fecha IFACS»',
    )
  })
  it('"adjudicación de cargos" solo se compara con el cronograma', () => {
    expect(errorEnCadenaFechas(base, { 'cronograma.adjudicacion_cargos': '2026-12-31' })).toBeNull()
    expect(errorEnCadenaFechas(base, { 'cronograma.adjudicacion_cargos': '2026-04-01' })).toContain(
      'anterior a',
    )
  })
  it('borrar una fecha o no cambiarla nunca falla (concursos viejos desordenados)', () => {
    expect(errorEnCadenaFechas(base, { fechaIfacs: null })).toBeNull()
    expect(errorEnCadenaFechas(base, { fechaIfacs: '2026-06-01' })).toBeNull()
  })
  it('acepta fechas ISO con hora', () => {
    expect(errorEnCadenaFechas(base, { fechaAptoMedico: '2026-07-02T00:00:00.000Z' })).toBeNull()
  })
})
