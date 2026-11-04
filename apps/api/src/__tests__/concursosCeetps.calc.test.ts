import { describe, it, expect } from 'vitest'
import { calcEstadoCeetps } from '../modules/concursos-ceetps/concursosCeetps.calc.js'
import type { ConcursoCeetpsCalcInput } from '../modules/concursos-ceetps/concursosCeetps.calc.js'

const d = (iso: string) => new Date(iso)

const BASE: ConcursoCeetpsCalcInput = {
  expedienteConcurso: null,
  fechaCaratulacion: null,
  puestoSolicitado: null,
  dispoLlamado: null,
  fechaIfacs: null,
  fechaInsal: null,
  expedienteDesignacion: null,
  dispoDesignacion: null,
  resolucionDesignacion: null,
}

describe('calcEstadoCeetps — cascada de estados + subEstado', () => {
  it('sin datos → sin_autorizar / null', () => {
    expect(calcEstadoCeetps(BASE)).toEqual({ estado: 'sin_autorizar', subEstado: null })
  })

  it('solo expedienteConcurso → sin_autorizar / EXP_CARATULADO', () => {
    expect(calcEstadoCeetps({ ...BASE, expedienteConcurso: 'EX-2026-001' })).toEqual({
      estado: 'sin_autorizar',
      subEstado: 'EXP_CARATULADO',
    })
  })

  it('solo fechaCaratulacion → sin_autorizar / EXP_CARATULADO', () => {
    expect(calcEstadoCeetps({ ...BASE, fechaCaratulacion: d('2026-01-15') })).toEqual({
      estado: 'sin_autorizar',
      subEstado: 'EXP_CARATULADO',
    })
  })

  it('solo puestoSolicitado → autorizado / null', () => {
    expect(calcEstadoCeetps({ ...BASE, puestoSolicitado: 'camillero' })).toEqual({
      estado: 'autorizado',
      subEstado: null,
    })
  })

  it('con dispoLlamado → en_proceso / DISPO_LLAMADO', () => {
    expect(
      calcEstadoCeetps({ ...BASE, puestoSolicitado: 'camillero', dispoLlamado: 'DI-2025-67' }),
    ).toEqual({ estado: 'en_proceso', subEstado: 'DISPO_LLAMADO' })
  })

  it('con fechaIfacs → en_proceso / IFACS', () => {
    expect(calcEstadoCeetps({ ...BASE, puestoSolicitado: 'camillero', fechaIfacs: d('2026-03-01') })).toEqual({
      estado: 'en_proceso',
      subEstado: 'IFACS',
    })
  })

  it('con fechaInsal → en_proceso / INSAL (prioridad sobre IFACS)', () => {
    expect(
      calcEstadoCeetps({ ...BASE, puestoSolicitado: 'camillero', fechaIfacs: d('2026-03-01'), fechaInsal: d('2026-04-01') }),
    ).toEqual({ estado: 'en_proceso', subEstado: 'INSAL' })
  })

  it('con expedienteDesignacion → en_proceso / TAD', () => {
    expect(calcEstadoCeetps({ ...BASE, expedienteDesignacion: 'EX-2026-DESIG' })).toEqual({
      estado: 'en_proceso',
      subEstado: 'TAD',
    })
  })

  it('con dispoDesignacion → en_proceso / DISPO_DESIGNACION (prioridad sobre TAD)', () => {
    expect(
      calcEstadoCeetps({ ...BASE, expedienteDesignacion: 'EX-2026-DESIG', dispoDesignacion: 'DI-DESIG' }),
    ).toEqual({ estado: 'en_proceso', subEstado: 'DISPO_DESIGNACION' })
  })

  it('con resolucionDesignacion → finalizado / null (máxima prioridad)', () => {
    expect(
      calcEstadoCeetps({
        ...BASE,
        puestoSolicitado: 'camillero',
        dispoLlamado: 'DI-2025-67',
        expedienteDesignacion: 'EX-2026-DESIG',
        resolucionDesignacion: 'RES/647/SSGRH/2025',
      }),
    ).toEqual({ estado: 'finalizado', subEstado: null })
  })
})
