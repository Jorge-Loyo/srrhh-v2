import { describe, it, expect, vi, beforeEach } from 'vitest'
// Admin = derecho de director (y de cualquier resolutor): ve todas las
// pendientes y puede rechazar altas/bajas dirigidas a otros roles.
const autorizacion = { findUnique: vi.fn(), update: vi.fn(), count: vi.fn(), findMany: vi.fn() }
const solicitudAlta = { update: vi.fn() }
const baja = { update: vi.fn(), findUnique: vi.fn() }
const usuario = { findUnique: vi.fn() }
const tx = { autorizacion, solicitudAlta, baja, usuario }
vi.mock('../shared/prisma.js', () => ({
  prisma: {
    autorizacion,
    solicitudAlta,
    baja,
    usuario,
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}))
vi.mock('../modules/notificaciones/notificaciones.service.js', () => ({
  crearNotificacion: vi.fn(async () => ({ id: 'n' })),
}))
vi.mock('../modules/tareas/tareas.service.js', () => ({
  crearTareaPendiente: vi.fn(),
  mensajeTareaRechazo: vi.fn(() => 'motivo'),
}))

const svc = await import('../modules/autorizaciones/autorizaciones.service.js')

beforeEach(() => {
  vi.clearAllMocks()
  autorizacion.count.mockResolvedValue(0)
  autorizacion.findMany.mockResolvedValue([])
  usuario.findUnique.mockResolvedValue(null)
})

describe('listado / contador de pendientes', () => {
  it('admin no filtra por resolverPorRolSlug', async () => {
    await svc.listAutorizacionesService('admin', { page: 1, limit: 20 } as never)
    const where = autorizacion.findMany.mock.calls[0]![0].where
    expect(where).toEqual({ estado: 'pendiente' })
    await svc.countPendientesService('admin')
    expect(autorizacion.count.mock.calls.at(-1)![0].where).toEqual({ estado: 'pendiente' })
  })

  it('no-admin sigue filtrando por su propio rol', async () => {
    await svc.listAutorizacionesService('director', { page: 1, limit: 20 } as never)
    expect(autorizacion.findMany.mock.calls[0]![0].where).toMatchObject({
      resolverPorRolSlug: 'director',
      estado: 'pendiente',
    })
    await svc.countPendientesService('sgrasv_x')
    expect(autorizacion.count.mock.calls.at(-1)![0].where).toEqual({
      resolverPorRolSlug: 'sgrasv_x',
      estado: 'pendiente',
    })
  })
})

describe('rechazar — gate por rol', () => {
  const base = { estado: 'pendiente', referenciaId: 'r1', resolverPorRolSlug: 'director', solicitadoPorId: null }

  it('admin rechaza alta_cargo dirigida a director', async () => {
    autorizacion.findUnique.mockResolvedValue({ id: 'a1', tipo: 'alta_cargo', ...base })
    autorizacion.update.mockResolvedValue({ id: 'a1', estado: 'rechazada' })
    await svc.rechazarAutorizacionService('a1', 'uAdmin', 'admin', 'no')
    expect(solicitudAlta.update).toHaveBeenCalled()
    expect(autorizacion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ resueltoPorId: 'uAdmin' }) }),
    )
  })

  it('admin rechaza baja_cargo dirigida a director', async () => {
    autorizacion.findUnique.mockResolvedValue({ id: 'a2', tipo: 'baja_cargo', ...base })
    autorizacion.update.mockResolvedValue({ id: 'a2' })
    baja.findUnique.mockResolvedValue(null)
    await svc.rechazarAutorizacionService('a2', 'uAdmin', 'admin')
    expect(baja.update).toHaveBeenCalled()
  })

  it('un rol sin relación (sgrasv/viewer) no resuelve un alta del director', async () => {
    autorizacion.findUnique.mockResolvedValue({ id: 'a1', tipo: 'alta_cargo', ...base })
    await expect(svc.rechazarAutorizacionService('a1', 'u2', 'sgrasv_x', 'no')).rejects.toMatchObject({ statusCode: 403 })
    await expect(svc.aprobarAutorizacionService('a1', 'u3', 'viewer')).rejects.toMatchObject({ statusCode: 403 })
    expect(solicitudAlta.update).not.toHaveBeenCalled()
  })
})
