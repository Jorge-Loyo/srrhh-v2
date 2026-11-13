import { describe, expect, it } from 'vitest'
import {
  codigoMostradoCarrera,
  etiquetaCarrera,
  etiquetaCarreraCR,
  opcionesCarreraConCodigosSeparados,
  opcionesCarreraEscalafon,
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

  it('filtros: la CPH se separa en 22 y 37 y el resto queda igual', () => {
    const esc = [
      { id: 'e85', codigo: '85', nombre: 'Técnicos' },
      { id: 'ecph', codigo: '22', nombre: 'Nueva Carrera Prof. Hosp' },
    ]
    const crs = [
      { id: 'c22', codigo: '22', escalafonId: 'ecph' },
      { id: 'c37', codigo: '37', escalafonId: 'ecph' },
      { id: 'c85', codigo: '85', escalafonId: 'e85' },
    ]
    expect(opcionesCarreraConCodigosSeparados(esc, crs)).toEqual([
      { value: 'cr:c22', label: `22 — ${CPH}` },
      { value: 'cr:c37', label: `37 — ${CPH}` },
      { value: 'e85', label: '85 — Técnicos' },
    ])
  })

  it('escalafón ya pasado a 37 (nombre nuevo) con CR 22 y 37: también separa', () => {
    const esc = [{ id: 'ecph', codigo: '37', nombre: CPH }]
    const crs = [
      { id: 'c22', codigo: '22', escalafonId: 'ecph' },
      { id: 'c37', codigo: '37', escalafonId: 'ecph' },
    ]
    expect(opcionesCarreraConCodigosSeparados(esc, crs)).toEqual([
      { value: 'cr:c22', label: `22 — ${CPH}` },
      { value: 'cr:c37', label: `37 — ${CPH}` },
    ])
  })
  it('escalafón 37 con un solo CR no se divide', () => {
    const esc = [{ id: 'ecph', codigo: '37', nombre: CPH }]
    const crs = [{ id: 'c37', codigo: '37', escalafonId: 'ecph' }]
    expect(opcionesCarreraConCodigosSeparados(esc, crs)).toEqual([{ value: 'ecph', label: `37 — ${CPH}` }])
  })
  it('código de escalafón no numérico con CR: muestra el CR', () => {
    expect(etiquetaCarrera({ codigo: 'Docentes-c32a65d', nombre: 'Docentes', codigosRegistro: [{ codigo: '07' }] })).toBe(
      '07 — Docentes',
    )
  })
  it('código de escalafón no numérico sin CR: solo el nombre', () => {
    expect(etiquetaCarrera({ codigo: 'Docentes-c32a65d', nombre: 'Docentes' })).toBe('Docentes')
    expect(etiquetaCarrera({ codigo: 'ENF', nombre: 'Carrera de Enfermería', codigosRegistro: [] })).toBe(
      'Carrera de Enfermería',
    )
  })
  it('opciones: ordenadas por código mostrado y los sin código al final', () => {
    const esc = [
      { id: 'a', codigo: 'ENF', nombre: 'Carrera de Enfermería' },
      { id: 'b', codigo: '85', nombre: 'CEETPS' },
      { id: 'c', codigo: 'Docentes-c32a65d', nombre: 'Docentes', codigosRegistro: [{ codigo: '07' }] },
    ]
    expect(opcionesCarreraEscalafon(esc).map((o) => o.label)).toEqual([
      '07 — Docentes',
      '85 — CEETPS',
      'Carrera de Enfermería',
    ])
    const sep = opcionesCarreraConCodigosSeparados(esc, [{ id: 'x', codigo: '07', escalafonId: 'c' }])
    expect(sep.map((o) => o.label)).toEqual(['07 — Docentes', '85 — CEETPS', 'Carrera de Enfermería'])
  })
})
