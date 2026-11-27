import { describe, expect, it } from 'vitest'
import type { Etiqueta, SolicitudAlta } from '@srrhh/types'
import { etiquetasDeSolicitudes, filasPorCargo, solicitudMatcheaEtiqueta, tipoAltaLabel } from './historicoCargos'

const et = (id: string, nombre: string): Etiqueta => ({ id, nombre, color: null, activo: true, createdAt: '2026-01-01' })

function sol(over: Partial<SolicitudAlta> & { id: string }): SolicitudAlta {
  return {
    hospitalId: 'h1', escalafonId: 'e1', codigoRegistroId: null, literalPuesto: 'Enfermero Profesional',
    especialidad: null, agrupador: null, unificadorPuesto: 'POF', regimen: null, expediente: 'EX-1',
    desde: '2026-03-01T00:00:00.000Z', cantidad: 1, esTransferencia: false, estado: 'pendiente',
    solicitadoPorId: null, cargosCreadosIds: [], observaciones: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

describe('etiquetasDeSolicitudes', () => {
  it('devuelve las etiquetas distintas ordenadas por nombre', () => {
    const a = et('1', 'Zeta'), b = et('2', 'Alfa')
    const res = etiquetasDeSolicitudes([
      sol({ id: 's1', etiquetas: [{ etiqueta: a }, { etiqueta: b }] }),
      sol({ id: 's2', etiquetas: [{ etiqueta: a }] }),
      sol({ id: 's3' }),
    ])
    expect(res.map((e) => e.nombre)).toEqual(['Alfa', 'Zeta'])
  })
  it('sin etiquetas → []', () => {
    expect(etiquetasDeSolicitudes([sol({ id: 's1' })])).toEqual([])
  })
})

describe('solicitudMatcheaEtiqueta', () => {
  it('matchea por nombre sin distinguir mayúsculas', () => {
    const s = sol({ id: 's1', etiquetas: [{ etiqueta: et('1', 'Lote Marzo') }] })
    expect(solicitudMatcheaEtiqueta(s, 'marzo')).toBe(true)
    expect(solicitudMatcheaEtiqueta(s, 'abril')).toBe(false)
    expect(solicitudMatcheaEtiqueta(s, '  ')).toBe(false)
  })
})

describe('tipoAltaLabel', () => {
  it.each([['POF', 'Ejecución POF'], ['POU Guardia', 'POU'], ['Estructura', 'Estructura'], ['ambos', '—'], [null, '—']])(
    '%s → %s', (u, esperado) => expect(tipoAltaLabel(u as string | null)).toBe(esperado),
  )
})

describe('filasPorCargo', () => {
  it('pendiente con cantidad 3 → 3 filas "sin crear"', () => {
    const filas = filasPorCargo([sol({ id: 's1', cantidad: 3 })])
    expect(filas).toHaveLength(3)
    expect(new Set(filas.map((f) => f.key)).size).toBe(3)
    expect(filas.every((f) => f.cargoId === null && f.codigo === null)).toBe(true)
  })
  it('aprobada → una fila por cargo creado con su código y concurso', () => {
    const filas = filasPorCargo([
      sol({
        id: 's1', estado: 'aprobada', cantidad: 2, cargosCreadosIds: ['c1', 'c2'],
        etiquetas: [{ etiqueta: et('1', 'A') }],
        cargosCreados: [
          { id: 'c1', codigo: 'ENF-011256', idSial: null, fechaDesde: '2026-03-01', hospital: { id: 'h1', sigla: 'HZ' },
            carreraCodigo: '87', carrera: 'Enfermería', puesto: 'Enfermero Profesional', especialidad: null,
            codigoRegistro: '87', concurso: { tipo: 'cph', detalleId: 'cc1' } },
          { id: 'c2', codigo: 'ENF-011257', idSial: null, fechaDesde: null, hospital: null,
            carreraCodigo: null, carrera: null, puesto: null, especialidad: null, codigoRegistro: null, concurso: null },
        ],
      }),
    ])
    expect(filas.map((f) => f.codigo)).toEqual(['ENF-011256', 'ENF-011257'])
    expect(filas[0]!.carrera).toBe('87 — Enfermería')
    expect(filas[0]!.rutaConcurso).toBe('/concursos/cph/cc1/wizard')
    expect(filas[0]!.etiquetas).toHaveLength(1)
    expect(filas[1]!.tipoConcurso).toBeNull()
    expect(filas[1]!.puesto).toBe('Enfermero Profesional')
    expect(filas[1]!.rutaConcurso).toBeNull()
  })
  it('aprobada sin cargosCreados (backend viejo) cae a filas por cantidad', () => {
    expect(filasPorCargo([sol({ id: 's1', estado: 'aprobada', cantidad: 2 })])).toHaveLength(2)
  })
})
