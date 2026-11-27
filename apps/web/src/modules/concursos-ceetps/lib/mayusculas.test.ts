import { describe, expect, it } from 'vitest'
import { aMayusculas } from './mayusculas'

describe('aMayusculas', () => {
  it('pasa a mayúsculas respetando acentos y la ñ', () => {
    expect(aMayusculas('Técnico en Enfermería · Peña')).toBe('TÉCNICO EN ENFERMERÍA · PEÑA')
  })
  it('deja igual lo que ya está en mayúsculas', () => {
    expect(aMayusculas('EX-2026-1234')).toBe('EX-2026-1234')
  })
})
