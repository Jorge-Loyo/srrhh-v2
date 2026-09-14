import { describe, it, expect } from 'vitest'
import { calcConcursoCph } from '../modules/concursos-cph/concursosCph.calc.js'
import type { ConcursoCphCalcInput } from '../modules/concursos-cph/concursosCph.calc.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const d = (iso: string) => new Date(iso)

/** Base vacante: todos los campos en null/false */
const BASE: ConcursoCphCalcInput = {
  suspendido: false,
  eeBaja: null, fechaBaja: null,
  eeConcurso: null, fechaEeConcurso: null,
  fechaAutorizacion: null, sorteoJurado: null, disposicion: null,
  fechaInscHasta: null, fechaExamen: null, fechaOrdenMerito: null,
  fechaIfacs: null, fechaInsal: null,
  eeDesignacion: null, cargaDocumentacion: null,
  fechaAptoMedico: null, fechaIte: null,
  proyectoResolucion: null, resoALaFirma: null,
  resolucionDesignacion: null, fechaResolucion: null,
  cargoSial: null,
  dispoDesierta: null, fechaDispoDesierta: null,
}

/** Concurso activo mínimo (tiene eeBaja + eeConcurso + fechas) */
const ACTIVO: ConcursoCphCalcInput = {
  ...BASE,
  eeBaja: 'EX-2026-00001',
  fechaBaja: d('2026-01-01'),
  eeConcurso: 'EX-2026-00002',
  fechaEeConcurso: d('2026-01-15'),
}

// ─── estado ───────────────────────────────────────────────────────────────────

describe('calcConcursoCph — estado', () => {
  it('sin datos → no_iniciado', () => {
    expect(calcConcursoCph(BASE).estado).toBe('no_iniciado')
  })

  it('con eeBaja + eeConcurso + fechas → activo', () => {
    expect(calcConcursoCph(ACTIVO).estado).toBe('activo')
  })

  it('con resolucionDesignacion → finalizado', () => {
    const r = calcConcursoCph({ ...ACTIVO, resolucionDesignacion: 'RESOL/123/MSGC/2026', fechaResolucion: d('2026-09-01') })
    expect(r.estado).toBe('finalizado')
  })

  it('suspendido=true siempre → suspendido sin importar otros campos', () => {
    expect(calcConcursoCph({ ...ACTIVO, suspendido: true }).estado).toBe('suspendido')
    expect(calcConcursoCph({ ...BASE, suspendido: true }).estado).toBe('suspendido')
    expect(calcConcursoCph({ ...ACTIVO, resolucionDesignacion: 'RESOL/1', fechaResolucion: d('2026-01-01'), suspendido: true }).estado).toBe('suspendido')
  })
})

// ─── subEstado ────────────────────────────────────────────────────────────────

