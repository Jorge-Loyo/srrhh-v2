import { describe, it, expect } from 'vitest'
import { nivelPorJcat, rangoConduccion } from '../modules/organigrama/organigrama.rango.js'

// Rango = menor gana el nodo. Casos reales de la base (2026-11).
const r = (jcat: string | null, codigo: string | null, cr = '37', esc: string | null = null) =>
  rangoConduccion(cr, jcat, esc, codigo)

describe('nivelPorJcat', () => {
  it('mapea P/G 60–65 y Z 22/24/26/32 a una misma escala', () => {
    expect(nivelPorJcat('P60')).toBe(10)
    expect(nivelPorJcat('p61')).toBe(11)
    expect(nivelPorJcat('G62')).toBe(12)
    expect(nivelPorJcat('Z22')).toBe(12)
    expect(nivelPorJcat('P63')).toBe(14)
    expect(nivelPorJcat('Z24')).toBe(14)
    expect(nivelPorJcat('P64')).toBe(15)
    expect(nivelPorJcat('P65')).toBe(16)
    expect(nivelPorJcat('Z26')).toBe(16)
  })
  it('devuelve null si no es JCAT', () => {
    expect(nivelPorJcat(null)).toBeNull()
    expect(nivelPorJcat('')).toBeNull()
    expect(nivelPorJcat('0')).toBeNull()
    expect(nivelPorJcat('M26')).toBeNull()
  })
})

describe('rangoConduccion', () => {
  it('Santa Lucía: Director P60 gana a un jefe CPH-J sin JCAT', () => {
    expect(r('P60', 'CPH-D-000045')).toBeLessThan(r(null, 'CPH-J-POF-002174'))
  })
  it('Director P60 gana a un Jefe de Sección Z26 (distinta familia)', () => {
    expect(r('P60', 'CPH-D-000001')).toBeLessThan(r('Z26', 'EG-J-000001', '83'))
  })
  it('respeta el orden dirección < subdirección < depto < división < unidad < sección', () => {
    const orden = ['P60', 'P61', 'P62', 'P63', 'P64', 'P65'].map((j) => r(j, null))
    expect([...orden].sort((a, b) => a - b)).toEqual(orden)
  })
  it('Director sin JCAT (CPH-D) gana a una jefatura con JCAT de sección', () => {
    expect(r(null, 'CPH-D-000053')).toBeLessThan(r('P65', 'CPH-J-POF-000001'))
  })
  it('a igual nivel el JCAT (certero) gana al código sin JCAT', () => {
    expect(r('P65', 'CPH-J-POF-000001')).toBeLessThan(r(null, 'CPH-J-POF-000002'))
  })
  it('autoridades superiores y gerencias siguen por encima de todo', () => {
    expect(rangoConduccion('25', null, null, 'AS-DG-000042')).toBeLessThan(r('P60', 'CPH-D-000005'))
    expect(rangoConduccion('60', null, null, 'RG-CG-000179')).toBeLessThan(r('P60', 'CPH-D-000005'))
  })
  it('gerencial sin JCAT queda debajo de una dirección con JCAT', () => {
    expect(r('P60', 'CPH-D-000001')).toBeLessThan(rangoConduccion(undefined, null, 'Carrera Gerencial', null))
  })
})
