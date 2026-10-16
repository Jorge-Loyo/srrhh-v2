import { describe, it, expect } from 'vitest'
import {
  calcConcursoCph,
  etapaDeSubEstado,
  SUB_ESTADOS_POR_ETAPA,
} from '../modules/concursos-cph/concursosCph.calc.js'
import type { ConcursoCphCalcInput } from '../modules/concursos-cph/concursosCph.calc.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const d = (iso: string) => new Date(iso)

/** Base vacante: todos los campos en null/false */
const BASE: ConcursoCphCalcInput = {
  suspendido: false,
  eeBaja: null,
  fechaBaja: null,
  eeConcurso: null,
  fechaEeConcurso: null,
  fechaAutorizacion: null,
  sorteoJurado: null,
  disposicion: null,
  fechaInscDesde: null,
  fechaInscHasta: null,
  inscripcionCerrada: null,
  ordenMeritoConfirmado: null,
  fechaExamen: null,
  fechaOrdenMerito: null,
  fechaIfacs: null,
  fechaInsal: null,
  eeDesignacion: null,
  cargaDocumentacion: null,
  fechaAptoMedico: null,
  fechaIte: null,
  proyectoResolucion: null,
  resoALaFirma: null,
  resolucionDesignacion: null,
  fechaResolucion: null,
  cargoSial: null,
  dispoDesierta: null,
  fechaDispoDesierta: null,
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

  it('solo con eeConcurso (cargo nuevo, sin baja) → activo', () => {
    expect(calcConcursoCph({ ...BASE, eeConcurso: 'EX-2026-00002' }).estado).toBe('activo')
  })

  it('concurso avanzado (G-INSAL) con eeConcurso pero sin eeBaja → activo', () => {
    const r = calcConcursoCph({
      ...BASE,
      eeConcurso: 'EX-2024-44019831',
      fechaBaja: d('2024-09-30'),
      fechaIfacs: d('2026-09-30'),
      fechaInsal: d('2026-10-02'),
    })
    expect(r.estado).toBe('activo')
    expect(r.subEstado).toBe('g-insal')
  })

  it('con resolucionDesignacion → finalizado', () => {
    const r = calcConcursoCph({
      ...ACTIVO,
      resolucionDesignacion: 'RESOL/123/MSGC/2026',
      fechaResolucion: d('2026-09-01'),
    })
    expect(r.estado).toBe('finalizado')
  })

  it('suspendido=true siempre → suspendido sin importar otros campos', () => {
    expect(calcConcursoCph({ ...ACTIVO, suspendido: true }).estado).toBe('suspendido')
    expect(calcConcursoCph({ ...BASE, suspendido: true }).estado).toBe('suspendido')
    expect(
      calcConcursoCph({
        ...ACTIVO,
        resolucionDesignacion: 'RESOL/1',
        fechaResolucion: d('2026-01-01'),
        suspendido: true,
      }).estado,
    ).toBe('suspendido')
  })
})

// ─── subEstado ────────────────────────────────────────────────────────────────

