import { describe, it, expect } from 'vitest'

// =============================================================================
// Test de la función pura de dedup de autorizaciones pendientes del concurso
// CPH. Se importa la función REAL del service (no se replica): no usa Prisma ni
// side effects, así que es testeable directamente. Patrón del repo: tests de
// lógica pura sin vi.mock (ver autorizaciones.unit.test.ts).
// =============================================================================

import { existeAutorizacionPendiente } from '../modules/concursos-cph/concursos-cph.service.js'

const REF = '209ef454-2ad7-4a81-99da-1e5a3d5b26b2'

describe('existeAutorizacionPendiente — dedup de autorizaciones pendientes', () => {
  it('lista vacía → false', () => {
    expect(existeAutorizacionPendiente([], 'concurso_cph', REF)).toBe(false)
  })

  it('existe una pendiente del mismo tipo y referenciaId → true', () => {
    const autorizaciones = [{ tipo: 'concurso_cph', referenciaId: REF, estado: 'pendiente' }]
    expect(existeAutorizacionPendiente(autorizaciones, 'concurso_cph', REF)).toBe(true)
  })

  it('existe del mismo tipo/referenciaId pero estado != pendiente (aprobada) → false', () => {
    const autorizaciones = [{ tipo: 'concurso_cph', referenciaId: REF, estado: 'aprobada' }]
    expect(existeAutorizacionPendiente(autorizaciones, 'concurso_cph', REF)).toBe(false)
  })

  it('existe pendiente pero de otra referenciaId → false', () => {
    const autorizaciones = [
      { tipo: 'concurso_cph', referenciaId: 'otra-referencia', estado: 'pendiente' },
    ]
    expect(existeAutorizacionPendiente(autorizaciones, 'concurso_cph', REF)).toBe(false)
  })
})
