import { describe, expect, it } from 'vitest'
import {
  codigoMostradoCarrera,
  etiquetaCarrera,
  etiquetaCarreraCR,
  ordenarCarrerasCR,
} from './carreraEtiqueta'

const CPH = 'Nueva Carrera Profesional Hospitalaria'

describe('carreraEtiqueta', () => {
  it('muestra 37 en lugar de 22 y deja el resto', () => {
    expect(codigoMostradoCarrera('22')).toBe('37')
    expect(codigoMostradoCarrera('37')).toBe('37')
    expect(codigoMostradoCarrera('87')).toBe('87')
    expect(codigoMostradoCarrera('85')).toBe('85')
  })
  it('arma etiquetas de escalafón sin 22', () => {
    expect(etiquetaCarrera({ codigo: '22', nombre: CPH })).toBe(`37 — ${CPH}`)
  })

  it('Reportes: 22 y 37 quedan separados y ordenados', () => {
    const r = ordenarCarrerasCR([
      { codigo: '85', literal: 'Técnicos' },
      { codigo: '37', literal: CPH },
      { codigo: '22', literal: 'CPH (22)' },
    ])
    expect(r.map((c) => etiquetaCarreraCR(c))).toEqual([
      '22 — CPH (22)',
      `37 — ${CPH}`,
      '85 — Técnicos',
    ])
  })
})
