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
  it('con filtro de etapa en modo mixto SÍ consulta CEETPS con su propio where de etapa', async () => {
    await listBandejaGestionService(query({ etapa: 3 }))
    expect(listConcursosCphService).toHaveBeenCalled()
    expect(JSON.stringify(concursoCeetps.findMany.mock.calls[0][0].where)).toContain('DISPO_LLAMADO')
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

describe('listBandejaGestionService — búsqueda en CEETPS', () => {
  it('busca también por código de cargo, persona y hospital (como CPH)', async () => {
    await listBandejaGestionService(query({ tipo: 'ceetps', search: 'TEC-POF-004408' }))
    const where = JSON.stringify(concursoCeetps.findMany.mock.calls[0][0].where)
    expect(where).toContain('"codigo":{"contains":"TEC-POF-004408"')
    expect(where).toContain('apellidoNombre')
  })
})

describe('listBandejaGestionService — etapa en CEETPS', () => {
  it('tipo ceetps + etapa 2 consulta CEETPS con el where de etapa y marca la etapa en las filas', async () => {
    concursoCeetps.findMany.mockResolvedValue([
      {
        id: 'c1', concursoId: 'k1', cargoId: 'g1', hospitalId: 'h1', estado: 'autorizado', subEstado: null,
        puestoSolicitado: null, puestoCargoSolicitadoId: null, expedienteConcurso: null,
        fechaAutorizacion: null, fechaIfacs: null, fechaInsal: null, expedienteDesignacion: null,
        resolucionDesignacion: null, codigoSial: null, cantidadCargos: 1, personaDesignadaId: null,
        cambioEspecialidad: false, observaciones: null, createdAt: new Date(), updatedAt: new Date(),
        concurso: null, hospital: null, etiquetas: [],
      },
    ])
    const res = await listBandejaGestionService(query({ tipo: 'ceetps', etapa: 2 }))
    const where = concursoCeetps.findMany.mock.calls[0][0].where
    expect(where).toEqual({ AND: [{ estado: 'autorizado' }], estado: { not: 'sin_autorizar' } })
    expect((res.data[0] as { etapa: number }).etapa).toBe(2)
  })

  it('tipo ceetps respeta el estado pedido (no lo descarta) y excluye sin_autorizar', async () => {
    concursoCeetps.findMany.mockResolvedValue([])
    await listBandejaGestionService(query({ tipo: 'ceetps', estado: 'finalizado' }))
    const where = concursoCeetps.findMany.mock.calls[0][0].where
    expect(where.estado).toBe('finalizado')
  })

  it('un estado solo de CEETPS (autorizado) no se le pasa a CPH: ni tipo=cph ni el modo mixto lo consultan', async () => {
    const res = await listBandejaGestionService(query({ tipo: 'cph', estado: 'autorizado' as never }))
    expect(listConcursosCphService).not.toHaveBeenCalled()
    expect(res.data).toEqual([])

    await listBandejaGestionService(query({ estado: 'autorizado' as never }))
    expect(listConcursosCphService).not.toHaveBeenCalled()
    expect(concursoCeetps.findMany.mock.calls.at(-1)?.[0].where.estado).toBe('autorizado')
  })

  it('tipo ceetps con estado sin_autorizar devuelve vacío: esa vista nunca muestra la etapa 1', async () => {
    const res = await listBandejaGestionService(query({ tipo: 'ceetps', estado: 'sin_autorizar' }))
    expect(concursoCeetps.findMany).not.toHaveBeenCalled()
    expect(res.data).toEqual([])
  })
})
