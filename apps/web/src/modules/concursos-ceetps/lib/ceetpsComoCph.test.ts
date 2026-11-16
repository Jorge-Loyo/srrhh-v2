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

  it('tipoGestion se guarda y se lee en CEETPS', () => {
    expect(cphPatchACeetps({ tipoGestion: 'centralizado' }).body).toEqual({ tipoGestion: 'centralizado' })
    const r = ceetpsComoCph({ ...base, tipoGestion: 'descentralizado' } as ConcursoCeetps)
    expect(r.tipoGestion).toBe('descentralizado')
  })
})
