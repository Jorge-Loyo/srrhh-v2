import { describe, it, expect } from 'vitest'

// =============================================================================
// Test de la función pura de decisión de cardinalidad del resolutor de slug.
// Se importa la función REAL del service (no se replica): no usa Prisma ni
// side effects, así que es testeable directamente. Patrón del repo: tests de
// lógica pura sin vi.mock.
// =============================================================================

import { elegirSlugResolutor } from '../modules/autorizaciones/autorizaciones.service.js'

describe('elegirSlugResolutor — cardinalidad del rol resolutor', () => {
  it('1 rol → ok con su slug', () => {
    const r = elegirSlugResolutor([{ slug: 'sgrasv_5ac494e' }])
    expect(r).toEqual({ ok: true, slug: 'sgrasv_5ac494e' })
  })

  it('0 roles → fallo motivo "ninguno"', () => {
    const r = elegirSlugResolutor([])
    expect(r).toEqual({ ok: false, motivo: 'ninguno', slugs: [] })
  })

  it('>1 roles → fallo motivo "ambiguo" preservando el orden de entrada', () => {
    // Entrada ya ascendente, como la entrega orderBy: { slug: 'asc' } de la query.
    const r = elegirSlugResolutor([{ slug: 'dgocdcps_cd75a0c' }, { slug: 'sgrasv_5ac494e' }])
    expect(r).toEqual({
      ok: false,
      motivo: 'ambiguo',
      slugs: ['dgocdcps_cd75a0c', 'sgrasv_5ac494e'],
    })
  })
})
