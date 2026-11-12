import { describe, it, expect, vi, beforeEach } from 'vitest'
// =============================================================================
// Paso 5a — corrección del tipo de concurso (CPH <-> CEETPS) por quien autoriza.
// Prisma simulado: se verifica permiso, validaciones, copia de datos, manejo de
// la autorización, CR del cargo, atomicidad y avisos post-commit.
// =============================================================================
const mk = () => ({
  findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(),
  update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), count: vi.fn(async () => 0),
})
const concursoCph = mk()
const concursoCeetps = mk()
const concurso = mk()
const autorizacion = mk()
const cargo = mk()
const codigoRegistro = mk()
const notificacion = mk()
const tareaPendiente = mk()
const auditLog = mk()
const usuario = mk()
const role = mk()
const solicitudAlta = mk()
const tx = {
  concursoCph, concursoCeetps, concurso, autorizacion, cargo, codigoRegistro, notificacion,
  tareaPendiente, auditLog, usuario, role, solicitudAlta,
  $queryRaw: vi.fn(),
}
const $transaction = vi.fn(async (fn: (t: unknown) => unknown, _opts?: unknown) => {
  return fn(tx)
})
vi.mock('../shared/prisma.js', () => ({
  prisma: { $transaction, usuario, role, solicitudAlta },
}))
const usuarioPuedeResolverSgrasv = vi.fn()
const autoAprobarConcurso = vi.fn()
vi.mock('../modules/autorizaciones/autorizaciones.service.js', () => ({
  usuarioPuedeResolverSgrasv: (...a: unknown[]) => usuarioPuedeResolverSgrasv(...a),
  autoAprobarConcurso: (...a: unknown[]) => autoAprobarConcurso(...a),
}))
const createConcursoTx = vi.fn()
vi.mock('../modules/concursos/concursos.service.js', () => ({
  createConcursoTx: (...a: unknown[]) => createConcursoTx(...a),
}))
const recalcularCalcCph = vi.fn()
const recalcularCalcCeetps = vi.fn()
vi.mock('../modules/concursos-cph/recalcularCph.js', () => ({ recalcularCalcCph: (...a: unknown[]) => recalcularCalcCph(...a) }))
vi.mock('../modules/concursos-ceetps/recalcularCeetps.js', () => ({ recalcularCalcCeetps: (...a: unknown[]) => recalcularCalcCeetps(...a) }))
const recalcularSubEstadoCargo = vi.fn()
vi.mock('../modules/cargos/subEstado.repo.js', () => ({ recalcularSubEstadoCargo: (...a: unknown[]) => recalcularSubEstadoCargo(...a) }))
const crearNotificacion = vi.fn()
vi.mock('../modules/notificaciones/notificaciones.service.js', () => ({ crearNotificacion: (...a: unknown[]) => crearNotificacion(...a) }))
const notificarSgrasvYHijos = vi.fn()
vi.mock('../modules/notificaciones/notificarSgrasv.js', () => ({ notificarSgrasvYHijos: (...a: unknown[]) => notificarSgrasvYHijos(...a) }))
const resolverCrPorCarrera = vi.fn()
vi.mock('../shared/crPorCarrera.js', () => ({ resolverCrPorCarrera: (...a: unknown[]) => resolverCrPorCarrera(...a) }))

const {
  corregirTipoConcursoService, mapearCphACeetps, mapearCeetpsACph, resolverCrDestino, CR_DEFECTO_POR_TIPO,
} = await import('../modules/concursos/corregirTipo.service.js')
const { corregirTipoSchema } = await import('../modules/concursos/corregirTipo.schema.js')

