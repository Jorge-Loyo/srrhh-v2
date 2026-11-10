import { describe, it, expect, vi, beforeEach } from 'vitest'

// =============================================================================
// Paso 2b — autorización SGRASV en concursos CEETPS de cargo nuevo.
// Lógica pura + patch/get/designar + aprobar/rechazar con prisma simulado.
// =============================================================================
const concursoCeetps = {
  findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
  count: vi.fn(async () => 1),
}
const concursoCph = { count: vi.fn(async () => 0) }
const autorizacion = { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() }
const concurso = { findUnique: vi.fn(), updateMany: vi.fn() }
const usuario = { findUnique: vi.fn() }
const role = { findMany: vi.fn() }
const rolePermiso = { findFirst: vi.fn() }
const cargo = { findUnique: vi.fn(), update: vi.fn() }
const ocupacion = { count: vi.fn(), findFirst: vi.fn() }
const persona = { findUnique: vi.fn() }
const tx = { concursoCeetps, concursoCph, autorizacion, concurso, usuario, role, rolePermiso, cargo, ocupacion, persona }
vi.mock('../shared/prisma.js', () => ({
  prisma: {
    ...tx,
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  },
}))
const crearNotificacion = vi.fn(async () => ({ id: 'n' }))
vi.mock('../modules/notificaciones/notificaciones.service.js', () => ({ crearNotificacion }))
const notificarSgrasvYHijos = vi.fn(async () => undefined)
vi.mock('../modules/notificaciones/notificarSgrasv.js', () => ({ notificarSgrasvYHijos }))
vi.mock('../modules/tareas/tareas.service.js', () => ({
  crearTareaPendiente: vi.fn(),
  mensajeTareaRechazo: vi.fn(() => 'motivo'),
}))

const {
  camposEtapa2Modificados, validarBloqueoEtapa2Ceetps, validarIfCeetps, debeSolicitarAperturaCeetps,
} = await import('../modules/concursos-ceetps/autorizacionNuevoCargo.js')
const {
  patchConcursoCeetpsService, getConcursoCeetpsByIdService, designarConcursoCeetpsService,
} = await import('../modules/concursos-ceetps/concursos-ceetps.service.js')
const { aprobarAutorizacionService, rechazarAutorizacionService } =
  await import('../modules/autorizaciones/autorizaciones.service.js')

const MSG = 'El concurso necesita la autorización de SGRASV para avanzar a la Etapa 2'
const nuevoSin = { motivoConcurso: 'nuevo_cargo', autorizadoAt: null }
const nuevoOk = { motivoConcurso: 'nuevo_cargo', autorizadoAt: new Date('2026-01-01') }
const otroMotivo = { motivoConcurso: 'alta_por_baja', autorizadoAt: null }

const filaBase = {
  id: 'ce1', concursoId: 'c1', cargoId: 'cg1', estado: 'sin_autorizar', subEstado: null,
  expedienteConcurso: null, ifAutorizacion: null, fechaCaratulacion: null, fechaAutorizacion: null,
  puestoSolicitado: null, dispoLlamado: null, fechaIfacs: null, fechaInsal: null,
  expedienteDesignacion: null, dispoDesignacion: null, resolucionDesignacion: null,
  puestoDesignado: null, estadoApto: null, numeroAptoMedico: null, fechaProyectoDispo: null,
  altaSial: null, codigoSial: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  concursoCeetps.update.mockResolvedValue({ id: 'ce1' })
  concursoCeetps.updateMany.mockResolvedValue({ count: 1 })
  concursoCeetps.findUniqueOrThrow.mockResolvedValue({ id: 'ce1', releido: true })
  autorizacion.create.mockResolvedValue({ id: 'aut1' })
  autorizacion.findFirst.mockResolvedValue(null)
  autorizacion.update.mockResolvedValue({ id: 'aut1' })
  concurso.updateMany.mockResolvedValue({ count: 1 })
  role.findMany.mockResolvedValue([{ slug: 'sgrasv_x' }])
  rolePermiso.findFirst.mockResolvedValue(null)
  cargo.findUnique.mockResolvedValue({ estado: 'vigente' })
  ocupacion.count.mockResolvedValue(0)
})

