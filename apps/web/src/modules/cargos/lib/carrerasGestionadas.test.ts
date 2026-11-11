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
      expect(o.map((x) => x.value)).toEqual(['a', 'b', 'c', 'd', 'e'])
      expect(o[0]).toEqual({ value: 'a', label: '83 — Nueva Carrera Administrativa' })
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
    for (const c of ['37', '85', '83', '23', '24', undefined]) expect(filtrarPuestosAlta(puestos, c, 'pof')).toBe(puestos)
    expect(filtrarPuestosAlta(puestos, '87', 'estructura')).toBe(puestos)
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
