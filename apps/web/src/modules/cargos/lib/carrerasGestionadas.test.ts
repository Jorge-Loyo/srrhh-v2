import { describe, it, expect } from 'vitest'
import { esCarreraGestionada, etiquetaCarrera, opcionesCarreraAlta } from './carrerasGestionadas'

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
