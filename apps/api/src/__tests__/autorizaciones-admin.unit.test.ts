import { describe, it, expect, vi, beforeEach } from 'vitest'

// =============================================================================
// Gobernanza admin — PIEZA A:
// El rol `admin` puede RESOLVER cualquier Autorizacion pendiente, sin importar
// a qué rol esté dirigida (resolverPorRolSlug). Un rol NO-admin solo puede
// resolver las dirigidas a su propio rol.
//
// Se mockea el cliente Prisma (patrón del repo, ver anular-baja.unit.test.ts):
// no se toca la base de datos.
// =============================================================================

const autorizacion = {
  findUnique: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}
const concursoCph = { findUnique: vi.fn(), update: vi.fn() }
const usuario = { findUnique: vi.fn() }
const role = { findMany: vi.fn() }
const notificacion = { findUnique: vi.fn(), create: vi.fn() }

const tx = { autorizacion, concursoCph, usuario, role, notificacion }

vi.mock('../shared/prisma.js', () => ({
  prisma: {
    autorizacion,
    concursoCph,
    usuario,
    role,
    notificacion,
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}))

// crearNotificacion y crearTareaPendiente son side-effects de otros módulos; se
// mockean para aislar la lógica de resolución.
vi.mock('../modules/notificaciones/notificaciones.service.js', () => ({
  crearNotificacion: vi.fn(async () => ({ id: 'notif' })),
}))
vi.mock('../modules/tareas/tareas.service.js', () => ({
  crearTareaPendiente: vi.fn(async () => ({ id: 'tarea' })),
  mensajeTareaRechazo: vi.fn(() => 'motivo'),
}))

const { aprobarAutorizacionService } = await import('../modules/autorizaciones/autorizaciones.service.js')
const { AppError } = await import('../shared/errors/AppError.js')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('aprobarAutorizacionService — gobernanza admin', () => {
  it('admin resuelve el paso dirigido a director (concurso_cph) y encadena a sgrasv', async () => {
    autorizacion.findUnique.mockResolvedValue({
      id: 'a1', tipo: 'concurso_cph', estado: 'pendiente',
      referenciaId: 'cph1', resolverPorRolSlug: 'director', solicitadoPorId: null,
    })
    concursoCph.findUnique.mockResolvedValue({ id: 'cph1', aprobadoDirector: false })
    // resolverSlugPorPermiso: un único rol con el permiso resolver_sgrasv
    role.findMany.mockResolvedValue([{ slug: 'sgrasv_5ac494e' }])
    autorizacion.update.mockResolvedValue({ id: 'a1', estado: 'aprobada' })
    autorizacion.create.mockResolvedValue({ id: 'a2' })

    await aprobarAutorizacionService('a1', 'uAdmin', 'admin')

    // Marca aprobadoDirector (paso director) y crea la 2ª autorización (sgrasv)
    expect(concursoCph.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ aprobadoDirector: true }) }),
    )
    expect(autorizacion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ resolverPorRolSlug: 'sgrasv_5ac494e' }) }),
    )
  })

  it('admin resuelve el 2º paso (dirigido a sgrasv) y cierra el flujo', async () => {
    autorizacion.findUnique.mockResolvedValue({
      id: 'a2', tipo: 'concurso_cph', estado: 'pendiente',
      referenciaId: 'cph1', resolverPorRolSlug: 'sgrasv_5ac494e', solicitadoPorId: null,
    })
    concursoCph.findUnique.mockResolvedValue({ id: 'cph1', aprobadoDirector: true })
    autorizacion.update.mockResolvedValue({ id: 'a2', estado: 'aprobada' })

    await aprobarAutorizacionService('a2', 'uAdmin', 'admin')

    // Paso sgrasv: cierra el flujo (pendienteAutorizacion false), NO crea otra autorización
    expect(concursoCph.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ pendienteAutorizacion: false }) }),
    )
    expect(autorizacion.create).not.toHaveBeenCalled()
  })

  it('un NO-admin NO puede resolver una autorización dirigida a otro rol → forbidden 403', async () => {
    autorizacion.findUnique.mockResolvedValue({
      id: 'a3', tipo: 'concurso_cph', estado: 'pendiente',
      referenciaId: 'cph1', resolverPorRolSlug: 'director', solicitadoPorId: null,
    })

    // El usuario es sgrasv, la autorización es para director → rechazo
    await expect(aprobarAutorizacionService('a3', 'uX', 'sgrasv_5ac494e'))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(autorizacion.update).not.toHaveBeenCalled()
    void AppError
  })
})