describe('calcConcursoCph — subEstado', () => {
  it('sin datos → vacante', () => {
    expect(calcConcursoCph(BASE).subEstado).toBe('vacante')
  })

  it('solo eeBaja sin eeConcurso → no iniciado', () => {
    expect(
      calcConcursoCph({ ...BASE, eeBaja: 'EX-2026-00001', fechaBaja: d('2026-01-01') }).subEstado,
    ).toBe('no iniciado')
  })

  it('eeBaja + eeConcurso → a-caratulado', () => {
    expect(calcConcursoCph(ACTIVO).subEstado).toBe('a-caratulado')
  })

  it('+ fechaAutorizacion → a-autzn', () => {
    expect(calcConcursoCph({ ...ACTIVO, fechaAutorizacion: d('2026-02-01') }).subEstado).toBe(
      'a-autzn',
    )
  })

  it('+ sorteoJurado → b-sorteo jur', () => {
    expect(
      calcConcursoCph({
        ...ACTIVO,
        fechaAutorizacion: d('2026-02-01'),
        sorteoJurado: d('2026-02-15'),
      }).subEstado,
    ).toBe('b-sorteo jur')
  })

  it('+ disposicion → c-dispo de llamado', () => {
    expect(
      calcConcursoCph({
        ...ACTIVO,
        fechaAutorizacion: d('2026-02-01'),
        sorteoJurado: d('2026-02-15'),
        disposicion: 'DI-123',
      }).subEstado,
    ).toBe('c-dispo de llamado')
  })

  it('+ fechaExamen → d-examen publicado', () => {
    const r = calcConcursoCph({
      ...ACTIVO,
      fechaAutorizacion: d('2026-02-01'),
      sorteoJurado: d('2026-02-15'),
      disposicion: 'DI-123',
      fechaExamen: d('2026-04-01'),
    })
    expect(r.subEstado).toBe('d-examen publicado')
  })

  it('+ fechaOrdenMerito → e-orden de merito', () => {
    const r = calcConcursoCph({
      ...ACTIVO,
      fechaAutorizacion: d('2026-02-01'),
      disposicion: 'DI-123',
      fechaExamen: d('2026-04-01'),
      fechaOrdenMerito: d('2026-05-01'),
    })
    expect(r.subEstado).toBe('e-orden de merito')
  })

  it('+ fechaIfacs → f-ifacs', () => {
    const r = calcConcursoCph({
      ...ACTIVO,
      fechaOrdenMerito: d('2026-05-01'),
      fechaIfacs: d('2026-06-01'),
    })
    expect(r.subEstado).toBe('f-ifacs')
  })

  it('+ fechaInsal → g-insal', () => {
    const r = calcConcursoCph({
      ...ACTIVO,
      fechaIfacs: d('2026-06-01'),
      fechaInsal: d('2026-07-01'),
    })
    expect(r.subEstado).toBe('g-insal')
  })

  it('+ eeDesignacion → h-tad', () => {
    const r = calcConcursoCph({
      ...ACTIVO,
      fechaInsal: d('2026-07-01'),
      eeDesignacion: 'EX-2026-TAD',
    })
    expect(r.subEstado).toBe('h-tad')
  })

  it('+ cargaDocumentacion → i-carga docu', () => {
    const r = calcConcursoCph({ ...ACTIVO, eeDesignacion: 'EX-2026-TAD', cargaDocumentacion: true })
    expect(r.subEstado).toBe('i-carga docu')
  })

  it('+ fechaAptoMedico → j-apto med', () => {
    const r = calcConcursoCph({
      ...ACTIVO,
      cargaDocumentacion: true,
      fechaAptoMedico: d('2026-08-01'),
    })
    expect(r.subEstado).toBe('j-apto med')
  })

  it('+ fechaIte → k-ite', () => {
    const r = calcConcursoCph({
      ...ACTIVO,
      fechaAptoMedico: d('2026-08-01'),
      fechaIte: d('2026-08-15'),
    })
    expect(r.subEstado).toBe('k-ite')
  })

  it('+ proyectoResolucion → l-pycto de reso', () => {
    const r = calcConcursoCph({ ...ACTIVO, fechaIte: d('2026-08-15'), proyectoResolucion: true })
    expect(r.subEstado).toBe('l-pycto de reso')
  })

  it('+ resoALaFirma → m-reso a la firma', () => {
    const r = calcConcursoCph({ ...ACTIVO, proyectoResolucion: true, resoALaFirma: true })
    expect(r.subEstado).toBe('m-reso a la firma')
  })

  it('+ resolucionDesignacion + fechaResolucion → n-designado', () => {
    const r = calcConcursoCph({
      ...ACTIVO,
      resoALaFirma: true,
      resolucionDesignacion: 'RESOL/1',
      fechaResolucion: d('2026-09-01'),
    })
    expect(r.subEstado).toBe('n-designado')
  })

  it('+ cargoSial → o-alta sial (máxima prioridad sobre designado)', () => {
    const r = calcConcursoCph({
      ...ACTIVO,
      resolucionDesignacion: 'RESOL/1',
      fechaResolucion: d('2026-09-01'),
      cargoSial: '001234567-1',
    })
    expect(r.subEstado).toBe('o-alta sial')
  })

  it('dispoDesierta + fechaDispoDesierta → q-desierto (máxima prioridad)', () => {
    const r = calcConcursoCph({
      ...ACTIVO,
      cargoSial: '001234567-1',
      dispoDesierta: 'DI-DESIERTA',
      fechaDispoDesierta: d('2026-09-01'),
    })
    expect(r.subEstado).toBe('q-desierto')
  })
})

// ─── subEstado3 ───────────────────────────────────────────────────────────────