describe('calcConcursoCph — subEstado', () => {
  it('sin datos → VACANTE', () => {
    expect(calcConcursoCph(BASE).subEstado).toBe('VACANTE')
  })

  it('solo eeBaja sin eeConcurso → NO INICIADO', () => {
    expect(calcConcursoCph({ ...BASE, eeBaja: 'EX-2026-00001', fechaBaja: d('2026-01-01') }).subEstado).toBe('NO INICIADO')
  })

  it('eeBaja + eeConcurso → A-CARATULADO', () => {
    expect(calcConcursoCph(ACTIVO).subEstado).toBe('A-CARATULADO')
  })

  it('+ fechaAutorizacion → A-AUTZN', () => {
    expect(calcConcursoCph({ ...ACTIVO, fechaAutorizacion: d('2026-02-01') }).subEstado).toBe('A-AUTZN')
  })

  it('+ sorteoJurado → B-SORTEO JUR', () => {
    expect(calcConcursoCph({ ...ACTIVO, fechaAutorizacion: d('2026-02-01'), sorteoJurado: d('2026-02-15') }).subEstado).toBe('B-SORTEO JUR')
  })

  it('+ disposicion → C-DISPO DE LLAMADO', () => {
    expect(calcConcursoCph({ ...ACTIVO, fechaAutorizacion: d('2026-02-01'), sorteoJurado: d('2026-02-15'), disposicion: 'DI-123' }).subEstado).toBe('C-DISPO DE LLAMADO')
  })

  it('+ fechaExamen → D-EXAMEN PUBLICADO', () => {
    const r = calcConcursoCph({ ...ACTIVO, fechaAutorizacion: d('2026-02-01'), sorteoJurado: d('2026-02-15'), disposicion: 'DI-123', fechaExamen: d('2026-04-01') })
    expect(r.subEstado).toBe('D-EXAMEN PUBLICADO')
  })

  it('+ fechaOrdenMerito → E-ORDEN DE MERITO', () => {
    const r = calcConcursoCph({ ...ACTIVO, fechaAutorizacion: d('2026-02-01'), disposicion: 'DI-123', fechaExamen: d('2026-04-01'), fechaOrdenMerito: d('2026-05-01') })
    expect(r.subEstado).toBe('E-ORDEN DE MERITO')
  })

  it('+ fechaIfacs → F-IFACS', () => {
    const r = calcConcursoCph({ ...ACTIVO, fechaOrdenMerito: d('2026-05-01'), fechaIfacs: d('2026-06-01') })
    expect(r.subEstado).toBe('F-IFACS')
  })

  it('+ fechaInsal → G-INSAL', () => {
    const r = calcConcursoCph({ ...ACTIVO, fechaIfacs: d('2026-06-01'), fechaInsal: d('2026-07-01') })
    expect(r.subEstado).toBe('G-INSAL')
  })

  it('+ eeDesignacion → H-TAD', () => {
    const r = calcConcursoCph({ ...ACTIVO, fechaInsal: d('2026-07-01'), eeDesignacion: 'EX-2026-TAD' })
    expect(r.subEstado).toBe('H-TAD')
  })

  it('+ cargaDocumentacion → I-CARGA DOCU', () => {
    const r = calcConcursoCph({ ...ACTIVO, eeDesignacion: 'EX-2026-TAD', cargaDocumentacion: true })
    expect(r.subEstado).toBe('I-CARGA DOCU')
  })

  it('+ fechaAptoMedico → J-APTO MED', () => {
    const r = calcConcursoCph({ ...ACTIVO, cargaDocumentacion: true, fechaAptoMedico: d('2026-08-01') })
    expect(r.subEstado).toBe('J-APTO MED')
  })

  it('+ fechaIte → K-ITE', () => {
    const r = calcConcursoCph({ ...ACTIVO, fechaAptoMedico: d('2026-08-01'), fechaIte: d('2026-08-15') })
    expect(r.subEstado).toBe('K-ITE')
  })

  it('+ proyectoResolucion → L-PYCTO DE RESO', () => {
    const r = calcConcursoCph({ ...ACTIVO, fechaIte: d('2026-08-15'), proyectoResolucion: true })
    expect(r.subEstado).toBe('L-PYCTO DE RESO')
  })

  it('+ resoALaFirma → M-RESO A LA FIRMA', () => {
    const r = calcConcursoCph({ ...ACTIVO, proyectoResolucion: true, resoALaFirma: true })
    expect(r.subEstado).toBe('M-RESO A LA FIRMA')
  })

  it('+ resolucionDesignacion + fechaResolucion → N-DESIGNADO', () => {
    const r = calcConcursoCph({ ...ACTIVO, resoALaFirma: true, resolucionDesignacion: 'RESOL/1', fechaResolucion: d('2026-09-01') })
    expect(r.subEstado).toBe('N-DESIGNADO')
  })

  it('+ cargoSial → O-ALTA SIAL (máxima prioridad sobre designado)', () => {
    const r = calcConcursoCph({ ...ACTIVO, resolucionDesignacion: 'RESOL/1', fechaResolucion: d('2026-09-01'), cargoSial: '001234567-1' })
    expect(r.subEstado).toBe('O-ALTA SIAL')
  })

  it('dispoDesierta + fechaDispoDesierta → Q-DESIERTO (máxima prioridad)', () => {
    const r = calcConcursoCph({ ...ACTIVO, cargoSial: '001234567-1', dispoDesierta: 'DI-DESIERTA', fechaDispoDesierta: d('2026-09-01') })
    expect(r.subEstado).toBe('Q-DESIERTO')
  })
})

// ─── subEstado3 ───────────────────────────────────────────────────────────────

