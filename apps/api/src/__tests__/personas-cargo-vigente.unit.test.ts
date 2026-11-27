import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Prisma } from '@prisma/client'

// =============================================================================
// GET /personas?conCargoVigente=true — buscador de candidatos a jurado CEETPS:
// solo personas activas con una ocupación vigente sobre un cargo vigente.
// =============================================================================
const $queryRaw = vi.fn()
vi.mock('../shared/prisma.js', () => ({ prisma: { $queryRaw } }))

const { personasQuerySchema } = await import('../modules/personas/personas.schema.js')
const { listPersonasService } = await import('../modules/personas/personas.service.js')

function sqlDelListado(): string {
  const sql = $queryRaw.mock.calls[0][0] as Prisma.Sql
  return sql.sql.replace(/\s+/g, ' ')
}

beforeEach(() => {
  vi.clearAllMocks()
  $queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0n }])
})

describe('conCargoVigente', () => {
  it('el schema convierte "true"/"false" a boolean y lo deja undefined si no viene', () => {
    expect(personasQuerySchema.parse({ conCargoVigente: 'true' }).conCargoVigente).toBe(true)
    expect(personasQuerySchema.parse({ conCargoVigente: 'false' }).conCargoVigente).toBe(false)
    expect(personasQuerySchema.parse({}).conCargoVigente).toBeUndefined()
  })

  it('con true filtra por persona activa y ocupación vigente en cargo vigente no eliminado', async () => {
    await listPersonasService(
      personasQuerySchema.parse({ conCargoVigente: 'true', search: '2711' }),
    )
    const sql = sqlDelListado()
    expect(sql).toContain('p.activo = true AND EXISTS')
    expect(sql).toContain('ov.hasta IS NULL')
    expect(sql).toContain("cv.estado = 'vigente'")
    expect(sql).toContain('cv.deleted_at IS NULL')
  })

  it('sin el filtro no agrega la condición', async () => {
    await listPersonasService(personasQuerySchema.parse({ search: '2711' }))
    expect(sqlDelListado()).not.toContain('ov.hasta IS NULL')
  })
})