describe('lógica pura CEETPS', () => {
  it('camposEtapa2Modificados: solo cuenta valores distintos (vacío igual a null, fechas, altaSial false igual a null)', () => {
    const existing = { ...filaBase, fechaIfacs: new Date('2026-03-05T00:00:00Z'), dispoLlamado: 'D-1' }
    expect(camposEtapa2Modificados(
      { fechaIfacs: '2026-03-05', dispoLlamado: 'D-1', codigoSial: '', altaSial: false, estadoApto: null }, existing,
    )).toEqual([])
    expect(camposEtapa2Modificados({ dispoLlamado: 'D-2', fechaInsal: '2026-04-01' }, existing))
      .toEqual(['dispoLlamado', 'fechaInsal'])
  })

  it('bloqueo 409 con valor cambiado, no con valor igual, no en otros motivos ni autorizados', () => {
    expect(() => validarBloqueoEtapa2Ceetps(nuevoSin, { dispoLlamado: 'D-9' }, filaBase)).toThrow(MSG)
    expect(() => validarBloqueoEtapa2Ceetps(nuevoSin, { dispoLlamado: null }, filaBase)).not.toThrow()
    expect(() => validarBloqueoEtapa2Ceetps(otroMotivo, { dispoLlamado: 'D-9' }, filaBase)).not.toThrow()
    expect(() => validarBloqueoEtapa2Ceetps(nuevoOk, { dispoLlamado: 'D-9' }, filaBase)).not.toThrow()
  })

  it('IF obligatorio (400) junto con el expediente solo en nuevo_cargo sin autorizar', () => {
    expect(() => validarIfCeetps(nuevoSin, { expedienteConcurso: 'EE-1' }, filaBase)).toThrow(/IF de autorización/)
    expect(() => validarIfCeetps(nuevoSin, { expedienteConcurso: 'EE-1', ifAutorizacion: 'IF-1' }, filaBase)).not.toThrow()
    expect(() => validarIfCeetps(nuevoSin, { observaciones: 'x' }, filaBase)).not.toThrow()
    expect(() => validarIfCeetps(otroMotivo, { expedienteConcurso: 'EE-1' }, filaBase)).not.toThrow()
  })

  it('debeSolicitarAperturaCeetps: Etapa 1 completa, sin pendiente', () => {
    const body = { expedienteConcurso: 'EE-1', ifAutorizacion: 'IF-1' }
    expect(debeSolicitarAperturaCeetps({ concurso: nuevoSin, body, existing: filaBase, pendienteAutorizacion: false })).toBe(true)
    expect(debeSolicitarAperturaCeetps({ concurso: nuevoSin, body, existing: filaBase, pendienteAutorizacion: true })).toBe(false)
    expect(debeSolicitarAperturaCeetps({ concurso: otroMotivo, body, existing: filaBase, pendienteAutorizacion: false })).toBe(false)
    expect(debeSolicitarAperturaCeetps({ concurso: nuevoSin, body: { observaciones: 'x' }, existing: filaBase, pendienteAutorizacion: false })).toBe(false)
  })
})

