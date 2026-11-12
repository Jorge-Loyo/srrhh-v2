import { describe, expect, it } from 'vitest'
import type { SolicitudAlta, SolicitudAltaEstado } from '@srrhh/types'
import { agruparPorExpediente, estadoAgregado } from './agruparPorExpediente'

// Factory mínima de SolicitudAlta para los tests de la lógica PURA de agrupación.
function sol(over: Partial<SolicitudAlta> & { id: string }): SolicitudAlta {
  return {
    id: over.id,
    hospitalId: 'h1',
    escalafonId: 'e1',
    codigoRegistroId: null,
    literalPuesto: 'Médico',
    especialidad: null,
    agrupador: null,
    unificadorPuesto: null,
    regimen: null,
    expediente: null,
    desde: null,
    cantidad: 1,
    esTransferencia: false,
    estado: 'pendiente',
    solicitadoPorId: null,
    cargosCreadosIds: [],
    observaciones: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

describe('estadoAgregado', () => {
  const casos: [SolicitudAltaEstado[], string][] = [
    [['aprobada', 'aprobada'], 'aprobada'],
    [['rechazada', 'rechazada'], 'rechazada'],
    [['pendiente', 'pendiente'], 'pendiente'],
    [['aprobada', 'pendiente'], 'parcial'],
    [['aprobada', 'rechazada'], 'parcial'],
    [['pendiente', 'rechazada'], 'parcial'],
  ]
  it.each(casos)('estados %j → %s', (estados, esperado) => {
    expect(estadoAgregado(estados)).toBe(esperado)
  })

  it('un solo estado devuelve ese estado', () => {
    expect(estadoAgregado(['aprobada'])).toBe('aprobada')
  })

  it('sin estados devuelve pendiente (defensivo)', () => {
    expect(estadoAgregado([])).toBe('pendiente')
  })
})

describe('agruparPorExpediente', () => {
  it('una fila por expediente, sumando cantidades', () => {
    const grupos = agruparPorExpediente([
      sol({ id: '1', expediente: 'EX-1', cantidad: 2 }),
      sol({ id: '2', expediente: 'EX-1', cantidad: 3 }),
      sol({ id: '3', expediente: 'EX-2', cantidad: 1 }),
    ])
    expect(grupos).toHaveLength(2)
    const ex1 = grupos.find((g) => g.expediente === 'EX-1')!
    expect(ex1.totalCargos).toBe(5)
    expect(ex1.solicitudes).toHaveLength(2)
  })

  it('estado agregado: todo pendiente → pendiente', () => {
    const [g] = agruparPorExpediente([
      sol({ id: '1', expediente: 'EX-1', estado: 'pendiente' }),
      sol({ id: '2', expediente: 'EX-1', estado: 'pendiente' }),
    ])
    expect(g!.estado).toBe('pendiente')
  })

  it('estado agregado: mezcla → parcial', () => {
    const [g] = agruparPorExpediente([
      sol({ id: '1', expediente: 'EX-1', estado: 'aprobada' }),
      sol({ id: '2', expediente: 'EX-1', estado: 'pendiente' }),
    ])
    expect(g!.estado).toBe('parcial')
  })

  it('estado agregado: todo aprobado → aprobada', () => {
    const [g] = agruparPorExpediente([
      sol({ id: '1', expediente: 'EX-1', estado: 'aprobada' }),
      sol({ id: '2', expediente: 'EX-1', estado: 'aprobada' }),
    ])
    expect(g!.estado).toBe('aprobada')
  })

  it('agrupa las solicitudes sin expediente bajo la clave vacía', () => {
    const grupos = agruparPorExpediente([
      sol({ id: '1', expediente: null }),
      sol({ id: '2', expediente: null }),
    ])
    expect(grupos).toHaveLength(1)
    expect(grupos[0]!.expediente).toBe('')
    expect(grupos[0]!.totalCargos).toBe(2)
  })

  it('toma la fecha mínima y el primer solicitante disponible', () => {
    const [g] = agruparPorExpediente([
      sol({ id: '1', expediente: 'EX-1', createdAt: '2026-05-10T00:00:00.000Z' }),
      sol({
        id: '2',
        expediente: 'EX-1',
        createdAt: '2026-05-08T00:00:00.000Z',
        solicitadoPor: { id: 'u1', username: 'jloyo' },
      }),
    ])
    expect(g!.createdAt).toBe('2026-05-08T00:00:00.000Z')
    expect(g!.solicitante).toBe('jloyo')
  })

  it('ordena los grupos por fecha descendente', () => {
    const grupos = agruparPorExpediente([
      sol({ id: '1', expediente: 'EX-VIEJO', createdAt: '2026-01-01T00:00:00.000Z' }),
      sol({ id: '2', expediente: 'EX-NUEVO', createdAt: '2026-06-01T00:00:00.000Z' }),
    ])
    expect(grupos.map((g) => g.expediente)).toEqual(['EX-NUEVO', 'EX-VIEJO'])
  })
})
