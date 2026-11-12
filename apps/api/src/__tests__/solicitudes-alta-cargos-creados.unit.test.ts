import { describe, it, expect, vi, beforeEach } from 'vitest'

// GET / y GET /:id suman `cargosCreados` con UNA sola consulta de cargos (sin N+1).
const solicitudAlta = { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() }
const cargo = { findMany: vi.fn() }
vi.mock('../shared/prisma.js', () => ({ prisma: { solicitudAlta, cargo } }))

const { adjuntarCargosCreados, listSolicitudesAltaService, getSolicitudAltaService } =
  await import('../modules/solicitudes-alta/solicitudes-alta.service.js')

const cargoRow = (id: string, codigo: string) => ({
  id, codigo, idSial: null, fechaDesde: null, literalPuesto: 'x', especialidadLegacy: null,
  hospital: { id: 'h', sigla: 'HZ' }, escalafon: { codigo: '87', nombre: 'Enfermería' },
  puestoCargo: { nombre: 'Enfermero Profesional' }, especialidadPuesto: null, codigoRegistro: { codigo: '87' },
  concursos: [{ tipoConcurso: 'cph', concursoCph: { id: 'cc' }, concursoCeetps: null }],
})

describe('adjuntarCargosCreados', () => {
  beforeEach(() => cargo.findMany.mockReset())

  it('una sola consulta para todas las solicitudes, respetando el orden de ids', async () => {
    cargo.findMany.mockResolvedValue([cargoRow('c2', 'ENF-2'), cargoRow('c1', 'ENF-1'), cargoRow('c3', 'ENF-3')])
    const res = await adjuntarCargosCreados([
      { id: 's1', cargosCreadosIds: ['c1', 'c2'] },
      { id: 's2', cargosCreadosIds: ['c3', 'c1'] },
      { id: 's3', cargosCreadosIds: [] },
    ])
    expect(cargo.findMany).toHaveBeenCalledTimes(1)
    expect(cargo.findMany.mock.calls[0][0].where.id.in.sort()).toEqual(['c1', 'c2', 'c3'])
    expect(res[0]!.cargosCreados.map((c) => c.codigo)).toEqual(['ENF-1', 'ENF-2'])
    expect(res[1]!.cargosCreados.map((c) => c.codigo)).toEqual(['ENF-3', 'ENF-1'])
    expect(res[2]!.cargosCreados).toEqual([])
    expect(res[0]!.cargosCreados[0]).toMatchObject({
      carreraCodigo: '87', puesto: 'Enfermero Profesional', concurso: { tipo: 'cph', detalleId: 'cc' },
    })
  })

  it('sin ids no consulta cargos', async () => {
    const res = await adjuntarCargosCreados([{ id: 's1', cargosCreadosIds: [] }])
    expect(cargo.findMany).not.toHaveBeenCalled()
    expect(res[0]!.cargosCreados).toEqual([])
  })

  it('omite ids de cargos inexistentes', async () => {
    cargo.findMany.mockResolvedValue([cargoRow('c1', 'ENF-1')])
    const res = await adjuntarCargosCreados([{ id: 's1', cargosCreadosIds: ['c1', 'zz'] }])
    expect(res[0]!.cargosCreados).toHaveLength(1)
  })
})

describe('servicios de listado/detalle', () => {
  it('listado conserva meta y suma cargosCreados', async () => {
    solicitudAlta.count.mockResolvedValue(1)
    solicitudAlta.findMany.mockResolvedValue([{ id: 's1', cargosCreadosIds: ['c1'] }])
    cargo.findMany.mockReset().mockResolvedValue([cargoRow('c1', 'ENF-1')])
    const res = await listSolicitudesAltaService({ page: 1, limit: 100 } as never)
    expect(res.meta.total).toBe(1)
    expect((res.data[0] as { cargosCreados: unknown[] }).cargosCreados).toHaveLength(1)
  })
  it('detalle suma cargosCreados', async () => {
    solicitudAlta.findUnique.mockResolvedValue({ id: 's1', cargosCreadosIds: ['c1'] })
    cargo.findMany.mockReset().mockResolvedValue([cargoRow('c1', 'ENF-1')])
    const res = await getSolicitudAltaService('s1')
    expect(res.cargosCreados[0]!.codigo).toBe('ENF-1')
  })
})