describe('patchConcursoCeetpsService', () => {
  const etapa1 = { expedienteConcurso: 'EE-1', ifAutorizacion: 'IF-1' }
  function dado(concursoRow: object, fila: object = {}) {
    concursoCeetps.findUnique.mockResolvedValue({ ...filaBase, ...fila, concurso: { ...concursoRow, cargo: { codigo: 'CEE-1' } } })
  }

  it('Etapa 2+ cambiada en nuevo_cargo sin autorizar => 409 y no escribe', async () => {
    dado(nuevoSin)
    await expect(patchConcursoCeetpsService('ce1', { dispoLlamado: 'D-1' }, 'u1')).rejects.toMatchObject({ statusCode: 409, message: MSG })
    expect(concursoCeetps.update).not.toHaveBeenCalled()
  })

  it('expediente sin IF => 400', async () => {
    dado(nuevoSin)
    await expect(patchConcursoCeetpsService('ce1', { expedienteConcurso: 'EE-1' }, 'u1')).rejects.toMatchObject({ statusCode: 400 })
  })

  it('sin permiso: crea autorización pendiente y deja A_AUTORIZACION', async () => {
    dado(nuevoSin)
    usuario.findUnique.mockResolvedValue({ role: { id: 'r1', slug: 'concursales_ceetps' } })
    await patchConcursoCeetpsService('ce1', etapa1, 'u1')
    expect(autorizacion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: 'concurso_ceetps', referenciaId: 'ce1', solicitadoPorId: 'u1', resolverPorRolSlug: 'sgrasv_x' }),
    })
    expect(concursoCeetps.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ estado: 'sin_autorizar', subEstado: 'A_AUTORIZACION' }),
    }))
    expect(concurso.updateMany).not.toHaveBeenCalled()
    expect(notificarSgrasvYHijos).toHaveBeenCalledTimes(1)
  })

  it('con permiso: autoaprueba (traza aprobada, autorizado_at, fechaAutorizacion, estado autorizado)', async () => {
    dado(nuevoSin)
    usuario.findUnique.mockResolvedValue({ role: { id: 'r1', slug: 'sgrasv_x' } })
    rolePermiso.findFirst.mockResolvedValue({ id: 'rp' })
    concurso.findUnique.mockResolvedValue({ cargoId: 'cg1', ...nuevoSin })
    concursoCeetps.findUnique
      .mockResolvedValueOnce({ ...filaBase, concurso: { ...nuevoSin, cargo: { codigo: 'CEE-1' } } }) // patch
      .mockResolvedValue({ ...filaBase, ...etapa1 }) // recalcularCalcCeetps
    await patchConcursoCeetpsService('ce1', etapa1, 'u1')
    expect(autorizacion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: 'concurso_ceetps', estado: 'aprobada', resueltoPorId: 'u1', solicitadoPorId: 'u1' }),
    })
    expect(concurso.updateMany).toHaveBeenCalledWith({ where: { id: 'c1', autorizadoAt: null }, data: { autorizadoAt: expect.any(Date) } })
    expect(concursoCeetps.updateMany).toHaveBeenCalledWith({ where: { id: 'ce1', fechaAutorizacion: null }, data: { fechaAutorizacion: expect.any(Date) } })
    expect(concursoCeetps.update).toHaveBeenLastCalledWith({ where: { id: 'ce1' }, data: { estado: 'autorizado', subEstado: null } })
  })

  it('admin también autoaprueba', async () => {
    dado(nuevoSin)
    usuario.findUnique.mockResolvedValue({ role: { id: 'r0', slug: 'admin' } })
    concurso.findUnique.mockResolvedValue({ cargoId: 'cg1', ...nuevoSin })
    await patchConcursoCeetpsService('ce1', etapa1, 'u1')
    expect(autorizacion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ estado: 'aprobada' }) })
  })

  it('concurso que no es nuevo_cargo: sin autorizaciones ni bloqueo, puesto => autorizado', async () => {
    dado(otroMotivo)
    await patchConcursoCeetpsService('ce1', { ...etapa1, dispoLlamado: 'D-1', puestoSolicitado: 'X' }, 'u1')
    expect(autorizacion.create).not.toHaveBeenCalled()
    expect(autorizacion.findFirst).not.toHaveBeenCalled()
    expect(concursoCeetps.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ estado: 'en_proceso', subEstado: 'DISPO_LLAMADO' }),
    }))
  })

  it('carrera de hayPendiente: otra pendiente aparece entre la lectura y la tx => no crea ni notifica de nuevo', async () => {
    dado(nuevoSin)
    usuario.findUnique.mockResolvedValue({ role: { id: 'r1', slug: 'concursales_ceetps' } })
    // 1ª lectura (fuera de la tx): sin pendiente; relectura dentro de la tx: ya hay una.
    autorizacion.findFirst.mockResolvedValueOnce(null).mockResolvedValue({ id: 'pend' })
    await patchConcursoCeetpsService('ce1', etapa1, 'u1')
    expect(autorizacion.create).not.toHaveBeenCalled()
    expect(notificarSgrasvYHijos).not.toHaveBeenCalled()
  })
  it('con autorización pendiente no crea otra y queda A_AUTORIZACION', async () => {
    dado(nuevoSin, { expedienteConcurso: 'EE-1', ifAutorizacion: 'IF-1' })
    autorizacion.findFirst.mockResolvedValue({ id: 'pend' })
    await patchConcursoCeetpsService('ce1', { observaciones: 'nota' }, 'u1')
    expect(autorizacion.create).not.toHaveBeenCalled()
    expect(concursoCeetps.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ subEstado: 'A_AUTORIZACION' }),
    }))
  })
})

describe('getConcursoCeetpsByIdService', () => {
  it('nuevo_cargo sin autorizar: trae pendiente y último rechazo', async () => {
    concursoCeetps.findUnique.mockResolvedValue({ ...filaBase, concurso: nuevoSin })
    autorizacion.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'r1', observaciones: 'falta IF', updatedAt: new Date('2026-02-01'),
        resueltoPor: { nombre: 'Ana', apellido: 'Paz', username: 'apaz' },
      })
    const r = await getConcursoCeetpsByIdService('ce1')
    expect(r.autorizacionPendiente).toBeNull()
    expect(r.ultimaAutorizacionRechazada).toMatchObject({ observaciones: 'falta IF', resueltaPor: 'Ana Paz' })
  })

  it('otro motivo o ya autorizado: null y sin consultar autorizaciones', async () => {
    concursoCeetps.findUnique.mockResolvedValue({ ...filaBase, concurso: nuevoOk })
    const r = await getConcursoCeetpsByIdService('ce1')
    expect(r.autorizacionPendiente).toBeNull()
    expect(r.ultimaAutorizacionRechazada).toBeNull()
    expect(autorizacion.findFirst).not.toHaveBeenCalled()
  })
})

