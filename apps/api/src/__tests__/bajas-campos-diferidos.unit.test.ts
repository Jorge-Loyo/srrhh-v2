import { describe, it, expect, vi, beforeEach } from 'vitest'

// =============================================================================
// Tests del endpoint dedicado PATCH /:id/campos-diferidos.
//
// Regla verificada: completar los 2 campos diferidos (Doc. respaldatoria y
// Fecha pase paralelo/GT) debe actualizar SOLO esos dos campos de la baja y NO
// tocar estado, cargo ni concurso. Por eso se usa un endpoint dedicado y no el
// PATCH /:id genérico (que al salir de resolucion_a_la_firma dispara la lógica
// de confirmación).
//
// Se mockea el cliente Prisma compartido para no tocar la BD (el backend local
// apunta a Neon prod). El `buildCamposDiferidosData` también se testea puro.
// =============================================================================

const prismaMock = vi.hoisted(() => ({
  baja: { findUnique: vi.fn(), update: vi.fn() },
  cargo: { update: vi.fn() },
  concursoCph: { create: vi.fn() },
  $transaction: vi.fn(),
}))

vi.mock('../shared/prisma.js', () => ({ prisma: prismaMock }))

import { buildCamposDiferidosData, updateCamposDiferidosService } from '../modules/bajas/bajas.service.js'

describe('buildCamposDiferidosData — solo los 2 campos diferidos', () => {
  it('mapea docRespaldatoria y fechaPaseParalelo (fecha → Date)', () => {
    const data = buildCamposDiferidosData({ docRespaldatoria: 'EX-123', fechaPaseParalelo: '2026-03-15' })
    expect(Object.keys(data).sort()).toEqual(['docRespaldatoria', 'fechaPaseParalelo'])
    expect(data.docRespaldatoria).toBe('EX-123')
    expect(data.fechaPaseParalelo).toBeInstanceOf(Date)
    expect((data.fechaPaseParalelo as Date).toISOString().slice(0, 10)).toBe('2026-03-15')
  })

  it("'' limpia el campo (null)", () => {
    const data = buildCamposDiferidosData({ docRespaldatoria: '', fechaPaseParalelo: '' })
    expect(data.docRespaldatoria).toBeNull()
    expect(data.fechaPaseParalelo).toBeNull()
  })

  it('undefined deja el campo sin tocar (no aparece en data)', () => {
    const data = buildCamposDiferidosData({ docRespaldatoria: 'solo-doc' })
    expect(data).toHaveProperty('docRespaldatoria', 'solo-doc')
    expect(data).not.toHaveProperty('fechaPaseParalelo')
  })

  it('nunca incluye estado, cargo ni concurso', () => {
    const data = buildCamposDiferidosData({ docRespaldatoria: 'x', fechaPaseParalelo: '2026-01-01' }) as Record<string, unknown>
    expect(data).not.toHaveProperty('estado')
    expect(data).not.toHaveProperty('cargoId')
    expect(data).not.toHaveProperty('generaConcurso')
  })
})

describe('updateCamposDiferidosService — no toca estado/cargo/concurso', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('actualiza SOLO doc_respaldatoria y fecha_pase_paralelo', async () => {
    prismaMock.baja.findUnique.mockResolvedValue({ id: 'baja-1', estado: 'confirmada', cargoId: 'cargo-1' })
    prismaMock.baja.update.mockResolvedValue({ id: 'baja-1' })

    await updateCamposDiferidosService('baja-1', { docRespaldatoria: 'EX-999', fechaPaseParalelo: '2026-05-20' })

    expect(prismaMock.baja.update).toHaveBeenCalledTimes(1)
    const arg = prismaMock.baja.update.mock.calls[0][0]
    expect(arg.where).toEqual({ id: 'baja-1' })
    expect(Object.keys(arg.data).sort()).toEqual(['docRespaldatoria', 'fechaPaseParalelo'])
    expect(arg.data).not.toHaveProperty('estado')
    expect(arg.data).not.toHaveProperty('generaConcurso')

    // No toca el cargo ni crea concurso
    expect(prismaMock.cargo.update).not.toHaveBeenCalled()
    expect(prismaMock.concursoCph.create).not.toHaveBeenCalled()
  })

  it('falla si la baja no existe', async () => {
    prismaMock.baja.findUnique.mockResolvedValue(null)
    await expect(
      updateCamposDiferidosService('inexistente', { docRespaldatoria: 'x' }),
    ).rejects.toThrow(/no encontrada/i)
    expect(prismaMock.baja.update).not.toHaveBeenCalled()
  })
})