const CARGO_CPH = {
  id: 'cg1', codigo: 'CPH-POF-000001', escalafonId: 'esc-cph', literalPuesto: 'Médico',
  codigoRegistroId: 'cr37', codigoRegistro: { codigo: '37' },
}
const baseNuevoCargo = (over: Record<string, unknown> = {}) => ({
  id: 'c1', cargoId: 'cg1', hospitalId: 'h1', personaId: null, bajaId: null, origen: 'Alta de cargo',
  fechaVacante: new Date('2026-05-01'), motivo: null, motivoConcurso: 'nuevo_cargo', expediente: 'EX-1',
  autorizadoAt: null, registradoPorId: 'u-alta', createdAt: new Date('2026-05-01T10:00:00Z'),
  cargo: CARGO_CPH, ...over,
})
const cph = (over: Record<string, unknown> = {}) => ({
  id: 'cph1', concursoId: 'c1', estado: 'no_iniciado', eeConcurso: 'EE-77', fechaEeConcurso: new Date('2026-05-02'),
  ifAutorizacion: 'IF-9', fechaAutorizacion: null, fechaIfacs: null, fechaInsal: null,
  puestoSolicitado: 'Médico clínico', puestoCargoSolicitadoId: 'pc1', observaciones: 'obs', cambioEspecialidad: false,
  motivoCambioEspecialidad: null, especialidadSolicitada: 'Clínica', eeBaja: null, fechaBaja: null,
  concurso: baseNuevoCargo(),
  _count: { ordenesMerito: 0, sorteosJurado: 0, inscriptos: 0, desiertoHistorial: 0, jornadasSorteo: 0, integrantesDesignados: 0 },
  ...over,
})
const ceetps = (over: Record<string, unknown> = {}) => ({
  id: 'ce1', concursoId: 'c1', estado: 'sin_autorizar', expedienteConcurso: 'EE-55', fechaCaratulacion: new Date('2026-05-03'),
  ifAutorizacion: 'IF-5', fechaAutorizacion: null, fechaIfacs: null, fechaInsal: null, puestoSolicitado: 'Enfermero',
  puestoCargoSolicitadoId: 'pc2', observaciones: null, cambioEspecialidad: false, docCambioEspecialidad: null,
  cargaHoraria: 35, apertura2x18: false, informeApertura: null, expedienteConcurso2: null, tipificadorOrigen: null, cantidadCargos: 1,
  concurso: baseNuevoCargo({ cargo: { ...CARGO_CPH, escalafonId: 'esc-87', codigoRegistroId: 'cr87', codigoRegistro: { codigo: '87' }, literalPuesto: 'Enfermero' } }),
  ...over,
})
const BODY_A_CEETPS = { tipoDestino: 'ceetps' as const, motivo: 'Mal elegido', codigoRegistro: '85' }
const BODY_A_CPH = { tipoDestino: 'cph' as const, motivo: 'Mal elegido' }

beforeEach(() => {
  vi.clearAllMocks()
  usuarioPuedeResolverSgrasv.mockResolvedValue(true)
  autoAprobarConcurso.mockResolvedValue({ id: 'aut-ok' })
  concursoCph.findUnique.mockImplementation(async (a: { select?: unknown }) => (a.select ? { concursoId: 'c1' } : cph()))
  concursoCeetps.findUnique.mockImplementation(async (a: { select?: unknown }) => (a.select ? { concursoId: 'c1' } : ceetps()))
  tx.$queryRaw.mockResolvedValue([{ id: 'c1' }])
  concursoCph.findFirst.mockResolvedValue(null)
  concursoCeetps.findFirst.mockResolvedValue(null)
  autorizacion.findMany.mockResolvedValue([])
  autorizacion.create.mockResolvedValue({ id: 'aut-new' })
  cargo.update.mockResolvedValue({})
  concurso.update.mockResolvedValue({})
  concursoCph.count.mockResolvedValue(0)
  concursoCeetps.count.mockResolvedValue(1)
  createConcursoTx.mockImplementation(async (_t: unknown, body: { tipoConcurso: string }) =>
    body.tipoConcurso === 'ceetps'
      ? { concurso: { id: 'c2' }, concursoCeetps: { id: 'ce2' } }
      : { concurso: { id: 'c2' }, concursoCph: { id: 'cph2' } })
  codigoRegistro.findUnique.mockResolvedValue({ id: 'cr85', codigo: '85', escalafonId: 'esc-85' })
  resolverCrPorCarrera.mockResolvedValue(null)
  usuario.findMany.mockResolvedValue([{ role: { slug: 'concursales_cph' } }])
  role.findMany.mockResolvedValue([{ slug: 'supervision_x' }])
  solicitudAlta.findFirst.mockResolvedValue({ solicitadoPorId: 'u-sol' })
})

