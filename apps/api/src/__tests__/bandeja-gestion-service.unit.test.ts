import { describe, it, expect, vi, beforeEach } from 'vitest'

// =============================================================================
// PASO 1b (flujo concursos) — tests del SERVICIO listBandejaGestionService que
// alimenta la tabla COMPLETA mixta de /cargos/concurso. Cubren el contrato del
// filtro de estado contra CEETPS (el enum CPH no_iniciado/activo/suspendido NO
// existe en EstadoConcursoCeetps: solo 'finalizado' solapa) y la exclusión de
// filas CEETPS cuando hay un filtro CPH-only activo. Se mockea Prisma y el
// servicio CPH para no tocar la BD.
// =============================================================================

const concursoCeetps = { findMany: vi.fn() }

vi.mock('../shared/prisma.js', () => ({
  prisma: { concursoCeetps },
}))

// El servicio CPH se mockea: devuelve una página vacía con meta para no
// iterar. Así aislamos la rama CEETPS (lo que estamos probando).
const listConcursosCphService = vi.fn()
vi.mock('../modules/concursos-cph/concursos-cph.service.js', () => ({
  listConcursosCphService: (q: unknown) => listConcursosCphService(q),
}))

const { listBandejaGestionService } = await import(
  '../modules/concursos/bandeja-gestion.service.js'
)

beforeEach(() => {
  vi.clearAllMocks()
  listConcursosCphService.mockResolvedValue({
    data: [],
    meta: { total: 0, page: 1, limit: 200, pages: 0 },
  })
  concursoCeetps.findMany.mockResolvedValue([])
})

// Query mínima con los defaults que el schema ya habría aplicado.
function query(overrides: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- query parcial de test
  return { page: 1, limit: 50, ordenarPor: 'fecha_ee_concurso', orden: 'desc', ...overrides } as any
}

describe('listBandejaGestionService — filtro de estado contra CEETPS', () => {
  it('NO consulta CEETPS con un estado CPH-only (no_iniciado) — evita el error de Prisma', async () => {
    await listBandejaGestionService(query({ estado: 'no_iniciado' }))
    // El estado no_iniciado no es miembro de EstadoConcursoCeetps: reenviarlo a
    // prisma.concursoCeetps.findMany dispararía PrismaClientValidationError.
    // El servicio debe NO llamar a findMany (retorna [] sin consultar).
    expect(concursoCeetps.findMany).not.toHaveBeenCalled()
  })

  it('NO consulta CEETPS con estado activo ni suspendido', async () => {
    await listBandejaGestionService(query({ estado: 'activo' }))
    await listBandejaGestionService(query({ estado: 'suspendido' }))
    expect(concursoCeetps.findMany).not.toHaveBeenCalled()
  })

  it('SÍ consulta CEETPS con estado finalizado (único que solapa ambos enums)', async () => {
    await listBandejaGestionService(query({ estado: 'finalizado' }))
    expect(concursoCeetps.findMany).toHaveBeenCalledTimes(1)
    const arg = concursoCeetps.findMany.mock.calls[0][0]
    expect(arg.where.estado).toBe('finalizado')
  })

  it('en modo tipo=ceetps con estado CPH-only devuelve vacío sin romper', async () => {
    const res = await listBandejaGestionService(query({ tipo: 'ceetps', estado: 'activo' }))
    expect(concursoCeetps.findMany).not.toHaveBeenCalled()
    expect(res.data).toEqual([])
    expect(res.meta.total).toBe(0)
  })
})

describe('listBandejaGestionService — filtros CPH-only excluyen CEETPS en modo mixto', () => {
  it('con filtro de etapa activo NO consulta CEETPS (no pueden matchear)', async () => {
    await listBandejaGestionService(query({ etapa: 3 }))
    expect(listConcursosCphService).toHaveBeenCalled()
    expect(concursoCeetps.findMany).not.toHaveBeenCalled()
  })

  it('con filtro de origen (respaldatoria) activo NO consulta CEETPS', async () => {
    await listBandejaGestionService(query({ origen: 'baja' }))
    expect(concursoCeetps.findMany).not.toHaveBeenCalled()
  })

  it('sin filtros CPH-only SÍ consulta CEETPS en modo mixto', async () => {
    await listBandejaGestionService(query())
    expect(concursoCeetps.findMany).toHaveBeenCalledTimes(1)
  })
})
