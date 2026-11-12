import { describe, it, expect } from 'vitest'
import { datosTrasConfirmar, particionarValidacionPorIdSial } from './bajas.validacion.helpers.js'

describe('datosTrasConfirmar (Fix 1 — confirmar NO cierra el cargo)', () => {
  it('nunca devuelve la clave `estado` ni `estadoDesde`', () => {
    const conActa = datosTrasConfirmar('EXP-123')
    const sinActa = datosTrasConfirmar(undefined)
    expect('estado' in conActa).toBe(false)
    expect('estadoDesde' in conActa).toBe(false)
    expect('estado' in sinActa).toBe(false)
    expect('estadoDesde' in sinActa).toBe(false)
  })

  it('con acta → { expediente: acta }', () => {
    expect(datosTrasConfirmar('EXP-123')).toEqual({ expediente: 'EXP-123' })
  })

  it('sin acta → {} (no-op de negocio)', () => {
    expect(datosTrasConfirmar(undefined)).toEqual({})
  })
})

describe('particionarValidacionPorIdSial (Fix 2 — Bug B)', () => {
  it('un cargo idSial NULL y un cargo 24/07 (idSial no-NULL) NO entran a aConfirmar ni aRechazar', () => {
    const cargos = [
      { id: 'clon-2407', idSial: null, es24y07: true }, // clon desdoblado 1:1
      { id: 'pre-2407', idSial: 'IS-999', es24y07: true }, // 24/07 con id_sial preexistente
      { id: 'normal-presente', idSial: 'IS-100', es24y07: false },
      { id: 'normal-ausente', idSial: 'IS-200', es24y07: false },
    ]
    const idSialsNuevos = new Set(['IS-100', 'IS-999']) // IS-999 presente pero es 24/07
    const es24y07Set = new Set(['clon-2407', 'pre-2407'])

    const { aRechazar, aConfirmar } = particionarValidacionPorIdSial(
      cargos,
      idSialsNuevos,
      es24y07Set,
    )

    // Los 24/07 (ambos) quedan fuera de las dos listas.
    expect(aRechazar).not.toContain('clon-2407')
    expect(aRechazar).not.toContain('pre-2407')
    expect(aConfirmar).not.toContain('clon-2407')
    expect(aConfirmar).not.toContain('pre-2407')

    // Cargo normal presente en el padrón nuevo → rechazar (vuelve a vigente).
    expect(aRechazar).toEqual(['normal-presente'])
    // Cargo normal ausente del padrón nuevo → confirmar (no_vigente).
    expect(aConfirmar).toEqual(['normal-ausente'])
  })

  it('cargo con idSial NULL no-24/07 tampoco entra (sin id_sial no hay cruce)', () => {
    const { aRechazar, aConfirmar } = particionarValidacionPorIdSial(
      [{ id: 'sin-sial', idSial: null, es24y07: false }],
      new Set<string>(),
      new Set<string>(),
    )
    expect(aRechazar).toEqual([])
    expect(aConfirmar).toEqual([])
  })
})
