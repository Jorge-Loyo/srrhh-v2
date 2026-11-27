import { describe, expect, it } from 'vitest'
import { esValidableContraConcursoCeetps } from '../modules/padron/padron.service.js'

describe('esValidableContraConcursoCeetps', () => {
  const base = {
    escalafonDiffId: 'esc-1',
    escalafonConcursoId: 'esc-1',
    siglaDiff: 'hgaz',
    siglaConcurso: 'HGAZ ',
  }
  it('engancha con la misma carrera y sigla (sin importar mayúsculas)', () => {
    expect(esValidableContraConcursoCeetps(base)).toBe(true)
  })
  it('no engancha si la carrera es otra', () => {
    expect(esValidableContraConcursoCeetps({ ...base, escalafonDiffId: 'esc-2' })).toBe(false)
  })
  it('no engancha si la sigla es otra o falta', () => {
    expect(esValidableContraConcursoCeetps({ ...base, siglaDiff: 'HMOM' })).toBe(false)
    expect(esValidableContraConcursoCeetps({ ...base, siglaDiff: null })).toBe(false)
  })
  it('no engancha si el diff no tiene carrera resuelta', () => {
    expect(esValidableContraConcursoCeetps({ ...base, escalafonDiffId: null })).toBe(false)
  })
})