describe('permiso', () => {
  it('sin derecho de autorizar => 403 y no abre transacción', async () => {
    usuarioPuedeResolverSgrasv.mockResolvedValue(false)
    await expect(corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u-sup')).rejects.toMatchObject({ statusCode: 403 })
    expect($transaction).not.toHaveBeenCalled()
  })
  it('con derecho (autorizador o admin) corrige y usa TX_OPTS_LARGA', async () => {
    const r = await corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u-aut')
    expect(r.tipoDestino).toBe('ceetps')
    expect($transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 90_000, maxWait: 15_000 })
  })
})

describe('validaciones', () => {
  it('motivo obligatorio (schema y servicio)', async () => {
    expect(corregirTipoSchema.safeParse({ tipoDestino: 'cph', motivo: '   ' }).success).toBe(false)
    await expect(corregirTipoConcursoService('cph', 'cph1', { tipoDestino: 'ceetps', motivo: '  ', codigoRegistro: '85' }, 'u')).rejects.toMatchObject({ statusCode: 400 })
  })
  it('tipo destino igual al actual => 400', async () => {
    await expect(corregirTipoConcursoService('cph', 'cph1', BODY_A_CPH, 'u')).rejects.toMatchObject({ statusCode: 400 })
  })
  it('concurso autorizado => 409 y no se toca nada', async () => {
    concursoCph.findUnique.mockImplementation(async (a: { select?: unknown }) =>
      a.select ? { concursoId: 'c1' } : cph({ concurso: baseNuevoCargo({ autorizadoAt: new Date() }) }))
    await expect(corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u')).rejects.toMatchObject({ statusCode: 409 })
    expect(createConcursoTx).not.toHaveBeenCalled()
    expect(concursoCph.delete).not.toHaveBeenCalled()
  })
  it('concurso que no es nuevo_cargo => 409', async () => {
    concursoCeetps.findUnique.mockImplementation(async (a: { select?: unknown }) =>
      a.select ? { concursoId: 'c1' } : ceetps({ concurso: baseNuevoCargo({ motivoConcurso: 'alta_por_baja' }) }))
    await expect(corregirTipoConcursoService('ceetps', 'ce1', BODY_A_CPH, 'u')).rejects.toMatchObject({ statusCode: 409 })
    concursoCeetps.findUnique.mockImplementation(async (a: { select?: unknown }) =>
      a.select ? { concursoId: 'c1' } : ceetps({ concurso: baseNuevoCargo({ motivoConcurso: null }) }))
    await expect(corregirTipoConcursoService('ceetps', 'ce1', BODY_A_CPH, 'u')).rejects.toMatchObject({ statusCode: 409 })
  })
  it('concurso finalizado => 409', async () => {
    concursoCph.findUnique.mockImplementation(async (a: { select?: unknown }) => (a.select ? { concursoId: 'c1' } : cph({ estado: 'finalizado' })))
    await expect(corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u')).rejects.toMatchObject({ statusCode: 409 })
  })
  it('CPH con jurado/inscriptos => 409', async () => {
    concursoCph.findUnique.mockImplementation(async (a: { select?: unknown }) =>
      a.select ? { concursoId: 'c1' } : cph({ _count: { ordenesMerito: 0, sorteosJurado: 1, inscriptos: 0, desiertoHistorial: 0, jornadasSorteo: 0, integrantesDesignados: 0 } }))
    await expect(corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u')).rejects.toMatchObject({ statusCode: 409 })
  })
  it('segunda corrección (origen ya borrado) => 404; fila base ya borrada tras esperar el lock => 409', async () => {
    concursoCph.findUnique.mockResolvedValue(null)
    await expect(corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u')).rejects.toMatchObject({ statusCode: 404 })
    concursoCph.findUnique.mockImplementation(async (a: { select?: unknown }) => (a.select ? { concursoId: 'c1' } : cph()))
    tx.$queryRaw.mockResolvedValue([])
    await expect(corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u')).rejects.toMatchObject({ statusCode: 409 })
    expect(createConcursoTx).not.toHaveBeenCalled()
  })
  it('otro concurso abierto del cargo => 409; destino que deja >1 abierto => 409 (rollback)', async () => {
    concursoCeetps.findFirst.mockResolvedValue({ id: 'otro' })
    await expect(corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u')).rejects.toMatchObject({ statusCode: 409 })
    concursoCeetps.findFirst.mockResolvedValue(null)
    concursoCeetps.count.mockResolvedValue(2)
    await expect(corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u')).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('CPH -> CEETPS', () => {
  it('crea el destino con createConcursoTx, copia la Etapa 1, borra el origen y audita', async () => {
    const r = await corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u-aut')
    expect(r).toMatchObject({ tipoOrigen: 'cph', tipoDestino: 'ceetps', concursoId: 'c2', detalleId: 'ce2', autorizado: true, autorizacionId: 'aut-ok', codigoRegistroElegido: '85' })
    const [, body, usuarioReg, , opts] = createConcursoTx.mock.calls[0]!
    expect(body).toMatchObject({ cargoId: 'cg1', tipoConcurso: 'ceetps', motivoConcurso: 'nuevo_cargo', expediente: 'EX-1', puestoSolicitado: 'Médico clínico' })
    expect(usuarioReg).toBe('u-alta') // conserva quién registró el concurso
    expect(opts).toMatchObject({ notificar: false, recalcularSubEstado: false })
    expect(concursoCeetps.update).toHaveBeenCalledWith({
      where: { id: 'ce2' },
      data: expect.objectContaining({ expedienteConcurso: 'EE-77', ifAutorizacion: 'IF-9', puestoCargoSolicitadoId: 'pc1', observaciones: 'obs' }),
    })
    expect(concursoCph.delete).toHaveBeenCalledWith({ where: { id: 'cph1' } })
    expect(concurso.delete).toHaveBeenCalledWith({ where: { id: 'c1' } })
    expect(concurso.update).toHaveBeenCalledWith({ where: { id: 'c2' }, data: { createdAt: new Date('2026-05-01T10:00:00Z') } })
    expect(autoAprobarConcurso).toHaveBeenCalledTimes(1)
    expect(recalcularSubEstadoCargo).toHaveBeenCalledWith(tx, 'cg1')
    const audit = auditLog.create.mock.calls[0]![0].data
    expect(audit).toMatchObject({ usuarioId: 'u-aut', accion: 'corregir_tipo', entidad: 'concurso_tipo', entidadId: 'ce2' })
    expect(audit.cambios).toMatchObject({
      tipoOrigen: 'cph', tipoDestino: 'ceetps', motivo: 'Mal elegido', detalleIdAnterior: 'cph1', detalleIdNuevo: 'ce2',
      camposSinEquivalente: { especialidadSolicitada: 'Clínica' },
    })
  })
  it('autoriza en el acto con la lógica de 2b (observación explicativa, tipo destino, mismo usuario)', async () => {
    const r = await corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u-aut')
    expect(r).toMatchObject({ autorizado: true, autorizacionId: 'aut-ok' })
    expect(autoAprobarConcurso).toHaveBeenCalledWith(tx, {
      tipo: 'concurso_ceetps', referenciaId: 'ce2', concursoId: 'c2', usuarioId: 'u-aut',
      observaciones: 'Autorizado al corregir el tipo (de CPH a CEETPS). Motivo: Mal elegido',
    })
    expect(recalcularSubEstadoCargo).toHaveBeenCalledWith(tx, 'cg1')
  })
  it('sin IF (con expediente) autoriza igual: el IF es opcional', async () => {
    concursoCph.findUnique.mockImplementation(async (a: { select?: unknown }) => (a.select ? { concursoId: 'c1' } : cph({ ifAutorizacion: null })))
    const r = await corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u-aut')
    expect(r).toMatchObject({ autorizado: true, autorizacionId: 'aut-ok' })
    expect(autoAprobarConcurso).toHaveBeenCalledTimes(1)
  })
  it('sin expediente corrige igual pero NO autoriza y lo indica', async () => {
    concursoCph.findUnique.mockImplementation(async (a: { select?: unknown }) => (a.select ? { concursoId: 'c1' } : cph({ eeConcurso: null })))
    const r = await corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u-aut')
    expect(r).toMatchObject({ autorizado: false, motivoNoAutorizado: 'Falta expediente', autorizacionId: null })
    expect(autoAprobarConcurso).not.toHaveBeenCalled()
    expect(recalcularCalcCeetps).toHaveBeenCalledWith(tx, 'ce2', 'sin_solicitar')
    expect(auditLog.create.mock.calls[0]![0].data.cambios).toMatchObject({ autorizado: false, autorizacionId: null })
  })
  it('si falla la autorización se propaga el error (rollback) sin auditoría ni avisos', async () => {
    autoAprobarConcurso.mockRejectedValue(new Error('fallo aut'))
    await expect(corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u-aut')).rejects.toThrow('fallo aut')
    expect(auditLog.create).not.toHaveBeenCalled()
    expect(crearNotificacion).not.toHaveBeenCalled()
  })
  it('no toca escalafón ni código del cargo (solo el CR)', async () => {
    await corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u-aut')
    for (const c of cargo.update.mock.calls) expect(Object.keys(c[0].data)).toEqual(['codigoRegistroId'])
  })
  it('CR requerido para CEETPS: falta, inválido o que no clasifica => 400', async () => {
    for (const codigoRegistro of [undefined, '', '37', '83', 'x']) {
      await expect(corregirTipoConcursoService('cph', 'cph1', { tipoDestino: 'ceetps', motivo: 'm', codigoRegistro }, 'u'))
        .rejects.toMatchObject({ statusCode: 400 })
    }
    expect($transaction).not.toHaveBeenCalled()
  })
  it('CR 87: se guarda en el cargo, se audita y el concurso usa el escalafón del CR', async () => {
    codigoRegistro.findUnique.mockResolvedValue({ id: 'cr87', codigo: '87', escalafonId: 'esc-87' })
    const r = await corregirTipoConcursoService('cph', 'cph1', { ...BODY_A_CEETPS, codigoRegistro: '87' }, 'u-aut')
    expect(r).toMatchObject({ codigoRegistroElegido: '87', codigoRegistroActualizado: true })
    expect(codigoRegistro.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { codigo: '87' } }))
    expect(cargo.update).toHaveBeenCalledWith({ where: { id: 'cg1' }, data: { codigoRegistroId: 'cr87' } })
    expect(createConcursoTx.mock.calls[0]![1]).toMatchObject({ escalafonId: 'esc-87' })
    expect(auditLog.create.mock.calls[0]![0].data.cambios).toMatchObject({
      codigoRegistroElegido: '87', autorizado: true, autorizacionId: 'aut-ok', codigoRegistroNuevo: '87',
    })
  })
  it('actualiza el CR del cargo: 37 -> 85 por defecto y escalafón del CR', async () => {
    const r = await corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u-aut')
    expect(r.codigoRegistroActualizado).toBe(true)
    expect(cargo.update).toHaveBeenCalledWith({ where: { id: 'cg1' }, data: { codigoRegistroId: 'cr85' } })
    expect(createConcursoTx.mock.calls[0]![1]).toMatchObject({ escalafonId: 'esc-85' })
  })
  it('autorización pendiente: se cierra con "Cambio de tipo" y no se re-emite otra (queda aprobada)', async () => {
    autorizacion.findMany.mockResolvedValue([{ id: 'aut-old', solicitadoPorId: 'u-sol' }])
    await corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u-aut')
    expect(autorizacion.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['aut-old'] } },
      data: expect.objectContaining({ estado: 'rechazada', observaciones: expect.stringContaining('Cambio de tipo') }),
    })
    expect(autorizacion.create).not.toHaveBeenCalled()
    expect(notificarSgrasvYHijos).not.toHaveBeenCalled()
  })
  it('sin autorización pendiente no se crea una pendiente', async () => {
    await corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u-aut')
    expect(autorizacion.create).not.toHaveBeenCalled()
    expect(notificarSgrasvYHijos).not.toHaveBeenCalled()
  })
  it('rechazo previo con observación: se conserva apuntando al concurso nuevo; se cierran las tareas', async () => {
    await corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u-aut')
    expect(autorizacion.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ referenciaId: 'cph1', tipo: 'concurso_cph', estado: 'rechazada' }),
      data: { referenciaId: 'ce2', tipo: 'concurso_ceetps', referenciaTipo: 'concurso_ceetps' },
    })
    expect(tareaPendiente.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ referenciaId: 'cph1' }) }))
  })
})

