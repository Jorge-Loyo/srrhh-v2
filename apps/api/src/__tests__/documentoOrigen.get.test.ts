import { describe, it, expect, vi, beforeEach } from 'vitest'
import { documentoOrigenDeConcurso } from '@srrhh/types'

// ─── Documento de origen en el GET del concurso (CPH y CEETPS) ───────────────
// Campo ADITIVO: no se copia a eeBaja y no cambia estado/sub-estado.
const prismaMock = vi.hoisted(() => ({
  concursoCph: { findUnique: vi.fn() },
  concursoCeetps: { findUnique: vi.fn() },
  autorizacion: { findFirst: vi.fn() },
  auditLog: { findFirst: vi.fn() },
  ordenMeritoIntegrante: { findUnique: vi.fn() },
}))
vi.mock('../shared/prisma.js', () => ({ prisma: prismaMock }))
vi.mock('../modules/concursos/corregirTipo.service.js', () => ({
  listarCorreccionesTipo: vi.fn().mockResolvedValue([]),
}))

import { getConcursoCphByIdService } from '../modules/concursos-cph/concursos-cph.service.js'
import { getConcursoCeetpsByIdService } from '../modules/concursos-ceetps/concursos-ceetps.service.js'
import { calcConcursoCph, SUB_ESTADO_3_SQL_PG } from '../modules/concursos-cph/concursosCph.calc.js'
import type { ConcursoCphCalcInput } from '../modules/concursos-cph/concursosCph.calc.js'
import { calcEstadoCeetps } from '../modules/concursos-ceetps/concursosCeetps.calc.js'

const filaCph = (motivo: string, over: Record<string, unknown> = {}) => ({
  id: 'cph-1',
  eeBaja: null,
  eeConcurso: null,
  saltoOmAt: null,
  saltoOmIntegranteId: null,
  etiquetas: [],
  concurso: {
    motivoConcurso: motivo,
    expediente: 'EX-2026-111-GCABA',
    cargo: { expediente: 'EX-2026-222-GCABA' },
    baja: null,
  },
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.autorizacion.findFirst.mockResolvedValue(null)
})

describe('GET concurso CPH: documentoOrigen', () => {
  it('nuevo_cargo: creación con el expediente del alta; eeBaja queda intacto (null)', async () => {
    prismaMock.concursoCph.findUnique.mockResolvedValue(filaCph('nuevo_cargo'))
    const r = await getConcursoCphByIdService('cph-1')
    expect(r.documentoOrigen).toMatchObject({
      tipo: 'creacion',
      etiqueta: 'Documento de origen (Creación)',
      valor: 'EX-2026-111-GCABA',
      fuente: 'concurso.expediente',
    })
    expect(r.eeBaja).toBeNull()
  })

  it('nuevo_cargo por decreto de Estructura: fuente decreto', async () => {
    prismaMock.concursoCph.findUnique.mockResolvedValue(
      filaCph('nuevo_cargo', { concurso: { motivoConcurso: 'nuevo_cargo', expediente: null, cargo: { expediente: 'DEC-541/MSGC/26' }, baja: null } }),
    )
    const r = await getConcursoCphByIdService('cph-1')
    expect(r.documentoOrigen).toMatchObject({ tipo: 'creacion', valor: 'DEC-541/MSGC/26', fuente: 'decreto' })
  })

  it('baja: toma eeBaja del concurso o de la baja; eeBaja no cambia', async () => {
    prismaMock.concursoCph.findUnique.mockResolvedValue(
      filaCph('alta_por_baja', { eeBaja: null, concurso: { motivoConcurso: 'alta_por_baja', expediente: 'X', cargo: { expediente: 'Y' }, baja: { eeBaja: 'EX-BAJA-1' } } }),
    )
    const r = await getConcursoCphByIdService('cph-1')
    expect(r.documentoOrigen).toMatchObject({ tipo: 'baja', etiqueta: 'Documento de origen (Baja)', valor: 'EX-BAJA-1', fuente: 'eeBaja' })
    expect(r.eeBaja).toBeNull()
  })
})

