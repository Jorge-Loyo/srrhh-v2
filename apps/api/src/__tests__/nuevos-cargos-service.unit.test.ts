import { describe, it, expect, vi, beforeEach } from 'vitest'

// =============================================================================
// PASO A (flujo concursos) — tests del SERVICIO listNuevosCargosService que
// alimenta la vista "Nuevos cargos" (/cargos/nuevos-cargos). Cubren el contrato
// del filtro (expediente NO nulo/NO vacío + estado='vigente' + subEstado IN
// (vacante,concurso) + orden por expediente) y que el mapeo del payload
// conserva la forma de `Cargo`. El discriminador de "creado por alta" es el
// expediente (obligatorio en "Nueva alta"), NO idSial LIKE 'MANUAL-%' — ese
// matcheaba 913 cargos técnicos TEC-POF-* sin expediente que NO son altas. Se
// mockea Prisma para no tocar la BD.
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
  it('filtra por expediente no nulo/no vacío, estado vigente y subEstado IN (vacante, concurso)', async () => {
    await listNuevosCargosService(query())
    const where = cargo.findMany.mock.calls[0][0].where
    expect(where.expediente).toEqual({ not: null, notIn: [''] })
    expect(where.estado).toBe('vigente')
    expect(where.subEstado).toEqual({ in: ['vacante', 'concurso'] })
    // El discriminador ya NO es idSial MANUAL-% (lo ensuciaban los 913 TEC-POF).
    expect(where.idSial).toBeUndefined()
  })

  it('cuando viene subEstado=vacante acota a ese único sub-estado (dentro del universo)', async () => {
    await listNuevosCargosService(query({ subEstado: 'vacante' }))
    const where = cargo.findMany.mock.calls[0][0].where
    expect(where.subEstado).toEqual({ in: ['vacante'] })
    // El resto del criterio fijo se mantiene — un ocupado nunca entra porque
    // 'ocupado' no está en el universo permitido.
    expect(where.estado).toBe('vigente')
    expect(where.expediente).toEqual({ not: null, notIn: [''] })
  })

  it('ordena por expediente ASC (el "bloque"), desempate por createdAt', async () => {
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

describe('listNuevosCargosService — criterio de alta (expediente), aplicado al dataset', () => {
  // El filtro vive en la cláusula `where` que recibe Prisma; con Prisma mockeado
  // reproducimos ese `where` en un predicado JS para verificar, sobre un dataset
  // que imita la base real, qué filas entran y cuáles no.
  type Row = { id: string; estado: string; subEstado: string; expediente: string | null }

  const dataset: Row[] = [
    { id: 'alta-vacante', estado: 'vigente', subEstado: 'vacante', expediente: 'EX-2026-10' },
    { id: 'alta-concurso', estado: 'vigente', subEstado: 'concurso', expediente: 'EX-2026-11' },
    // Los 913 TEC-POF: vigente/vacante pero SIN expediente → fuera.
    { id: 'tec-pof-sin-exp', estado: 'vigente', subEstado: 'vacante', expediente: '' },
    { id: 'tec-pof-exp-null', estado: 'vigente', subEstado: 'vacante', expediente: null },
    // Alta real ya ocupada → fuera (se fue al designar).
    { id: 'alta-ocupado', estado: 'vigente', subEstado: 'ocupado', expediente: 'EX-2026-12' },
    // Alta real pero cargo no vigente → fuera.
    { id: 'alta-no-vigente', estado: 'no_vigente', subEstado: 'vacante', expediente: 'EX-2026-13' },
  ]

  // Traduce la cláusula `where` de Prisma a un predicado sobre Row.
  function matchWhere(where: Record<string, any>) {
    const subEstados: string[] = where.subEstado?.in ?? []
    return (r: Row) =>
      r.estado === where.estado &&
      subEstados.includes(r.subEstado) &&
      r.expediente !== null &&
      !(where.expediente?.notIn ?? []).includes(r.expediente)
  }

  it('deja solo las altas reales vigentes vacante/concurso CON expediente; excluye los TEC-POF sin expediente, los ocupados y los no vigentes', async () => {
    await listNuevosCargosService(query())
    const where = cargo.findMany.mock.calls[0][0].where
    const visibles = dataset.filter(matchWhere(where)).map((r) => r.id)
    expect(visibles).toEqual(['alta-vacante', 'alta-concurso'])
    // Explícito: ninguno de los espurios/descartados entra.
    expect(visibles).not.toContain('tec-pof-sin-exp')
    expect(visibles).not.toContain('tec-pof-exp-null')
    expect(visibles).not.toContain('alta-ocupado')
    expect(visibles).not.toContain('alta-no-vigente')
  })

  it('ordena por expediente ascendente dentro de los visibles', async () => {
    await listNuevosCargosService(query())
    const where = cargo.findMany.mock.calls[0][0].where
    const ordenados = dataset
      .filter(matchWhere(where))
      .sort((a, b) => (a.expediente ?? '').localeCompare(b.expediente ?? ''))
      .map((r) => r.expediente)
    expect(ordenados).toEqual(['EX-2026-10', 'EX-2026-11'])
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
