import { describe, it, expect, vi, beforeEach } from 'vitest'
// =============================================================================
// Paso 2a — aprobar SGRASV setea concursos.autorizado_at y recalcula el cargo en
// la MISMA transacción (tx simulada); el paso del director no lo setea; una 2ª
// aprobación no lo sobrescribe; rechazar concurso_cph exige observación.
// =============================================================================
const autorizacion = { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() }
const concursoCph = { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn(async () => 1) }
const rolePermiso = { findFirst: vi.fn() }
const concurso = { findUnique: vi.fn(), updateMany: vi.fn() }
const cargo = { findUnique: vi.fn(), update: vi.fn() }
const ocupacion = { count: vi.fn() }
const usuario = { findUnique: vi.fn() }
const role = { findMany: vi.fn() }
const solicitudAlta = { update: vi.fn() }
const tx = { autorizacion, concursoCph, concurso, cargo, ocupacion, usuario, role, solicitudAlta, rolePermiso,
  concursoCeetps: { count: vi.fn(async () => 0) } }
vi.mock('../shared/prisma.js', () => ({
  prisma: {
    autorizacion, concursoCph, usuario, role,
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  },
}))
vi.mock('../modules/notificaciones/notificaciones.service.js', () => ({
  crearNotificacion: vi.fn(async () => ({ id: 'notif' })),
}))
vi.mock('../modules/tareas/tareas.service.js', () => ({
  crearTareaPendiente: vi.fn(async () => ({ id: 'tarea' })),
  mensajeTareaRechazo: vi.fn(() => 'motivo'),
}))
const { aprobarAutorizacionService, rechazarAutorizacionService, marcarConcursoAutorizado, usuarioPuedeResolverSgrasv, autoAprobarConcurso } =
  await import('../modules/autorizaciones/autorizaciones.service.js')

const autSgrasv = {
  id: 'a2', tipo: 'concurso_cph', estado: 'pendiente', referenciaId: 'cph1',
  resolverPorRolSlug: 'sgrasv_5ac494e', solicitadoPorId: null,
}
const autDirector = { ...autSgrasv, id: 'a1', resolverPorRolSlug: 'director' }

beforeEach(() => {
  vi.clearAllMocks()
  autorizacion.findUnique.mockResolvedValue(autSgrasv)
  autorizacion.update.mockResolvedValue({ id: 'x' })
  autorizacion.create.mockResolvedValue({ id: 'a3' })
  concursoCph.findUnique.mockResolvedValue({ id: 'cph1', concursoId: 'c1', eeConcurso: 'EE-1' })
  concursoCph.updateMany.mockResolvedValue({ count: 1 })
  concurso.updateMany.mockResolvedValue({ count: 1 })
  cargo.findUnique.mockResolvedValue({ estado: 'vigente' })
  ocupacion.count.mockResolvedValue(0)
})

describe('aprobar SGRASV — nuevo_cargo', () => {
  it('setea autorizado_at y recalcula el cargo a "concurso" en la misma tx', async () => {
    concurso.findUnique.mockResolvedValue({ cargoId: 'cg1', motivoConcurso: 'nuevo_cargo', autorizadoAt: null })
    await aprobarAutorizacionService('a2', 'u1', 'sgrasv_5ac494e')
    expect(concurso.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', autorizadoAt: null },
      data: { autorizadoAt: expect.any(Date) },
    })
    expect(cargo.update).toHaveBeenCalledWith({
      where: { id: 'cg1' },
      data: { subEstado: 'concurso' },
    })
  })

  it('no sobrescribe un autorizado_at existente (autorización estructural posterior)', async () => {
    concurso.findUnique.mockResolvedValue({ cargoId: 'cg1', motivoConcurso: 'nuevo_cargo', autorizadoAt: new Date('2026-01-01') })
    await aprobarAutorizacionService('a2', 'u1', 'sgrasv_5ac494e')
    expect(concurso.updateMany).not.toHaveBeenCalled()
    expect(cargo.update).not.toHaveBeenCalled()
  })

  it('segunda aprobación concurrente (count 0) no recalcula ni re-fecha', async () => {
    concurso.findUnique.mockResolvedValue({ cargoId: 'cg1', motivoConcurso: 'nuevo_cargo', autorizadoAt: null })
    concurso.updateMany.mockResolvedValue({ count: 0 })
    expect(await marcarConcursoAutorizado(tx as never, 'c1')).toBe(false)
    expect(cargo.update).not.toHaveBeenCalled()
  })

  it('concurso existente (no nuevo_cargo): no toca autorizado_at ni el cargo', async () => {
    concurso.findUnique.mockResolvedValue({ cargoId: 'cg1', motivoConcurso: null, autorizadoAt: null })
    await aprobarAutorizacionService('a2', 'u1', 'sgrasv_5ac494e')
    expect(concurso.updateMany).not.toHaveBeenCalled()
    expect(cargo.update).not.toHaveBeenCalled()
  })
})

