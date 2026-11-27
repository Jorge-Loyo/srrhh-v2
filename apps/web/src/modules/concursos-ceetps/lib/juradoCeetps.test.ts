import { describe, it, expect } from 'vitest'
import type { JuradoCeetpsDto, MiembroJuradoCeetpsDto } from '@srrhh/types'
import { faltantesJurado, juradoCompleto, lugaresLibres } from './juradoCeetps'

function miembro(rol: 'titular' | 'suplente', orden: number): MiembroJuradoCeetpsDto {
  return {
    id: `${rol}-${orden}`,
    personaId: `p-${rol}-${orden}`,
    rol,
    orden,
    apellidoNombre: 'X',
    cuil: '20111111112',
    hospitalNombre: null,
    puesto: null,
  }
}

const jurado = (
  cantTitulares: number | null,
  cantSuplentes: number | null,
  miembros: MiembroJuradoCeetpsDto[] = [],
): JuradoCeetpsDto => ({ cantTitulares, cantSuplentes, miembros })

describe('juradoCompleto', () => {
  it('sin datos no está completo', () => {
    expect(juradoCompleto(null)).toBe(false)
    expect(juradoCompleto(undefined)).toBe(false)
  })

  it('sin lugares definidos no está completo', () => {
    expect(juradoCompleto(jurado(null, null))).toBe(false)
  })

  it('2/2 titulares y 1/1 suplente está completo', () => {
    const j = jurado(2, 1, [miembro('titular', 1), miembro('titular', 2), miembro('suplente', 1)])
    expect(juradoCompleto(j)).toBe(true)
  })

  it('con 0 suplentes alcanza con los titulares', () => {
    expect(juradoCompleto(jurado(1, 0, [miembro('titular', 1)]))).toBe(true)
  })

  it('con un lugar libre no está completo', () => {
    expect(juradoCompleto(jurado(2, 1, [miembro('titular', 1), miembro('suplente', 1)]))).toBe(
      false,
    )
  })
})

describe('faltantesJurado', () => {
  it('pide definir los lugares si no están', () => {
    expect(faltantesJurado(jurado(null, null))).toEqual([
      'Definir cuántos titulares y suplentes tiene el jurado',
    ])
  })

  it('informa los lugares libres por rol', () => {
    expect(faltantesJurado(jurado(2, 1, [miembro('titular', 1), miembro('titular', 2)]))).toEqual([
      'Falta asignar 1 suplente',
    ])
    expect(faltantesJurado(jurado(3, 2, [miembro('titular', 1)]))).toEqual([
      'Faltan asignar 2 titulares',
      'Faltan asignar 2 suplentes',
    ])
  })

  it('completo no tiene faltantes', () => {
    expect(faltantesJurado(jurado(1, 0, [miembro('titular', 1)]))).toEqual([])
  })
})

describe('lugaresLibres', () => {
  it('cuenta los lugares libres de cada rol (nunca negativo)', () => {
    const j = jurado(2, 1, [miembro('titular', 1)])
    expect(lugaresLibres(j, 'titular')).toBe(1)
    expect(lugaresLibres(j, 'suplente')).toBe(1)
    expect(lugaresLibres(jurado(null, null), 'titular')).toBe(0)
  })
})
