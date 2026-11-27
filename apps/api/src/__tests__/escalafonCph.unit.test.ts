import { describe, expect, it } from 'vitest'
import {
  CODIGOS_ESCALAFON_GESTIONADOS,
  CR_POR_CODIGO_ESCALAFON_GESTIONADO,
  NOMBRE_ESCALAFON_CPH_ACTUAL,
  NOMBRE_ESCALAFON_CPH_NUEVO,
  esEscalafonCph,
  esNombreEscalafonCph,
  nombresEscalafonEquivalentes,
} from '@srrhh/types'
import { completarAliasEscalafonCph } from '../shared/escalafonCph.js'
import { prefijoDeCargo } from '../shared/codigoCargo.js'

// El escalafón CPH tiene DOS estados de base: actual (código 22, "Nueva Carrera Prof. Hosp") y nueva
// (código 37, "Nueva Carrera Profesional Hospitalaria"). Todo debe funcionar con los dos.
const BASE_ACTUAL = { codigo: '22', nombre: 'Nueva Carrera Prof. Hosp' }
const BASE_NUEVA = { codigo: '37', nombre: 'Nueva Carrera Profesional Hospitalaria' }

describe('escalafón CPH en @srrhh/types', () => {
  it('los dos estados de la base se reconocen como CPH; otros escalafones no', () => {
    expect(esEscalafonCph(BASE_ACTUAL)).toBe(true)
    expect(esEscalafonCph(BASE_NUEVA)).toBe(true)
    expect(esEscalafonCph({ codigo: '99', nombre: 'nueva carrera PROFESIONAL hospitalaria' })).toBe(true) // por nombre
    expect(esEscalafonCph({ codigo: '22', nombre: 'otro' })).toBe(true) // por código
    expect(esEscalafonCph({ codigo: '87', nombre: 'Nueva Carrera Enfermería' })).toBe(false)
    expect(esEscalafonCph({ codigo: null, nombre: null })).toBe(false)
  })
  it('esNombreEscalafonCph ignora mayúsculas, tildes y espacios repetidos', () => {
    expect(esNombreEscalafonCph(NOMBRE_ESCALAFON_CPH_ACTUAL)).toBe(true)
    expect(esNombreEscalafonCph('  NUEVA  carrera profesional hospitalaria ')).toBe(true)
    expect(esNombreEscalafonCph('CEETPS')).toBe(false)
  })
  it('nombresEscalafonEquivalentes devuelve los dos nombres para CPH y solo el recibido para el resto', () => {
    expect(nombresEscalafonEquivalentes(NOMBRE_ESCALAFON_CPH_ACTUAL)).toEqual([NOMBRE_ESCALAFON_CPH_ACTUAL, NOMBRE_ESCALAFON_CPH_NUEVO])
    expect(nombresEscalafonEquivalentes(NOMBRE_ESCALAFON_CPH_NUEVO)).toEqual([NOMBRE_ESCALAFON_CPH_ACTUAL, NOMBRE_ESCALAFON_CPH_NUEVO])
    expect(nombresEscalafonEquivalentes('CEETPS')).toEqual(['CEETPS'])
  })
  it('el mapa de carreras gestionadas acepta el escalafón CPH con código 22 y con 37 (ambos dan CR 37)', () => {
    expect(CR_POR_CODIGO_ESCALAFON_GESTIONADO['22']).toBe('37')
    expect(CR_POR_CODIGO_ESCALAFON_GESTIONADO['37']).toBe('37')
    expect(CODIGOS_ESCALAFON_GESTIONADOS).toEqual(expect.arrayContaining(['22', '37']))
  })
})

describe('completarAliasEscalafonCph (lookup por nombre del padrón)', () => {
  it('con la base actual, el nombre nuevo del padrón también resuelve el escalafón', () => {
    const m = new Map<string, string>([[BASE_ACTUAL.nombre, 'esc-cph'], ['CEETPS', 'esc-ceetps']])
    completarAliasEscalafonCph(m)
    expect(m.get(BASE_NUEVA.nombre)).toBe('esc-cph')
    expect(m.get('CEETPS')).toBe('esc-ceetps')
  })
  it('con la base nueva, el nombre viejo del padrón también resuelve el escalafón', () => {
    const m = new Map<string, string>([[BASE_NUEVA.nombre, 'esc-cph']])
    completarAliasEscalafonCph(m)
    expect(m.get(BASE_ACTUAL.nombre)).toBe('esc-cph')
  })
  it('con claves normalizadas (como escalafonCache del padrón) y sin escalafón CPH no agrega nada', () => {
    const norm = (n: string) => n.toLowerCase().trim()
    const m = new Map<string, string>([[norm(BASE_NUEVA.nombre), 'esc-cph']])
    completarAliasEscalafonCph(m, norm)
    expect(m.get(norm(BASE_ACTUAL.nombre))).toBe('esc-cph')
    const otro = new Map<string, string>([['ceetps', 'x']])
    completarAliasEscalafonCph(otro, norm)
    expect(otro.size).toBe(1)
  })
})

describe('código de cargo según el nombre del escalafón (los dos nombres)', () => {
  it.each(['legacy', 'msgc'])('modo %s: ambos nombres dan el mismo prefijo CPH', (modo) => {
    process.env.NOMENCLATURA_CODIGO_CARGO = modo
    try {
      const esperado = modo === 'msgc' ? 'CPH-P' : 'CPH-POF'
      for (const escalafon of [BASE_ACTUAL.nombre, BASE_NUEVA.nombre]) {
        expect(prefijoDeCargo({ escalafon, literalPuesto: 'POF' })).toBe(esperado)
      }
    } finally {
      delete process.env.NOMENCLATURA_CODIGO_CARGO
    }
  })
})