describe('calcConcursoCph — subEstado3', () => {
  const PASADO = d('2020-01-01')
  const FUTURO = d('2099-01-01')

  it('sin datos → a-valid. vcte', () => {
    expect(calcConcursoCph(BASE).subEstado3).toBe('a-valid. vcte')
  })

  it('fechaAutorizacion + sorteoJurado → b-autorizado', () => {
    const r = calcConcursoCph({
      ...BASE,
      fechaAutorizacion: d('2026-01-01'),
      sorteoJurado: d('2026-02-01'),
    })
    expect(r.subEstado3).toBe('b-autorizado')
  })

  it('disposicion (sin fechas de examen) → c-inscripcion', () => {
    const r = calcConcursoCph({ ...BASE, disposicion: 'DI-123' })
    expect(r.subEstado3).toBe('c-inscripcion')
  })

  it('fechaInscHasta en el pasado → d-etapa eval', () => {
    const r = calcConcursoCph({ ...BASE, disposicion: 'DI-123', fechaInscHasta: PASADO })
    expect(r.subEstado3).toBe('d-etapa eval')
  })

  it('fechaInscHasta en el futuro → c-inscripcion (inscripción abierta)', () => {
    const r = calcConcursoCph({ ...BASE, disposicion: 'DI-123', fechaInscHasta: FUTURO })
    expect(r.subEstado3).toBe('c-inscripcion')
  })

  it('fechaExamen en el pasado → e-adjudi', () => {
    const r = calcConcursoCph({
      ...BASE,
      disposicion: 'DI-123',
      fechaInscHasta: PASADO,
      fechaExamen: PASADO,
    })
    expect(r.subEstado3).toBe('e-adjudi')
  })

  it('fechaExamen en el futuro → d-etapa eval (examen no ocurrió aún)', () => {
    const r = calcConcursoCph({
      ...BASE,
      disposicion: 'DI-123',
      fechaInscHasta: PASADO,
      fechaExamen: FUTURO,
    })
    expect(r.subEstado3).toBe('d-etapa eval')
  })

  it('eeDesignacion → f-prox. a desig', () => {
    const r = calcConcursoCph({ ...BASE, eeDesignacion: 'EX-2026-TAD' })
    expect(r.subEstado3).toBe('f-prox. a desig')
  })

  it('resolucionDesignacion → g-resolucion', () => {
    const r = calcConcursoCph({
      ...BASE,
      resolucionDesignacion: 'RESOL/1',
      fechaResolucion: d('2026-09-01'),
    })
    expect(r.subEstado3).toBe('g-resolucion')
  })

  it('fechaDispoDesierta → h-desierto (máxima prioridad)', () => {
    const r = calcConcursoCph({
      ...BASE,
      resolucionDesignacion: 'RESOL/1',
      fechaResolucion: d('2026-09-01'),
      fechaDispoDesierta: d('2026-09-01'),
    })
    expect(r.subEstado3).toBe('h-desierto')
  })
})

// ─── Invariantes ──────────────────────────────────────────────────────────────

describe('calcConcursoCph — invariantes', () => {
  it('suspendido nunca produce estado activo o finalizado', () => {
    const casos: ConcursoCphCalcInput[] = [
      { ...BASE, suspendido: true },
      { ...ACTIVO, suspendido: true },
      {
        ...ACTIVO,
        suspendido: true,
        resolucionDesignacion: 'RESOL/1',
        fechaResolucion: d('2026-01-01'),
      },
    ]
    for (const c of casos) {
      const { estado } = calcConcursoCph(c)
      expect(estado).toBe('suspendido')
    }
  })

  it('q-desierto siempre gana sobre cualquier otro subEstado', () => {
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
    expect(r.subEstado).toBe('q-desierto')
  })

  it('o-alta sial gana sobre n-designado', () => {
    const r = calcConcursoCph({
      ...ACTIVO,
      resolucionDesignacion: 'RESOL/1',
      fechaResolucion: d('2026-09-01'),
      cargoSial: '001234567-1',
    })
    expect(r.subEstado).toBe('o-alta sial')
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

// ─── Filtro por ETAPA (stepper 1..5) ↔ sub_estado ────────────────────────────
describe('etapaDeSubEstado — mapeo etapa↔sub_estado', () => {
  it('etapa 2: autorización / jurado', () => {
    for (const s of ['a-autzn', 'b-sorteo jur', 'c-dispo de llamado']) {
      expect(etapaDeSubEstado(s)).toBe(2)
    }
  })

  it('etapa 3: inscripción / examen / OM', () => {
    for (const s of ['c2-inscripcion ex', 'd-examen publicado', 'e-orden de merito']) {
      expect(etapaDeSubEstado(s)).toBe(3)
    }
  })

  it('etapa 4: IFACS / INSAL', () => {
    for (const s of ['f-ifacs', 'g-insal']) {
      expect(etapaDeSubEstado(s)).toBe(4)
    }
  })

  it('etapa 5: designación', () => {
    for (const s of [
      'h-tad',
      'i-carga docu',
      'j-apto med',
      'k-ite',
      'l-pycto de reso',
      'm-reso a la firma',
      'n-designado',
      'o-alta sial',
      'q-desierto',
    ]) {
      expect(etapaDeSubEstado(s)).toBe(5)
    }
  })

  it('etapa 1: baja / apertura (complemento, incluye null, a-caratulado, no iniciado, vacante)', () => {
    for (const s of ['a-caratulado', 'no iniciado', 'vacante', null, '', 'cualquier-cosa']) {
      expect(etapaDeSubEstado(s)).toBe(1)
    }
  })

  it('es case-insensitive (datos legacy en mayúscula)', () => {
    expect(etapaDeSubEstado('B-SORTEO JUR')).toBe(2)
    expect(etapaDeSubEstado('G-INSAL')).toBe(4)
  })

  it('ningún sub_estado está en dos etapas a la vez (particiones disjuntas)', () => {
    const vistos = new Set<string>()
    for (const etapa of [2, 3, 4, 5] as const) {
      for (const s of SUB_ESTADOS_POR_ETAPA[etapa]) {
        expect(vistos.has(s)).toBe(false)
        vistos.add(s)
      }
    }
  })
})