describe('aprobar paso director', () => {
  it('no setea autorizado_at (solo encadena a SGRASV)', async () => {
    autorizacion.findUnique.mockResolvedValue(autDirector)
    role.findMany.mockResolvedValue([{ slug: 'sgrasv_5ac494e' }])
    concurso.findUnique.mockResolvedValue({ cargoId: 'cg1', motivoConcurso: 'nuevo_cargo', autorizadoAt: null })
    await aprobarAutorizacionService('a1', 'u1', 'director')
    expect(concurso.updateMany).not.toHaveBeenCalled()
    expect(cargo.update).not.toHaveBeenCalled()
    expect(autorizacion.create).toHaveBeenCalled()
  })
})

describe('rechazar — observación obligatoria para concurso_cph', () => {
  beforeEach(() => {
    concursoCph.update.mockResolvedValue({})
    usuario.findUnique.mockResolvedValue(null)
  })

  it.each([undefined, '', '   '])('concurso_cph sin observación (%j) → error 400', async (obs) => {
    autorizacion.findUnique.mockResolvedValue(autSgrasv)
    await expect(rechazarAutorizacionService('a2', 'u1', 'sgrasv_5ac494e', obs as string | undefined)).rejects.toMatchObject({ statusCode: 400 })
    expect(autorizacion.update).not.toHaveBeenCalled()
  })

  it('concurso_cph con observación → ok y guarda el motivo recortado', async () => {
    autorizacion.findUnique.mockResolvedValue(autSgrasv)
    await rechazarAutorizacionService('a2', 'u1', 'sgrasv_5ac494e', '  Falta el IF  ')
    expect(autorizacion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'rechazada', observaciones: 'Falta el IF' }) }),
    )
  })

  it('alta_cargo sin observación sigue funcionando', async () => {
    autorizacion.findUnique.mockResolvedValue({ ...autSgrasv, tipo: 'alta_cargo', resolverPorRolSlug: 'director' })
    solicitudAlta.update.mockResolvedValue({})
    await rechazarAutorizacionService('a2', 'u1', 'director')
    expect(solicitudAlta.update).toHaveBeenCalled()
  })
})

