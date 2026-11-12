import { describe, it, expect, vi, beforeEach } from 'vitest'

// Paso 2b — createConcursoService: duplicado de concurso CEETPS abierto por cargo.
const cargo = { findUnique: vi.fn() }
const hospital = { findUnique: vi.fn() }
const concursoCeetps = { findFirst: vi.fn(), create: vi.fn() }
const concursoCph = { findFirst: vi.fn() }
const concurso = { create: vi.fn() }
const tx = { concurso, concursoCeetps, cargo: { findUnique: vi.fn(), update: vi.fn() } }
vi.mock('../shared/prisma.js', () => ({
  prisma: {
    cargo, hospital, concursoCeetps, concursoCph,
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  },
}))
vi.mock('../modules/notificaciones/notificarSgrasv.js', () => ({ notificarSgrasvYHijos: vi.fn() }))
vi.mock('../modules/notificaciones/notificaciones.service.js', () => ({ crearNotificacion: vi.fn() }))
vi.mock('../modules/cargos/subEstado.repo.js', () => ({ recalcularSubEstadoCargo: vi.fn() }))

const { createConcursoService } = await import('../modules/concursos/concursos.service.js')

const body = {
  tipoConcurso: 'ceetps', cargoId: 'cg1', hospitalId: 'h1', escalafonId: 'e1',
  motivoConcurso: 'nuevo_cargo', puestoSolicitado: 'Enfermero',
} as never

beforeEach(() => {
  vi.clearAllMocks()
  cargo.findUnique.mockResolvedValue({ id: 'cg1' })
  hospital.findUnique.mockResolvedValue({ id: 'h1' })
  concurso.create.mockResolvedValue({ id: 'c1' })
  concursoCeetps.create.mockResolvedValue({ id: 'ce1' })
})

describe('createConcursoService — duplicado CEETPS', () => {
  it('409 si ya hay un concurso CEETPS abierto para el cargo', async () => {
    concursoCeetps.findFirst.mockResolvedValue({ id: 'otro' })
    await expect(createConcursoService(body, 'u1')).rejects.toMatchObject({ statusCode: 409 })
    expect(concursoCeetps.findFirst).toHaveBeenCalledWith({
      where: { cargoId: 'cg1', estado: { notIn: ['finalizado', 'desierto'] } },
    })
    expect(concurso.create).not.toHaveBeenCalled()
  })

  it('permite crear si no hay abierto (finalizado/desierto no cuentan)', async () => {
    concursoCeetps.findFirst.mockResolvedValue(null)
    await createConcursoService(body, 'u1')
    expect(concursoCeetps.create).toHaveBeenCalled()
  })

  it('nuevo_cargo con puesto NO nace autorizado; otro motivo sí', async () => {
    concursoCeetps.findFirst.mockResolvedValue(null)
    await createConcursoService(body, 'u1')
    expect(concursoCeetps.create.mock.calls[0]![0].data.estado).toBeUndefined()
    await createConcursoService({ ...(body as object), motivoConcurso: 'alta_por_baja' } as never, 'u1')
    expect(concursoCeetps.create.mock.calls[1]![0].data.estado).toBe('autorizado')
  })

  it('CPH: no consulta concursoCeetps', async () => {
    concursoCph.findFirst.mockResolvedValue({ id: 'abierto' })
    await expect(createConcursoService({ ...(body as object), tipoConcurso: 'cph' } as never, 'u1'))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(concursoCeetps.findFirst).not.toHaveBeenCalled()
  })
})