describe('designarConcursoCeetpsService', () => {
  it('nuevo_cargo sin autorizar => 409', async () => {
    concursoCeetps.findUnique.mockResolvedValue({ ...filaBase, concurso: { ...nuevoSin, cargo: { codigo: 'C' } } })
    await expect(designarConcursoCeetpsService('ce1', { personaId: 'p1', fechaDesde: '2026-05-01' })).rejects
      .toMatchObject({ statusCode: 409, message: MSG })
    expect(persona.findUnique).not.toHaveBeenCalled()
  })
})

describe('aprobar / rechazar concurso_ceetps', () => {
  const aut = {
    id: 'aut1', tipo: 'concurso_ceetps', estado: 'pendiente', referenciaId: 'ce1',
    resolverPorRolSlug: 'sgrasv_x', solicitadoPorId: 'u9',
  }
  beforeEach(() => {
    autorizacion.findUnique.mockResolvedValue(aut)
    usuario.findUnique.mockResolvedValue({ role: { slug: 'concursales_ceetps' } })
    concursoCeetps.findUnique.mockResolvedValue({ ...filaBase, ...{ expedienteConcurso: 'EE-1', ifAutorizacion: 'IF-1' } })
    concurso.findUnique.mockResolvedValue({ cargoId: 'cg1', ...nuevoSin })
  })

  it('aprobar: autorizado_at, fechaAutorizacion, estado autorizado y cargo recalculado', async () => {
    await aprobarAutorizacionService('aut1', 'u1', 'sgrasv_x')
    expect(concurso.updateMany).toHaveBeenCalledWith({ where: { id: 'c1', autorizadoAt: null }, data: { autorizadoAt: expect.any(Date) } })
    expect(concursoCeetps.updateMany).toHaveBeenCalledWith({ where: { id: 'ce1', fechaAutorizacion: null }, data: { fechaAutorizacion: expect.any(Date) } })
    expect(concursoCeetps.update).toHaveBeenCalledWith({ where: { id: 'ce1' }, data: { estado: 'autorizado', subEstado: null } })
    expect(cargo.update).toHaveBeenCalledWith({ where: { id: 'cg1' }, data: { subEstado: 'concurso' } })
  })

  it('aprobar es idempotente: segunda aprobación (count 0) no re-fecha ni recalcula', async () => {
    concurso.updateMany.mockResolvedValue({ count: 0 })
    await aprobarAutorizacionService('aut1', 'u1', 'sgrasv_x')
    expect(concursoCeetps.updateMany).not.toHaveBeenCalled()
    expect(concursoCeetps.update).not.toHaveBeenCalled()
  })

  it('aprobar: ConcursoCeetps inexistente => 404', async () => {
    concursoCeetps.findUnique.mockResolvedValue(null)
    await expect(aprobarAutorizacionService('aut1', 'u1', 'sgrasv_x')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rechazar sin observación => 400 y no escribe', async () => {
    await expect(rechazarAutorizacionService('aut1', 'u1', 'sgrasv_x', '   ')).rejects.toMatchObject({ statusCode: 400 })
    expect(autorizacion.update).not.toHaveBeenCalled()
  })

  it('rechazar con observación: vuelve a EXP_CARATULADO y notifica al solicitante con el motivo', async () => {
    concursoCeetps.findUnique
      .mockResolvedValueOnce({ concursoId: 'c1' })
      .mockResolvedValue({ ...filaBase, expedienteConcurso: 'EE-1', ifAutorizacion: 'IF-1', puestoSolicitado: 'X' })
    await rechazarAutorizacionService('aut1', 'u1', 'sgrasv_x', 'Falta el IF correcto')
    expect(autorizacion.update).toHaveBeenCalledWith({
      where: { id: 'aut1' },
      data: { estado: 'rechazada', resueltoPorId: 'u1', observaciones: 'Falta el IF correcto' },
    })
    expect(concursoCeetps.update).toHaveBeenCalledWith({
      where: { id: 'ce1' },
      data: { estado: 'sin_autorizar', subEstado: 'EXP_CARATULADO' },
    })
    expect(crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({
      mensaje: expect.stringContaining('Falta el IF correcto'),
    }))
  })
})