describe('Paso 2b — aprobación SGRASV de nuevo_cargo', () => {
  it('completa fechaAutorizacion (solo si vacía) y recalcula el sub-estado a b-sorteo jur', async () => {
    concurso.findUnique.mockResolvedValue({ cargoId: 'cg1', motivoConcurso: 'nuevo_cargo', autorizadoAt: null })
    await aprobarAutorizacionService('a2', 'u1', 'sgrasv_5ac494e')
    expect(concursoCph.updateMany).toHaveBeenCalledWith({
      where: { id: 'cph1', fechaAutorizacion: null },
      data: { fechaAutorizacion: expect.any(Date) },
    })
    expect(concursoCph.update).toHaveBeenLastCalledWith({
      where: { id: 'cph1' },
      data: expect.objectContaining({ subEstado: 'b-sorteo jur' }),
    })
  })

  it('concurso no nuevo_cargo: no completa fecha ni recalcula', async () => {
    concurso.findUnique.mockResolvedValue({ cargoId: 'cg1', motivoConcurso: null, autorizadoAt: null })
    await aprobarAutorizacionService('a2', 'u1', 'sgrasv_5ac494e')
    expect(concursoCph.updateMany).not.toHaveBeenCalled()
    expect(concursoCph.update).toHaveBeenCalledTimes(1) // solo la limpieza de flags
  })

  it('rechazo de nuevo_cargo sin autorizar vuelve a a-caratulado', async () => {
    concurso.findUnique.mockResolvedValue({ cargoId: 'cg1', motivoConcurso: 'nuevo_cargo', autorizadoAt: null })
    concursoCph.update.mockResolvedValue({})
    usuario.findUnique.mockResolvedValue(null)
    await rechazarAutorizacionService('a2', 'u1', 'sgrasv_5ac494e', 'Falta el IF')
    expect(concursoCph.update).toHaveBeenLastCalledWith({
      where: { id: 'cph1' },
      data: expect.objectContaining({ subEstado: 'a-caratulado' }),
    })
  })

  it('rechazo de concurso no nuevo_cargo no recalcula', async () => {
    concurso.findUnique.mockResolvedValue({ motivoConcurso: null, autorizadoAt: null })
    concursoCph.update.mockResolvedValue({})
    usuario.findUnique.mockResolvedValue(null)
    await rechazarAutorizacionService('a2', 'u1', 'sgrasv_5ac494e', 'x')
    expect(concursoCph.update).toHaveBeenCalledTimes(1)
  })
})

describe('Paso 2b — usuarioPuedeResolverSgrasv / autoAprobarConcurso', () => {
  it('admin puede; rol con permiso puede; rol sin permiso no; sin usuario no', async () => {
    usuario.findUnique.mockResolvedValueOnce({ role: { id: 'r0', slug: 'admin' } })
    expect(await usuarioPuedeResolverSgrasv(tx as never, 'u')).toBe(true)
    usuario.findUnique.mockResolvedValueOnce({ role: { id: 'r1', slug: 'x' } })
    rolePermiso.findFirst.mockResolvedValueOnce({ roleId: 'r1' })
    expect(await usuarioPuedeResolverSgrasv(tx as never, 'u')).toBe(true)
    expect(rolePermiso.findFirst).toHaveBeenCalledWith({
      where: { roleId: 'r1', permiso: { modulo: 'autorizaciones', accion: 'resolver_sgrasv' } },
    })
    usuario.findUnique.mockResolvedValueOnce({ role: { id: 'r2', slug: 'y' } })
    rolePermiso.findFirst.mockResolvedValueOnce(null)
    expect(await usuarioPuedeResolverSgrasv(tx as never, 'u')).toBe(false)
    usuario.findUnique.mockResolvedValueOnce(null)
    expect(await usuarioPuedeResolverSgrasv(tx as never, 'u')).toBe(false)
  })

  it('autoAprobarConcurso deja Autorizacion aprobada con traza, autorizado_at y b-sorteo jur', async () => {
    usuario.findUnique.mockResolvedValue({ role: { slug: 'concursales' } })
    concurso.findUnique.mockResolvedValue({ cargoId: 'cg1', motivoConcurso: 'nuevo_cargo', autorizadoAt: null })
    await autoAprobarConcurso(tx as never, { tipo: 'concurso_cph', referenciaId: 'cph1', concursoId: 'c1', usuarioId: 'u9' })
    expect(autorizacion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: 'concurso_cph', referenciaId: 'cph1', estado: 'aprobada',
        solicitadoPorId: 'u9', resueltoPorId: 'u9', resolverPorRolSlug: 'concursales',
      }),
    })
    expect(concurso.updateMany).toHaveBeenCalledWith({ where: { id: 'c1', autorizadoAt: null }, data: { autorizadoAt: expect.any(Date) } })
    expect(concursoCph.updateMany).toHaveBeenCalledWith({ where: { id: 'cph1', fechaAutorizacion: null }, data: { fechaAutorizacion: expect.any(Date) } })
    expect(concursoCph.update).toHaveBeenLastCalledWith({
      where: { id: 'cph1' },
      data: expect.objectContaining({ subEstado: 'b-sorteo jur' }),
    })
  })
})
