import { describe, it, expect, vi, beforeEach } from 'vitest'

// =============================================================================
// PASO A (flujo concursos) — tests del SERVICIO listNuevosCargosService que
// alimenta la vista "Nuevos cargos" (/cargos/nuevos-cargos). Cubren el contrato
// del filtro (idSial LIKE 'MANUAL-%' + estado='vigente' + subEstado IN
// (vacante,concurso) + orden por expediente NULLS LAST) y que el mapeo del
// payload conserva la forma de `Cargo`. Se mockea Prisma para no tocar la BD.
// =============================================================================

const cargo = { count: vi.fn(), findMany: vi.fn() }

vi.mock('../shared/prisma.js', () => ({
  prisma: { cargo },
}))

const { listNuevosCargosService } = await import('../modules/cargos/cargos.service.js')

// Query con los defaults que el schema ya habría aplicado.
function query(overrides: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- query parcial de test
  return { page: 1, limit: 50, ...overrides } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  cargo.count.mockResolvedValue(0)
  cargo.findMany.mockResolvedValue([])
})

describe('listNuevosCargosService — filtro de visibilidad', () => {
  it('filtra por idSial MANUAL-%, estado vigente y subEstado IN (vacante, concurso)', async () => {
    await listNuevosCargosService(query())
    const where = cargo.findMany.mock.calls[0][0].where
    expect(where.idSial).toEqual({ startsWith: 'MANUAL-' })
    expect(where.estado).toBe('vigente')
    expect(where.subEstado).toEqual({ in: ['vacante', 'concurso'] })
  })

  it('cuando viene subEstado=vacante acota a ese único sub-estado (dentro del universo)', async () => {
    await listNuevosCargosService(query({ subEstado: 'vacante' }))
    const where = cargo.findMany.mock.calls[0][0].where
    expect(where.subEstado).toEqual({ in: ['vacante'] })
    // El resto del criterio fijo se mantiene — un ocupado nunca entra porque
    // 'ocupado' no está en el universo permitido.
    expect(where.estado).toBe('vigente')
    expect(where.idSial).toEqual({ startsWith: 'MANUAL-' })
  })

  it('ordena por expediente ASC con NULLS LAST (el "bloque"), desempate por createdAt', async () => {
    await listNuevosCargosService(query())
    const orderBy = cargo.findMany.mock.calls[0][0].orderBy
    expect(orderBy).toEqual([
      { expediente: { sort: 'asc', nulls: 'last' } },
      { createdAt: 'asc' },
    ])
  })

  it('aplica el filtro de hospital cuando viene hospitalId', async () => {
    await listNuevosCargosService(query({ hospitalId: 'hosp-1' }))
    const where = cargo.findMany.mock.calls[0][0].where
    expect(where.hospitalId).toBe('hosp-1')
  })

  it('busca por código, puesto, especialidad y expediente cuando viene search', async () => {
    await listNuevosCargosService(query({ search: 'MED' }))
    const where = cargo.findMany.mock.calls[0][0].where
    expect(Array.isArray(where.OR)).toBe(true)
    const campos = where.OR.flatMap((o: Record<string, unknown>) => Object.keys(o))
    expect(campos).toEqual(['codigo', 'literalPuesto', 'especialidadLegacy', 'expediente'])
  })
})

describe('listNuevosCargosService — mapeo del payload (forma de Cargo)', () => {
  it('un cargo vacante de alta aparece con ocupado=false y personaOcupante=null', async () => {
    cargo.count.mockResolvedValue(1)
    cargo.findMany.mockResolvedValue([
      {
        id: 'c1',
        idSial: 'MANUAL-0001',
        codigo: '37-0001',
        estado: 'vigente',
        subEstado: 'vacante',
        expediente: 'EX-2026-1',
        especialidadLegacy: null,
        createdAt: new Date('2026-01-01'),
        ocupaciones: [],
      },
    ])
    const res = await listNuevosCargosService(query())
    expect(res.data).toHaveLength(1)
    expect(res.data[0].ocupado).toBe(false)
    expect(res.data[0].personaOcupante).toBeNull()
    expect(res.data[0].subEstado).toBe('vacante')
    expect(res.meta.total).toBe(1)
  })
})
