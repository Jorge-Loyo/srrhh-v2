import { describe, it, expect, vi, beforeEach } from 'vitest'
// =============================================================================
// Paso 5a — los listados /concursos/cph y /concursos/ceetps solo muestran los
// concursos que ya pasaron la Etapa 1. Los nuevo_cargo sin autorizar quedan
// afuera (siguen en Nuevos cargos y en la bandeja Gestión, que no se filtra).
// =============================================================================
const concursoCph = { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) }
const concursoCeetps = { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) }
vi.mock('../shared/prisma.js', () => ({ prisma: { concursoCph, concursoCeetps, $queryRaw: vi.fn(async () => []) } }))
vi.mock('../modules/autorizaciones/autorizaciones.service.js', () => ({
  usuarioPuedeResolverSgrasv: vi.fn(), autoAprobarConcurso: vi.fn(), crearAutorizacion: vi.fn(), resolverSlugPorPermiso: vi.fn(),
}))
vi.mock('../modules/notificaciones/notificaciones.service.js', () => ({ crearNotificacion: vi.fn() }))
vi.mock('../modules/notificaciones/notificarSgrasv.js', () => ({ notificarSgrasvYHijos: vi.fn() }))
vi.mock('../modules/tareas/tareas.service.js', () => ({ cerrarTareasDeConcurso: vi.fn() }))

const { excluirNuevoCargoSinAutorizar } = await import('../modules/concursos-cph/autorizacionNuevoCargo.js')
const { listConcursosCphService } = await import('../modules/concursos-cph/concursos-cph.service.js')
const { listConcursosCeetpsService } = await import('../modules/concursos-ceetps/concursos-ceetps.service.js')
const { concursosCphQuerySchema } = await import('../modules/concursos-cph/concursos-cph.schema.js')
const { concursosCeetpsQuerySchema } = await import('../modules/concursos-ceetps/concursos-ceetps.schema.js')

/** Evalúa el filtro NOT{concurso:{is:{motivoConcurso, autorizadoAt:null}}} contra una fila. */
function pasaFiltro(c: { motivoConcurso: string | null; autorizadoAt: Date | null }): boolean {
  const is = excluirNuevoCargoSinAutorizar().NOT.concurso.is
  const coincide = c.motivoConcurso === is.motivoConcurso && c.autorizadoAt === is.autorizadoAt
  return !coincide
}

beforeEach(() => vi.clearAllMocks())

describe('excluirNuevoCargoSinAutorizar', () => {
  it('excluye solo nuevo_cargo sin autorizar; incluye autorizados, existentes y motivo NULL', () => {
    expect(pasaFiltro({ motivoConcurso: 'nuevo_cargo', autorizadoAt: null })).toBe(false)
    expect(pasaFiltro({ motivoConcurso: 'nuevo_cargo', autorizadoAt: new Date() })).toBe(true)
    expect(pasaFiltro({ motivoConcurso: 'alta_por_baja', autorizadoAt: null })).toBe(true)
    expect(pasaFiltro({ motivoConcurso: null, autorizadoAt: null })).toBe(true)
  })
})

describe('listado CPH (/concursos/cph)', () => {
  const q = (o: object = {}) => concursosCphQuerySchema.parse(o)
  it('con soloEtapa1Superada aplica el filtro en count y findMany (totales coherentes)', async () => {
    await listConcursosCphService(q(), { soloEtapa1Superada: true })
    const filtro = excluirNuevoCargoSinAutorizar()
    expect(concursoCph.count.mock.calls[0]![0].where.AND).toContainEqual(filtro)
    expect(concursoCph.findMany.mock.calls[0]![0].where.AND).toContainEqual(filtro)
  })
  it('conserva el AND de la etapa y los demás filtros', async () => {
    await listConcursosCphService(q({ etapa: 2 }), { soloEtapa1Superada: true })
    const and = concursoCph.count.mock.calls[0]![0].where.AND
    expect(and).toHaveLength(2)
    expect(and).toContainEqual(excluirNuevoCargoSinAutorizar())
  })
  it('sin la opción (bandeja Gestión de Concursos) NO filtra nada', async () => {
    await listConcursosCphService(q())
    expect(concursoCph.count.mock.calls[0]![0].where.AND).toBeUndefined()
    await listConcursosCphService(q({ etapa: 2 }))
    expect(concursoCph.count.mock.calls[1]![0].where.AND).toHaveLength(1)
  })
  it('búsqueda directa por cargoId no se filtra', async () => {
    await listConcursosCphService(q({ cargoId: '11111111-1111-4111-8111-111111111111' }), { soloEtapa1Superada: true })
    expect(concursoCph.count.mock.calls[0]![0].where.AND).toBeUndefined()
  })
})

describe('listado CEETPS (/concursos/ceetps)', () => {
  it('aplica el filtro en count y findMany junto con los demás filtros', async () => {
    await listConcursosCeetpsService(concursosCeetpsQuerySchema.parse({ search: 'x' }))
    const filtro = excluirNuevoCargoSinAutorizar()
    for (const fn of [concursoCeetps.count, concursoCeetps.findMany]) {
      const where = fn.mock.calls[0]![0].where
      expect(where.AND).toEqual([filtro])
      expect(where.OR).toBeDefined()
    }
  })
})
