import { describe, it, expect } from 'vitest'
import { evaluarRatioTamano } from './padron.diff.helpers.js'

// Guarda contra padrón parcial: la métrica de ratio es pura (sin Prisma/env), se
// testea como el resto de los helpers del diff. Casos del sprint: ratio bajo
// bloquea (anómalo), ratio ~1.0 pasa, sin aprobado previo no aplica, y el
// override (que salta el bloqueo) se modela en el call site — acá se verifica
// que la métrica MARQUE el padrón como anómalo para que ese bloqueo exista.
const UMBRAL = 0.7

describe('evaluarRatioTamano', () => {
  it('ratio bajo (parcial 3.174 vs 52.723) → anómalo, bloquea', () => {
    const r = evaluarRatioTamano(3174, 52723, UMBRAL)
    expect(r.ratio).toBeCloseTo(0.0602, 3)
    expect(r.anomalo).toBe(true)
  })

  it('parcial 31.655 vs 52.723 (0.60) → anómalo', () => {
    const r = evaluarRatioTamano(31655, 52723, UMBRAL)
    expect(r.ratio).toBeCloseTo(0.6004, 3)
    expect(r.anomalo).toBe(true)
  })

  it('padrón completo ~1.0 (52.000 vs 52.723) → pasa', () => {
    const r = evaluarRatioTamano(52000, 52723, UMBRAL)
    expect(r.ratio).toBeCloseTo(0.9863, 3)
    expect(r.anomalo).toBe(false)
  })

  it('justo en el umbral (ratio === 0.7) → NO anómalo (bloquea solo si < umbral)', () => {
    const r = evaluarRatioTamano(70, 100, UMBRAL)
    expect(r.ratio).toBeCloseTo(0.7, 5)
    expect(r.anomalo).toBe(false)
  })

  it('apenas bajo el umbral (0.6999) → anómalo', () => {
    const r = evaluarRatioTamano(6999, 10000, UMBRAL)
    expect(r.anomalo).toBe(true)
  })

  it('sin snapshot aprobado previo (referencia null) → la guarda NO aplica', () => {
    const r = evaluarRatioTamano(3174, null, UMBRAL)
    expect(r.ratio).toBeNull()
    expect(r.anomalo).toBe(false)
  })

  it('referencia undefined → la guarda NO aplica', () => {
    const r = evaluarRatioTamano(3174, undefined, UMBRAL)
    expect(r.ratio).toBeNull()
    expect(r.anomalo).toBe(false)
  })

  it('referencia con total 0 (dato corrupto) → no divide por cero, no aplica', () => {
    const r = evaluarRatioTamano(3174, 0, UMBRAL)
    expect(r.ratio).toBeNull()
    expect(r.anomalo).toBe(false)
  })

  it('padrón nuevo más grande que la referencia (ratio > 1) → pasa', () => {
    const r = evaluarRatioTamano(60000, 52723, UMBRAL)
    expect(r.ratio).toBeGreaterThan(1)
    expect(r.anomalo).toBe(false)
  })
})
