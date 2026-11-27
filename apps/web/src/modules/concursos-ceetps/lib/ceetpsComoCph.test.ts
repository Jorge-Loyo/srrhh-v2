import { describe, it, expect } from 'vitest'
import type { ConcursoCeetps } from '@srrhh/types'
import { ceetpsComoCph, cphPatchACeetps } from './ceetpsComoCph'

const base = {
  id: 'x',
  estado: 'autorizado',
  subEstado: null,
  expedienteConcurso: 'EX-1',
  dispoLlamado: null,
  codigoSial: null,
  concurso: { id: 'k' },
  hospital: { id: 'h', sigla: 'HRRMF' },
} as unknown as ConcursoCeetps

describe('ceetpsComoCph', () => {
  it('autorizado (etapa 2): autorización completada, el panel queda en sorteo de jurado', () => {
    expect(ceetpsComoCph(base).subEstado).toBe('a-autzn')
  })

  it('lee los campos de la etapa 5 (antes quedaban siempre vacíos)', () => {
    const r = ceetpsComoCph({
      ...base,
      cargaDocumentacion: true,
      fechaAptoMedico: '2026-11-01',
      proyectoResolucion: true,
      resoALaFirma: false,
      fechaResolucion: '2026-11-03',
      dispoDesignacion: 'DI-1',
      fechaDispoDesignacion: '2026-11-02',
      resolucionConvalidacion: 'RESFC-2',
      tramiteDesignacion: 'gene1303',
    } as ConcursoCeetps) as unknown as Record<string, unknown>
    expect(r).toMatchObject({
      cargaDocumentacion: true,
      fechaAptoMedico: '2026-11-01',
      proyectoResolucion: true,
      resoALaFirma: false,
      fechaResolucion: '2026-11-03',
      dispoDesignacion: 'DI-1',
      fechaDispoDesignacion: '2026-11-02',
      resolucionConvalidacion: 'RESFC-2',
      tramiteDesignacion: 'gene1303',
      fechaIte: null,
    })
  })

  it('las fechas del cronograma llenan las fechas de inscripción, examen y OM de CPH', () => {
    const r = ceetpsComoCph({
      ...base,
      cronograma: {
        inscripcion_desde: '2026-08-27',
        inscripcion_hasta: '2026-09-01',
        examen: '2026-09-10',
        comunicacion_orden_merito: '2026-09-30',
      },
    } as ConcursoCeetps)
    expect(r).toMatchObject({
      fechaInscDesde: '2026-08-27',
      fechaInscHasta: '2026-09-01',
      fechaExamen: '2026-09-10',
      fechaOrdenMerito: '2026-09-30',
    })
    expect(ceetpsComoCph(base).fechaExamen).toBeNull()
  })

  it('traduce campos con nombre distinto y pasa el hospital a concurso.hospital', () => {
    const r = ceetpsComoCph({ ...base, subEstado: 'DISPO_LLAMADO', dispoLlamado: 'DI-9' } as ConcursoCeetps)
    expect(r.eeConcurso).toBe('EX-1')
    expect(r.disposicion).toBe('DI-9')
    expect(r.subEstado).toBe('c-dispo de llamado')
    expect((r.concurso as unknown as { hospital: { sigla: string } }).hospital.sigla).toBe('HRRMF')
  })
})

describe('cphPatchACeetps', () => {
  it('renombra los campos conocidos, manda "" como null y descarta los CPH-only', () => {
    const { body, descartados } = cphPatchACeetps({
      eeConcurso: 'EX-2',
      disposicion: '',
      cargoSial: 'S-1',
      sorteoJurado: '2026-01-01',
      tipoGestion: 'x',
    })
    expect(body).toEqual({ expedienteConcurso: 'EX-2', dispoLlamado: null, codigoSial: 'S-1', tipoGestion: 'x' })
    expect(descartados).toEqual(['sorteoJurado'])
  })

  it('los campos de la etapa 5 se guardan con el mismo nombre (no se descartan)', () => {
    const etapa5 = {
      cargaDocumentacion: true,
      fechaAptoMedico: '2026-11-01',
      dispoDesignacion: 'DI-1',
      fechaDispoDesignacion: '2026-11-02',
      resolucionConvalidacion: '',
      proyectoResolucion: false,
      resolucionDesignacion: 'RESFC-1',
      fechaResolucion: '2026-11-03',
      resoALaFirma: true,
      tramiteDesignacion: 'tad',
    }
    const { body, descartados } = cphPatchACeetps(etapa5)
    expect(descartados).toEqual([])
    expect(body).toEqual({ ...etapa5, resolucionConvalidacion: null })
  })

  it('fechaIte se descarta (CEETPS no tiene ITE)', () => {
    expect(cphPatchACeetps({ fechaIte: '2026-11-01' }).descartados).toEqual(['fechaIte'])
  })

  it('tipoGestion se guarda y se lee en CEETPS', () => {
    expect(cphPatchACeetps({ tipoGestion: 'centralizado' }).body).toEqual({ tipoGestion: 'centralizado' })
    const r = ceetpsComoCph({ ...base, tipoGestion: 'descentralizado' } as ConcursoCeetps)
    expect(r.tipoGestion).toBe('descentralizado')
  })
})
