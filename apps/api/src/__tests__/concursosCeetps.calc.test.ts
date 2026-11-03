import { describe, it, expect } from 'vitest'
import { calcEstadoCeetps } from '../modules/concursos-ceetps/concursosCeetps.calc.js'
import type { ConcursoCeetpsCalcInput } from '../modules/concursos-ceetps/concursosCeetps.calc.js'

const d = (iso: string) => new Date(iso)

const BASE: ConcursoCeetpsCalcInput = {
  expedienteConcurso: null,
  puestoSolicitado: null,
  dispoLlamado: null,
  fechaIfacs: null,
  fechaInsal: null,
  expedienteDesignacion: null,
  dispoDesignacion: null,
  resolucionDesignacion: null,
}

describe('calcEstadoCeetps — cascada de los 5 resultados', () => {
  it('sin datos → sin_autorizar', () => {
    expect(calcEstadoCeetps(BASE)).toBe('sin_autorizar')
  })

  it('solo puestoSolicitado → autorizado', () => {
    expect(calcEstadoCeetps({ ...BASE, puestoSolicitado: 'camillero' })).toBe('autorizado')
  })

  it('con dispoLlamado → en_proceso', () => {
    expect(
      calcEstadoCeetps({ ...BASE, puestoSolicitado: 'camillero', dispoLlamado: 'DI-2025-67' }),
    ).toBe('en_proceso')
  })

  it('con fechaIfacs → en_proceso', () => {
    expect(calcEstadoCeetps({ ...BASE, puestoSolicitado: 'camillero', fechaIfacs: d('2026-03-01') })).toBe(
      'en_proceso',
    )
  })

  it('con fechaInsal → en_proceso', () => {
    expect(calcEstadoCeetps({ ...BASE, puestoSolicitado: 'camillero', fechaInsal: d('2026-04-01') })).toBe(
      'en_proceso',
    )
  })

  it('con expedienteDesignacion → en_proceso', () => {
    expect(calcEstadoCeetps({ ...BASE, expedienteDesignacion: 'EX-2026-DESIG' })).toBe('en_proceso')
  })

  it('con dispoDesignacion → en_proceso', () => {
    expect(calcEstadoCeetps({ ...BASE, dispoDesignacion: 'DI-DESIG' })).toBe('en_proceso')
  })

  it('con resolucionDesignacion → finalizado (máxima prioridad)', () => {
    expect(
      calcEstadoCeetps({
        ...BASE,
        puestoSolicitado: 'camillero',
        dispoLlamado: 'DI-2025-67',
        expedienteDesignacion: 'EX-2026-DESIG',
        resolucionDesignacion: 'RES/647/SSGRH/2025',
      }),
    ).toBe('finalizado')
  })

  it('designación en proceso gana sobre autorizado', () => {
    expect(
      calcEstadoCeetps({ ...BASE, puestoSolicitado: 'camillero', dispoDesignacion: 'DI-DESIG' }),
    ).toBe('en_proceso')
  })
})
