import { describe, it, expect } from 'vitest'
import { calcConcursoCph, type ConcursoCphCalcInput } from '../modules/concursos-cph/concursosCph.calc.js'
import { autorizacionParaCalc } from '../modules/concursos-cph/autorizacionNuevoCargo.js'

// Paso 2b — estado de autorización de los concursos nuevo_cargo en el calc.
const base: ConcursoCphCalcInput = {
  suspendido: false, eeBaja: null, fechaBaja: null, eeConcurso: null, fechaEeConcurso: null,
  fechaAutorizacion: null, sorteoJurado: null, disposicion: null, fechaInscDesde: null,
  fechaInscHasta: null, inscripcionCerrada: null, ordenMeritoConfirmado: null, fechaExamen: null,
  fechaOrdenMerito: null, fechaIfacs: null, fechaInsal: null, eeDesignacion: null,
  cargaDocumentacion: null, fechaAptoMedico: null, fechaIte: null, proyectoResolucion: null,
  resoALaFirma: null, resolucionDesignacion: null, fechaResolucion: null, cargoSial: null,
  dispoDesierta: null, fechaDispoDesierta: null, validado: false, validadoIdSialRol: null,
}
const conEe = { ...base, eeConcurso: 'EE-1' }

describe('calcConcursoCph — autorizacionNuevoCargo', () => {
  it('undefined: comportamiento idéntico al de siempre (sin eeBaja cae en "no iniciado")', () => {
    expect(calcConcursoCph(conEe).subEstado).toBe('no iniciado')
    expect(calcConcursoCph({ ...conEe, fechaAutorizacion: new Date('2026-11-01') }).subEstado).toBe('a-autzn')
  })

  it('sin_solicitar: A Caratulado con expediente (sin exigir eeBaja); vacante sin expediente', () => {
    expect(calcConcursoCph({ ...conEe, autorizacionNuevoCargo: 'sin_solicitar' }).subEstado).toBe('a-caratulado')
    expect(calcConcursoCph({ ...base, autorizacionNuevoCargo: 'sin_solicitar' }).subEstado).toBe('vacante')
  })

  it('pendiente: A Autorización', () => {
    const r = calcConcursoCph({ ...conEe, autorizacionNuevoCargo: 'pendiente' })
    expect(r.subEstado).toBe('a-autzn')
    expect(r.estado).toBe('activo')
  })

  it('autorizado: B Sorteo de jurado aun sin fechaAutorizacion ni sorteo', () => {
    expect(calcConcursoCph({ ...conEe, autorizacionNuevoCargo: 'autorizado' }).subEstado).toBe('b-sorteo jur')
    expect(
      calcConcursoCph({ ...conEe, fechaAutorizacion: new Date('2026-11-01'), autorizacionNuevoCargo: 'autorizado' }).subEstado,
    ).toBe('b-sorteo jur')
  })

  it('los campos de etapas posteriores siguen ganando', () => {
    expect(calcConcursoCph({ ...conEe, disposicion: 'D-1', autorizacionNuevoCargo: 'autorizado' }).subEstado).toBe('c-dispo de llamado')
    expect(calcConcursoCph({ ...conEe, sorteoJurado: new Date('2026-11-02'), autorizacionNuevoCargo: 'pendiente' }).subEstado).toBe('b-sorteo jur')
  })
})

describe('autorizacionParaCalc', () => {
  const opts = { pendiente: false, autoAprobar: false }
  it('no nuevo_cargo → undefined', () => {
    expect(autorizacionParaCalc({ motivoConcurso: null, autorizadoAt: null }, opts)).toBeUndefined()
    expect(autorizacionParaCalc({ motivoConcurso: 'vacante', autorizadoAt: null }, { pendiente: true, autoAprobar: true })).toBeUndefined()
    expect(autorizacionParaCalc(undefined, opts)).toBeUndefined()
  })
  it('nuevo_cargo: autorizado / pendiente / sin_solicitar', () => {
    const nuevo = { motivoConcurso: 'nuevo_cargo', autorizadoAt: null }
    expect(autorizacionParaCalc({ ...nuevo, autorizadoAt: new Date() }, opts)).toBe('autorizado')
    expect(autorizacionParaCalc(nuevo, { pendiente: false, autoAprobar: true })).toBe('autorizado')
    expect(autorizacionParaCalc(nuevo, { pendiente: true, autoAprobar: false })).toBe('pendiente')
    expect(autorizacionParaCalc(nuevo, opts)).toBe('sin_solicitar')
  })
})