describe('CEETPS -> CPH', () => {
  it('copia los datos, pasa el CR a 37 y autoriza (sin selector de CR)', async () => {
    autorizacion.findMany.mockResolvedValue([{ id: 'aut-old', solicitadoPorId: null }])
    codigoRegistro.findUnique.mockResolvedValue({ id: 'cr37', codigo: '37', escalafonId: 'esc-cph' })
    concursoCph.count.mockResolvedValue(1)
    concursoCeetps.count.mockResolvedValue(0)
    const r = await corregirTipoConcursoService('ceetps', 'ce1', BODY_A_CPH, 'u-aut')
    expect(r).toMatchObject({ tipoOrigen: 'ceetps', tipoDestino: 'cph', detalleId: 'cph2', autorizado: true, codigoRegistroElegido: null })
    expect(concursoCph.update).toHaveBeenCalledWith({
      where: { id: 'cph2' },
      data: expect.objectContaining({ eeConcurso: 'EE-55', ifAutorizacion: 'IF-5', puestoCargoSolicitadoId: 'pc2' }),
    })
    expect(concursoCeetps.delete).toHaveBeenCalledWith({ where: { id: 'ce1' } })
    expect(cargo.update).toHaveBeenCalledWith({ where: { id: 'cg1' }, data: { codigoRegistroId: 'cr37' } })
    expect(autoAprobarConcurso).toHaveBeenCalledWith(tx, expect.objectContaining({ tipo: 'concurso_cph', referenciaId: 'cph2', concursoId: 'c2', usuarioId: 'u-aut' }))
    expect(auditLog.create.mock.calls[0]![0].data.cambios.camposSinEquivalente).toMatchObject({ cargaHoraria: 35 })
  })
})