describe('calcConcursoCph — subEstado3', () => {
  const PASADO = d('2020-01-01')
  const FUTURO = d('2099-01-01')

  it('sin datos → A-VALID. VCTE', () => {
    expect(calcConcursoCph(BASE).subEstado3).toBe('A-VALID. VCTE')
  })

  it('fechaAutorizacion + sorteoJurado → B-AUTORIZADO', () => {
    const r = calcConcursoCph({ ...BASE, fechaAutorizacion: d('2026-01-01'), sorteoJurado: d('2026-02-01') })
    expect(r.subEstado3).toBe('B-AUTORIZADO')
  })

  it('disposicion (sin fechas de examen) → C-INSCRIPCION', () => {
    const r = calcConcursoCph({ ...BASE, disposicion: 'DI-123' })
    expect(r.subEstado3).toBe('C-INSCRIPCION')
  })

  it('fechaInscHasta en el pasado → D-ETAPA EVAL', () => {
    const r = calcConcursoCph({ ...BASE, disposicion: 'DI-123', fechaInscHasta: PASADO })
    expect(r.subEstado3).toBe('D-ETAPA EVAL')
  })

  it('fechaInscHasta en el futuro → C-INSCRIPCION (inscripción abierta)', () => {
    const r = calcConcursoCph({ ...BASE, disposicion: 'DI-123', fechaInscHasta: FUTURO })
    expect(r.subEstado3).toBe('C-INSCRIPCION')
  })

  it('fechaExamen en el pasado → E-ADJUDI', () => {
    const r = calcConcursoCph({ ...BASE, disposicion: 'DI-123', fechaInscHasta: PASADO, fechaExamen: PASADO })
    expect(r.subEstado3).toBe('E-ADJUDI')
  })

  it('fechaExamen en el futuro → D-ETAPA EVAL (examen no ocurrió aún)', () => {
    const r = calcConcursoCph({ ...BASE, disposicion: 'DI-123', fechaInscHasta: PASADO, fechaExamen: FUTURO })
    expect(r.subEstado3).toBe('D-ETAPA EVAL')
  })

  it('eeDesignacion → F-PROX. A DESIG', () => {
    const r = calcConcursoCph({ ...BASE, eeDesignacion: 'EX-2026-TAD' })
    expect(r.subEstado3).toBe('F-PROX. A DESIG')
  })

  it('resolucionDesignacion → G-RESOLUCION', () => {
    const r = calcConcursoCph({ ...BASE, resolucionDesignacion: 'RESOL/1', fechaResolucion: d('2026-09-01') })
    expect(r.subEstado3).toBe('G-RESOLUCION')
  })

  it('fechaDispoDesierta → H-DESIERTO (máxima prioridad)', () => {
    const r = calcConcursoCph({ ...BASE, resolucionDesignacion: 'RESOL/1', fechaResolucion: d('2026-09-01'), fechaDispoDesierta: d('2026-09-01') })
    expect(r.subEstado3).toBe('H-DESIERTO')
  })
})

// ─── Invariantes ──────────────────────────────────────────────────────────────

describe('calcConcursoCph — invariantes', () => {
  it('suspendido nunca produce estado activo o finalizado', () => {
    const casos: ConcursoCphCalcInput[] = [
      { ...BASE, suspendido: true },
      { ...ACTIVO, suspendido: true },
      { ...ACTIVO, suspendido: true, resolucionDesignacion: 'RESOL/1', fechaResolucion: d('2026-01-01') },
    ]
    for (const c of casos) {
      const { estado } = calcConcursoCph(c)
      expect(estado).toBe('suspendido')
    }
  })

  it('Q-DESIERTO siempre gana sobre cualquier otro subEstado', () => {
    const r = calcConcursoCph({
      ...ACTIVO,
      fechaAutorizacion: d('2026-01-01'),
      disposicion: 'DI-1',
      fechaOrdenMerito: d('2026-05-01'),
      fechaIfacs: d('2026-06-01'),
      resolucionDesignacion: 'RESOL/1',
      fechaResolucion: d('2026-09-01'),
      cargoSial: '001234567-1',
      dispoDesierta: 'DI-DESIERTA',
      fechaDispoDesierta: d('2026-09-01'),
    })
    expect(r.subEstado).toBe('Q-DESIERTO')
  })

  it('O-ALTA SIAL gana sobre N-DESIGNADO', () => {
    const r = calcConcursoCph({
      ...ACTIVO,
      resolucionDesignacion: 'RESOL/1',
      fechaResolucion: d('2026-09-01'),
      cargoSial: '001234567-1',
    })
    expect(r.subEstado).toBe('O-ALTA SIAL')
  })

  it('siempre devuelve los 3 campos', () => {
    const r = calcConcursoCph(BASE)
    expect(r).toHaveProperty('estado')
    expect(r).toHaveProperty('subEstado')
    expect(r).toHaveProperty('subEstado3')
    expect(typeof r.estado).toBe('string')
    expect(typeof r.subEstado).toBe('string')
    expect(typeof r.subEstado3).toBe('string')
  })
})
