import { describe, it, expect } from 'vitest'
import { esCarreraGestionada, etiquetaCarrera, opcionesCarreraAlta, filtrarPuestosAlta, pideIncluirAmbosAlta } from './carrerasGestionadas'

const cat = [
  { id: 'a', codigo: '83', nombre: 'Nueva Carrera Administrativa' },
  { id: 'b', codigo: '85', nombre: 'CEETPS' },
  { id: 'c', codigo: '87', nombre: 'Nueva Carrera Enfermería' },
  { id: 'd', codigo: '37', nombre: 'Carrera Profesional' },
  { id: 'e', codigo: '23', nombre: 'Salud - Guardias' },
  { id: 'f', codigo: '24', nombre: 'Residencias' },
  { id: 'g', codigo: '60', nombre: 'Carrera Gerencial' },
]

describe('etiquetaCarrera', () => {
  it("formato 'CÓDIGO — Nombre'", () => {
    expect(etiquetaCarrera(cat[2]!)).toBe('87 — Nueva Carrera Enfermería')
    expect(etiquetaCarrera(cat[1]!)).toBe('85 — CEETPS')
  })
  it('escalafón 22 (CPH) muestra su CR principal 37; el 37 y otros sin cambio', () => {
    expect(etiquetaCarrera({ codigo: '22', nombre: 'Nueva Carrera Prof. Hosp' })).toBe('37 — Nueva Carrera Profesional Hospitalaria')
    expect(etiquetaCarrera({ codigo: '37', nombre: 'X' })).toBe('37 — Nueva Carrera Profesional Hospitalaria')
    expect(etiquetaCarrera({ codigo: '70', nombre: 'Cuerpo Especialistas Profesionales' })).toBe('70 — Cuerpo Especialistas Profesionales')
  })
  it('el value enviado sigue siendo el id del escalafón', () => {
    const o = opcionesCarreraAlta([{ id: 'cph', codigo: '22', nombre: 'Nueva Carrera Prof. Hosp' }], 'pof')
    expect(o).toEqual([{ value: 'cph', label: '37 — Nueva Carrera Profesional Hospitalaria' }])
  })
})

describe('escalafón CPH en los dos estados de la base (actual 22 / nombre viejo, nueva 37 / nombre nuevo)', () => {
  const BASE_ACTUAL = [{ id: 'cph', codigo: '22', nombre: 'Nueva Carrera Prof. Hosp' }, ...cat.filter((c) => c.codigo !== '37')]
  const BASE_NUEVA = [{ id: 'cph', codigo: '37', nombre: 'Nueva Carrera Profesional Hospitalaria' }, ...cat.filter((c) => c.codigo !== '37')]
  it('la etiqueta es la misma en ambas bases y el override tolera los dos nombres', () => {
    expect(etiquetaCarrera(BASE_ACTUAL[0]!)).toBe('37 — Nueva Carrera Profesional Hospitalaria')
    expect(etiquetaCarrera(BASE_NUEVA[0]!)).toBe('37 — Nueva Carrera Profesional Hospitalaria')
  })
  it('el selector de alta muestra UNA sola opcion CPH (37), sin 22, en ambas bases, con el id del escalafon como value', () => {
    for (const base of [BASE_ACTUAL, BASE_NUEVA]) {
      const o = opcionesCarreraAlta(base, 'pof')
      expect(o.filter((x) => x.label.startsWith('37 '))).toEqual([{ value: 'cph', label: '37 — Nueva Carrera Profesional Hospitalaria' }])
      expect(o.some((x) => x.label.startsWith('22'))).toBe(false)
    }
  })
})
describe('esCarreraGestionada', () => {
  it('37, 22, 23, 83, 85, 87 sí; el resto no', () => {
    for (const c of ['37', '22', '23', '83', '85', '87']) expect(esCarreraGestionada(c)).toBe(true)
    for (const c of ['24', '25', '60', '65', '70', '17', '']) expect(esCarreraGestionada(c)).toBe(false)
    expect(esCarreraGestionada(undefined)).toBe(false)
  })
})

