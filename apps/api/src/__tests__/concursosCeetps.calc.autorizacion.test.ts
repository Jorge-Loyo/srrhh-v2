import { describe, it, expect } from 'vitest'
import { calcEstadoCeetps, type ConcursoCeetpsCalcInput } from '../modules/concursos-ceetps/concursosCeetps.calc.js'

// Paso 2b — estado de autorización SGRASV en CEETPS (nuevo_cargo).
const base: ConcursoCeetpsCalcInput = {
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

describe('calcEstadoCeetps — autorizacionNuevoCargo', () => {
  it('undefined: comportamiento de siempre (puesto solicitado => autorizado)', () => {
    expect(calcEstadoCeetps({ ...base, puestoSolicitado: 'Enfermero' })).toEqual({ estado: 'autorizado', subEstado: null })
    expect(calcEstadoCeetps({ ...base, expedienteConcurso: 'EE-1' })).toEqual({ estado: 'sin_autorizar', subEstado: 'EXP_CARATULADO' })
  })

  it('nuevo_cargo con puesto pero sin autorizar NO llega a autorizado', () => {
    const r = calcEstadoCeetps({ ...base, puestoSolicitado: 'Enfermero', expedienteConcurso: 'EE-1', autorizacionNuevoCargo: 'sin_solicitar' })
    expect(r).toEqual({ estado: 'sin_autorizar', subEstado: 'EXP_CARATULADO' })
  })

  it('sin_solicitar sin expediente: sin_autorizar sin sub-estado', () => {
    expect(calcEstadoCeetps({ ...base, puestoSolicitado: 'Enfermero', autorizacionNuevoCargo: 'sin_solicitar' }))
      .toEqual({ estado: 'sin_autorizar', subEstado: null })
  })

  it('pendiente con expediente: A_AUTORIZACION', () => {
    expect(calcEstadoCeetps({ ...base, expedienteConcurso: 'EE-1', puestoSolicitado: 'Enfermero', autorizacionNuevoCargo: 'pendiente' }))
      .toEqual({ estado: 'sin_autorizar', subEstado: 'A_AUTORIZACION' })
  })

  it('autorizado: estado autorizado aunque no haya puesto solicitado', () => {
    expect(calcEstadoCeetps({ ...base, expedienteConcurso: 'EE-1', autorizacionNuevoCargo: 'autorizado' }))
      .toEqual({ estado: 'autorizado', subEstado: null })
  })

  it('las etapas posteriores siguen ganando sobre la autorización', () => {
    expect(calcEstadoCeetps({ ...base, dispoLlamado: 'D-1', autorizacionNuevoCargo: 'autorizado' }))
      .toEqual({ estado: 'en_proceso', subEstado: 'DISPO_LLAMADO' })
    expect(calcEstadoCeetps({ ...base, resolucionDesignacion: 'R-1', autorizacionNuevoCargo: 'autorizado' }))
      .toEqual({ estado: 'finalizado', subEstado: null })
  })
})