describe('GET concurso CEETPS: documentoOrigen', () => {
  const filaCeetps = (motivo: string, baja: { eeBaja: string } | null = null) => ({
    id: 'ce-1',
    concurso: { motivoConcurso: motivo, expediente: 'EX-2026-333-GCABA', cargo: { expediente: null }, baja, autorizadoAt: null },
  })

  it('nuevo_cargo: creación (también en la rama sin autorizar)', async () => {
    prismaMock.concursoCeetps.findUnique.mockResolvedValue(filaCeetps('nuevo_cargo'))
    const r = await getConcursoCeetpsByIdService('ce-1')
    expect(r.documentoOrigen).toMatchObject({ tipo: 'creacion', valor: 'EX-2026-333-GCABA' })
  })

  it('baja: expediente de la baja', async () => {
    prismaMock.concursoCeetps.findUnique.mockResolvedValue(filaCeetps('alta_por_baja', { eeBaja: 'EX-BAJA-9' }))
    const r = await getConcursoCeetpsByIdService('ce-1')
    expect(r.documentoOrigen).toMatchObject({ tipo: 'baja', valor: 'EX-BAJA-9' })
  })
})

describe('el documento de origen no cambia estado/sub-estado', () => {
  const base: ConcursoCphCalcInput = {
    suspendido: false, eeBaja: null, fechaBaja: null, eeConcurso: 'EX-C', fechaEeConcurso: new Date('2026-01-15'),
    fechaAutorizacion: null, sorteoJurado: null, disposicion: null, fechaInscDesde: null, fechaInscHasta: null,
    inscripcionCerrada: null, ordenMeritoConfirmado: null, fechaExamen: null, fechaOrdenMerito: null,
    fechaIfacs: null, fechaInsal: null, eeDesignacion: null, cargaDocumentacion: null, fechaAptoMedico: null,
    fechaIte: null, proyectoResolucion: null, resoALaFirma: null, resolucionDesignacion: null, fechaResolucion: null,
    cargoSial: null, dispoDesierta: null, fechaDispoDesierta: null, validado: false, validadoIdSialRol: null,
  }

  it('calcConcursoCph: nuevo_cargo (sin eeBaja) y baja (con eeBaja) calculan igual que antes', () => {
    // La función de mapeo no es entrada del cálculo: mismas entradas -> mismo resultado.
    documentoOrigenDeConcurso({ motivoConcurso: 'nuevo_cargo', expedienteConcurso: 'EX-C' })
    expect(calcConcursoCph(base).subEstado3).toBe('a-valid. vcte')
    expect(calcConcursoCph(base)).toEqual(calcConcursoCph({ ...base }))
    const conBaja = calcConcursoCph({ ...base, eeBaja: 'EX-BAJA', fechaBaja: new Date('2026-01-01') })
    expect(conBaja.estado).toBe('activo')
    expect(conBaja.subEstado).toBe('a-caratulado')
  })

  it('SUB_ESTADO_3_SQL_PG sigue sin referenciar documentos de origen (paridad con calcSubEstado3)', () => {
    expect(SUB_ESTADO_3_SQL_PG).not.toMatch(/ee_baja|expediente|documento/i)
    expect(SUB_ESTADO_3_SQL_PG).toContain("ELSE 'a-valid. vcte'")
  })

  it('calcEstadoCeetps no depende del documento de origen', () => {
    const input = {
      expedienteConcurso: 'EX-C', fechaCaratulacion: new Date('2026-01-15'), puestoSolicitado: null, dispoLlamado: null,
      fechaIfacs: null, fechaInsal: null, expedienteDesignacion: null, dispoDesignacion: null, resolucionDesignacion: null,
    }
    expect(calcEstadoCeetps(input)).toEqual(calcEstadoCeetps({ ...input }))
  })

  it('el GET no devuelve calc distinto: el sub-estado persistido del row pasa tal cual', async () => {
    prismaMock.concursoCph.findUnique.mockResolvedValue(filaCph('nuevo_cargo', { subEstado3: 'a-valid. vcte', subEstado: 'vacante' }))
    const r = await getConcursoCphByIdService('cph-1')
    expect(r).toMatchObject({ subEstado3: 'a-valid. vcte', subEstado: 'vacante' })
  })
})