describe('opcionesCarreraAlta', () => {
  it('POF y POU: solo carreras gestionadas con etiqueta código — nombre', () => {
    for (const tipo of ['pof', 'pou'] as const) {
      const o = opcionesCarreraAlta(cat, tipo)
      expect(o.map((x) => x.value)).toEqual(['e', 'd', 'a', 'b', 'c'])
      expect(o[2]).toEqual({ value: 'a', label: '83 — Nueva Carrera Administrativa' })
    }
  })
  it('Estructura: NO filtra (todas las carreras)', () => {
    expect(opcionesCarreraAlta(cat, 'estructura')).toHaveLength(cat.length)
  })
})

import { filtrarPuestosAlta, puestosPermitidosPorCarrera } from './carrerasGestionadas'
import { especialidadesPermitidasAlta } from './especialidadesAlta'

describe('puestos por carrera', () => {
  const puestos = [
    { id: '1', nombre: '(sin especificar)' },
    { id: '2', nombre: 'Enfermeria' },
    { id: '3', nombre: 'Enfermeria atp' },
    { id: '4', nombre: 'Enfermero Profesional' },
    { id: '5', nombre: 'Licenciado En Enfermería' },
    { id: '6', nombre: 'Auxiliar de enfermería' },
  ]
  it('87 en POF/POU => exactamente los 2 puestos, con sus ids reales', () => {
    for (const t of ['pof', 'pou'] as const) {
      const r = filtrarPuestosAlta(puestos, '87', t)
      expect(r.map((p) => p.id)).toEqual(['4', '5'])
    }
  })
  it('tolera mayúsculas y acentos', () => {
    const r = filtrarPuestosAlta([{ id: 'x', nombre: 'LICENCIADO EN ENFERMERIA' }, { id: 'y', nombre: 'enfermero profesional' }], '87', 'pof')
    expect(r).toHaveLength(2)
  })
  it('otras carreras y Estructura sin cambios', () => {
    const reales = puestos.filter((p) => p.id !== '1')
    for (const c of ['37', '85', '83', '23', '24', undefined]) expect(filtrarPuestosAlta(puestos, c, 'pof')).toEqual(reales)
    expect(filtrarPuestosAlta(puestos, '87', 'estructura')).toEqual(reales)
  })
  it('nunca ofrece "(sin especificar)"', () => {
    for (const t of ['pof', 'pou', 'estructura'] as const) {
      expect(filtrarPuestosAlta(puestos, '37', t).some((p) => p.id === '1')).toBe(false)
    }
    expect(puestosPermitidosPorCarrera('37')).toBeNull()
  })
  it('ambos puestos de 87 ofrecen solo ATP/ATC', () => {
    const esp = [
      { id: 'a', nombre: 'enfermeria' },
      { id: 'b', nombre: 'Enfermeros ATP' },
      { id: 'c', nombre: 'Enfermeros ATC' },
    ] as never[]
    for (const p of filtrarPuestosAlta(puestos, '87', 'pof')) {
      const r = especialidadesPermitidasAlta(p.nombre, esp)
      expect(r.esEnfermeria).toBe(true)
      expect(r.opciones.map((o) => o.nombre)).toEqual(['Enfermeros ATP', 'Enfermeros ATC'])
    }
  })
})

describe('pideIncluirAmbosAlta', () => {
  it('solo la 87 en POF/POU; resto de carreras y estructura no', () => {
    expect(pideIncluirAmbosAlta('87', 'pof')).toBe(true)
    expect(pideIncluirAmbosAlta('87', 'pou')).toBe(true)
    expect(pideIncluirAmbosAlta('87', 'estructura')).toBe(false)
    for (const c of ['37', '85', '83', '23', '22', undefined]) expect(pideIncluirAmbosAlta(c, 'pof')).toBe(false)
  })
})

describe('filtrarPuestosAlta con puestos ambos (catálogo real de la 87)', () => {
  const p87 = [
    { id: '1', nombre: 'enfermeria' },
    { id: '2', nombre: 'enfermeria atp' },
    { id: '3', nombre: 'enfermero profesional' },
    { id: '4', nombre: 'licenciado en enfermeria' },
  ]
  it('87 => exactamente Enfermero Profesional y Licenciado en Enfermería (ids conservados)', () => {
    expect(filtrarPuestosAlta(p87, '87', 'pof').map((p) => p.id)).toEqual(['3', '4'])
    expect(filtrarPuestosAlta(p87, '87', 'pou').map((p) => p.id)).toEqual(['3', '4'])
  })
  it('otras carreras: lista intacta', () => {
    expect(filtrarPuestosAlta(p87, '85', 'pof')).toEqual(p87)
  })
})