describe('atomicidad y avisos', () => {
  it('si falla la creación del destino se propaga el error y no hay avisos ni auditoría', async () => {
    createConcursoTx.mockRejectedValue(new Error('boom'))
    await expect(corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u-aut')).rejects.toThrow('boom')
    expect(auditLog.create).not.toHaveBeenCalled()
    expect(crearNotificacion).not.toHaveBeenCalled()
  })
  it('avisa post-commit a solicitantes y supervisión con el motivo y que quedó autorizado', async () => {
    await corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u-aut')
    const slugs = crearNotificacion.mock.calls.map((c) => (c[0] as { rolSlug: string }).rolSlug).sort()
    expect(slugs).toEqual(['concursales_cph', 'supervision_x'])
    expect((crearNotificacion.mock.calls[0]![0] as { mensaje: string }).mensaje).toContain('quedó autorizado')
    expect(crearNotificacion.mock.invocationCallOrder[0]!).toBeGreaterThan($transaction.mock.invocationCallOrder[0]!)
  })
  it('si fallan los avisos la corrección NO se revierte', async () => {
    crearNotificacion.mockRejectedValue(new Error('smtp'))
    const r = await corregirTipoConcursoService('cph', 'cph1', BODY_A_CEETPS, 'u-aut')
    expect(r.detalleId).toBe('ce2')
  })
})

describe('mapeos y CR (puros)', () => {
  it('mapearCphACeetps trunca el motivo de cambio de especialidad a 500', () => {
    const m = mapearCphACeetps({ motivoCambioEspecialidad: 'x'.repeat(600) })
    expect((m.datos.docCambioEspecialidad as string).length).toBe(500)
  })
  it('mapearCeetpsACph archiva lo que no tiene equivalente', () => {
    expect(mapearCeetpsACph({ cargaHoraria: 18, apertura2x18: true, cantidadCargos: 2 }).sinEquivalente)
      .toEqual({ cargaHoraria: 18, apertura2x18: true, cantidadCargos: 2 })
  })
  it('resolverCrDestino conserva el CR actual si ya clasifica en el destino', async () => {
    const r = await resolverCrDestino(tx as never, { ...CARGO_CPH, codigoRegistro: { codigo: '85' }, codigoRegistroId: 'cr85' }, 'ceetps')
    expect(r).toMatchObject({ cambia: false, codigoRegistroId: 'cr85' })
  })
  it('CR por defecto: CPH 37 / CEETPS 85', () => {
    expect(CR_DEFECTO_POR_TIPO).toEqual({ cph: '37', ceetps: '85' })
  })
})
