import { describe, expect, it } from 'vitest'
import {
  codigoMostradoCarrera,
  etiquetaCarrera,
  etiquetaCarreraCR,
  expandirCarrerasParaConsulta,
  unificarCarrerasCph,
} from './carreraEtiqueta'

const CPH = 'Nueva Carrera Profesional Hospitalaria'

describe('carreraEtiqueta', () => {
  it('muestra 37 en lugar de 22 y deja el resto', () => {
    expect(codigoMostradoCarrera('22')).toBe('37')
    expect(codigoMostradoCarrera('37')).toBe('37')
    expect(codigoMostradoCarrera('87')).toBe('87')
    expect(codigoMostradoCarrera('85')).toBe('85')
  })
  it('arma etiquetas sin 22', () => {
    expect(etiquetaCarreraCR({ codigo: '22', literal: CPH })).toBe(`37 — ${CPH}`)
    expect(etiquetaCarrera({ codigo: '22', nombre: CPH })).toBe(`37 — ${CPH}`)
  })
  it('unifica 37 y 22 en una opción y ordena numéricamente', () => {
    const r = unificarCarrerasCph([
      { codigo: '85', literal: 'Técnicos' },
      { codigo: '22', literal: 'CPH (22)' },
      { codigo: '37', literal: CPH },
      { codigo: '9', literal: 'Otra' },
    ])
    expect(r).toEqual([
      { codigo: '9', literal: 'Otra' },
      { codigo: '37', literal: CPH },
      { codigo: '85', literal: 'Técnicos' },
    ])
    expect(r.some((c) => etiquetaCarreraCR(c).startsWith('22'))).toBe(false)
  })
  it('expande 37 a 37 y 22 sin duplicar', () => {
    expect(expandirCarrerasParaConsulta(['37'])).toEqual(['37', '22'])
    expect(expandirCarrerasParaConsulta(['37', '22'])).toEqual(['37', '22'])
    expect(expandirCarrerasParaConsulta(['85'])).toEqual(['85'])
    expect(expandirCarrerasParaConsulta([])).toEqual([])
  })
  it('paridad: sin 37 los parámetros son idénticos', () => {
    const sel = ['85', '87']
    expect(expandirCarrerasParaConsulta(sel)).toEqual(sel)
  })
})
