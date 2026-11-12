import { describe, expect, it } from 'vitest'
import { documentoOrigenDeConcurso } from './documentoOrigen'

describe('documentoOrigenDeConcurso', () => {
  it('nuevo_cargo: Creación con el expediente heredado del alta', () => {
    const d = documentoOrigenDeConcurso({
      motivoConcurso: 'nuevo_cargo',
      expedienteConcurso: 'EX-2026-111-GCABA',
      expedienteCargo: 'EX-2026-222-GCABA',
      eeBaja: 'EX-BAJA',
    })
    expect(d).toMatchObject({
      tipo: 'creacion',
      etiqueta: 'Documento de origen (Creación)',
      valor: 'EX-2026-111-GCABA',
      fuente: 'concurso.expediente',
      esCreacion: true,
    })
  })

  it('nuevo_cargo: cae a cargo.expediente y nunca usa eeBaja', () => {
    const d = documentoOrigenDeConcurso({
      motivoConcurso: 'nuevo_cargo',
      expedienteCargo: 'EX-2026-222-GCABA',
      eeBaja: 'EX-BAJA',
    })
    expect(d.valor).toBe('EX-2026-222-GCABA')
    expect(d.fuente).toBe('cargo.expediente')
  })

  it('nuevo_cargo por decreto', () => {
    const d = documentoOrigenDeConcurso({
      motivoConcurso: 'nuevo_cargo',
      expedienteConcurso: 'DEC-541/MSGC/26',
    })
    expect(d.fuente).toBe('decreto')
    expect(d.etiqueta).toBe('Documento de origen (Creación)')
  })

  it('nuevo_cargo sin dato', () => {
    const d = documentoOrigenDeConcurso({ motivoConcurso: 'nuevo_cargo' })
    expect(d.valor).toBe('')
    expect(d.fuente).toBe('sin_dato')
  })

  it('alta_por_baja: Baja con eeBaja', () => {
    const d = documentoOrigenDeConcurso({
      motivoConcurso: 'alta_por_baja',
      eeBaja: 'EX-BAJA-1',
      expedienteCargo: 'EX-ALTA',
    })
    expect(d).toMatchObject({
      tipo: 'baja',
      etiqueta: 'Documento de origen (Baja)',
      valor: 'EX-BAJA-1',
      fuente: 'eeBaja',
      esCreacion: false,
    })
  })

  it('sin motivo y sin eeBaja: etiqueta genérica', () => {
    const d = documentoOrigenDeConcurso({ motivoConcurso: null })
    expect(d).toMatchObject({ tipo: 'otro', etiqueta: 'Documento de origen', valor: '' })
  })

  it('sin motivo con eeBaja (legacy): Baja', () => {
    const d = documentoOrigenDeConcurso({ eeBaja: 'EX-LEG' })
    expect(d.etiqueta).toBe('Documento de origen (Baja)')
    expect(d.valor).toBe('EX-LEG')
  })
})
