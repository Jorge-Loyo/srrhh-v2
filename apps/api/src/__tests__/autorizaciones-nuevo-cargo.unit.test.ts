import { describe, it, expect, vi, beforeEach } from 'vitest'
// =============================================================================
// Paso 2a — aprobar SGRASV setea concursos.autorizado_at y recalcula el cargo en
// la MISMA transacción (tx simulada); el paso del director no lo setea; una 2ª
// aprobación no lo sobrescribe; rechazar concurso_cph exige observación.
// =============================================================================
const autorizacion = { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() }
const concursoCph = { findUnique: vi.fn(), update: vi.fn(), count: vi.fn(async () => 1) }
const concurso = { findUnique: vi.fn(), updateMany: vi.fn() }
const cargo = { findUnique: vi.fn(), update: vi.fn() }
const ocupacion = { count: vi.fn() }
const usuario = { findUnique: vi.fn() }
const role = { findMany: vi.fn() }
const solicitudAlta = { update: vi.fn() }
const tx = { autorizacion, concursoCph, concurso, cargo, ocupacion, usuario, role, solicitudAlta,
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
const { aprobarAutorizacionService, rechazarAutorizacionService, marcarConcursoAutorizado } =
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
  concursoCph.findUnique.mockResolvedValue({ id: 'cph1', concursoId: 'c1' })
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
