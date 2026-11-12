import { describe, it, expect, vi, beforeEach } from 'vitest'
// =============================================================================
// Paso 5b — salto a designación desde una orden de mérito (omSalto.service.ts):
// GET /:id/om-disponibles y POST /:id/om/designar, más el reverso al
// liberar/rechazar el integrante y el permiso de Etapa 2. Prisma simulado.
// =============================================================================
const txMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  concursoCph: { findUnique: vi.fn(), update: vi.fn() },
  ordenMeritoIntegrante: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn(), count: vi.fn() },
  persona: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
}))
const prismaMock = vi.hoisted(() => ({
  concursoCph: { findUnique: vi.fn(), findMany: vi.fn() },
  ordenMerito: { findMany: vi.fn() },
  ordenMeritoIntegrante: { findMany: vi.fn(), findUnique: vi.fn() },
  auditLog: { findFirst: vi.fn() },
  rolePermiso: { findFirst: vi.fn() },
  $transaction: vi.fn(async (fn: (t: unknown) => unknown, _opts?: unknown) => fn(txMock)),
}))
const notifMock = vi.hoisted(() => ({ crearNotificacion: vi.fn(async () => undefined) }))
const subEstadoMock = vi.hoisted(() => ({ recalcularSubEstadoCargo: vi.fn(async () => undefined) }))
vi.mock('../shared/prisma.js', () => ({ prisma: prismaMock }))
vi.mock('../modules/notificaciones/notificaciones.service.js', () => notifMock)
vi.mock('../modules/cargos/subEstado.repo.js', () => subEstadoMock)
vi.mock('../modules/concursos-cph/concursos-cph.service.js', () => ({
  getConcursoCphByIdService: vi.fn(async (id: string) => ({ id, leidoDeNuevo: true })),
}))

const { listOmDisponiblesService, designarDesdeOmService } = await import('../modules/concursos-cph/omSalto.service.js')
const { liberarIntegranteOmService, rechazarIntegranteOmService } = await import('../modules/concursos-cph/inscriptos.service.js')
const { requirePermiso } = await import('../shared/middleware/permisos.middleware.js')
const { MENSAJE_BLOQUEO_ETAPA_2 } = await import('../modules/concursos-cph/autorizacionNuevoCargo.js')
const { TX_OPTS_LARGA } = await import('../shared/txOpts.js')

const futuro = new Date(Date.now() + 90 * 86_400_000)
const pasado = new Date(Date.now() - 90 * 86_400_000)

function destinoBase(over: Record<string, unknown> = {}, concursoOver: Record<string, unknown> = {}) {
  return {
    id: 'cph1',
    cargoId: 'c1',
    estado: 'activo',
    suspendido: false,
    subEstado: 'b-sorteo jur',
    subEstado3: 'b-autorizado',
    tipoGestion: 'centralizado',
    especialidadSolicitada: 'Enfermeros ATP',
    puestoSolicitado: null,
    eeConcurso: 'EE-1',
    fechaAutorizacion: new Date('2026-11-01'),
    sorteoJurado: new Date('2026-11-05'),
    saltoOmAt: null,
    saltoOmIntegranteId: null,
    resolucionDesignacion: null,
    personaDesignadaId: null,
    designadoRefCuil: null,
    designadoRefNombre: null,
    ...over,
    concurso: {
      motivoConcurso: 'nuevo_cargo',
      autorizadoAt: new Date('2026-11-01'),
      cargo: {
        id: 'c1',
        codigo: 'CPH-1',
        hospitalId: 'h1',
        escalafonId: 'e1',
        literalPuesto: 'Enfermero',
        especialidadLegacy: null,
        especialidadPuesto: { nombre: 'Enfermeros ATP' },
      },
      ...concursoOver,
    },
  }
}

function integranteBase(over: Record<string, unknown> = {}, omOver: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    ordenMeritoId: 'om1',
    personaId: 'p1',
    cuil: '20111111112',
    apellidoNombre: 'Perez, Juan',
    posicion: 1,
    designado: false,
    anulado: false,
    concursoCphDesignadoId: null,
    ordenMerito: {
      id: 'om1',
      concursoCphId: 'origen',
      especialidad: 'Enfermeros ATP',
      puesto: null,
      estado: 'vigente',
      fechaVencimiento: futuro,
      fechaProrroga: null,
      concursoCph: { id: 'origen', tipoGestion: 'centralizado', concurso: { cargo: { codigo: 'CPH-9', hospitalId: 'h1', escalafonId: 'e1' } } },
      ...omOver,
    },
    ...over,
  }
}

let destino: ReturnType<typeof destinoBase>
beforeEach(() => {
  vi.clearAllMocks()
  destino = destinoBase()
  prismaMock.concursoCph.findUnique.mockImplementation(async () => destino)
  prismaMock.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(txMock))
  txMock.$queryRaw.mockResolvedValue([{ id: 'cph1' }])
  txMock.concursoCph.findUnique.mockImplementation(async () => destino)
  txMock.concursoCph.update.mockResolvedValue({})
  txMock.ordenMeritoIntegrante.findUnique.mockResolvedValue(integranteBase())
  txMock.ordenMeritoIntegrante.findFirst.mockResolvedValue(null)
  txMock.ordenMeritoIntegrante.updateMany.mockResolvedValue({ count: 1 })
  txMock.persona.findUnique.mockResolvedValue(null)
  txMock.auditLog.create.mockResolvedValue({})
})

const designar = (motivo?: string) => designarDesdeOmService('cph1', 'i1', { usuarioId: 'u1', motivo })

describe('designarDesdeOmService', () => {
  it('feliz con persona del padrón: una tx larga, salto, persona, sub-estado y auditoría', async () => {
    const r = await designar('porque sí')
    expect(r).toEqual({ id: 'cph1', leidoDeNuevo: true })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(prismaMock.$transaction.mock.calls[0][1]).toBe(TX_OPTS_LARGA)
    expect(String(txMock.$queryRaw.mock.calls[0][0].join(' '))).toContain('FOR UPDATE')
    expect(txMock.ordenMeritoIntegrante.updateMany).toHaveBeenCalledWith({
      where: { id: 'i1', designado: false, anulado: false },
      data: { designado: true, concursoCphDesignadoId: 'cph1' },
    })
    const data = txMock.concursoCph.update.mock.calls[0][0].data
    expect(data).toMatchObject({
      saltoOmIntegranteId: 'i1',
      personaDesignadaId: 'p1',
      designadoRefCuil: null,
      estado: 'activo',
      subEstado: 'f-ifacs',
      subEstado3: 'f-prox. a desig',
    })
    expect(data.saltoOmAt).toBeInstanceOf(Date)
    // No se inventan datos de etapas 2-4.
    for (const k of ['sorteoJurado', 'fechaExamen', 'fechaOrdenMerito', 'fechaIfacs', 'fechaInsal', 'disposicion']) {
      expect(data).not.toHaveProperty(k)
    }
    expect(subEstadoMock.recalcularSubEstadoCargo).toHaveBeenCalledWith(txMock, 'c1')
    const audit = txMock.auditLog.create.mock.calls[0][0].data
    expect(audit).toMatchObject({
      usuarioId: 'u1',
      accion: 'designar_desde_om',
      entidad: 'concurso_cph_om',
      entidadId: 'cph1',
      metodo: 'POST',
    })
    expect(audit.cambios).toMatchObject({
      ordenMeritoId: 'om1',
      concursoOrigenId: 'origen',
      concursoOrigenCodigo: 'CPH-9',
      integranteId: 'i1',
      posicion: 1,
      cuil: '20111111112',
      apellidoNombre: 'Perez, Juan',
      tipoGestionOrigen: 'centralizado',
      tipoGestionDestino: 'centralizado',
      advertencias: [],
      pasosResueltos: ['jurado', 'inscripcion', 'examen', 'orden_merito'],
      motivo: 'porque sí',
      subEstadoAnterior: 'b-sorteo jur',
      subEstadoNuevo: 'f-ifacs',
    })
    expect(notifMock.crearNotificacion).toHaveBeenCalledWith(
      expect.objectContaining({ rolSlug: 'concursales_cph', origenKey: 'designacion_om:cph1:i1' }),
    )
  })

  it('persona solo por CUIL: la encuentra en el padrón', async () => {
    txMock.ordenMeritoIntegrante.findUnique.mockResolvedValue(integranteBase({ personaId: null }))
    txMock.persona.findUnique.mockResolvedValue({ id: 'p9' })
    await designar()
    expect(txMock.persona.findUnique).toHaveBeenCalledWith({ where: { cuil: '20111111112' }, select: { id: true } })
    expect(txMock.concursoCph.update.mock.calls[0][0].data.personaDesignadaId).toBe('p9')
  })

  it('persona fuera del padrón: guarda referencia por CUIL y nombre', async () => {
    txMock.ordenMeritoIntegrante.findUnique.mockResolvedValue(integranteBase({ personaId: null }))
    await designar()
    expect(txMock.concursoCph.update.mock.calls[0][0].data).toMatchObject({
      personaDesignadaId: null,
      designadoRefCuil: '20111111112',
      designadoRefNombre: 'Perez, Juan',
    })
  })

  it('integrante ya designado en otro concurso (doble clic / dos usuarios): 409 limpio', async () => {
    txMock.ordenMeritoIntegrante.updateMany.mockResolvedValue({ count: 0 })
    txMock.ordenMeritoIntegrante.findUnique.mockResolvedValue(integranteBase({ designado: true, concursoCphDesignadoId: 'otro' }))
    await expect(designar()).rejects.toMatchObject({ statusCode: 409, message: 'La persona ya fue designada en otro concurso' })
    expect(txMock.concursoCph.update).not.toHaveBeenCalled()
    expect(txMock.auditLog.create).not.toHaveBeenCalled()
    expect(notifMock.crearNotificacion).not.toHaveBeenCalled()
  })

  it('el mismo CUIL designado en otro integrante de otro concurso: 409', async () => {
    txMock.ordenMeritoIntegrante.findFirst
      .mockResolvedValueOnce(null) // otra reserva del destino
      .mockResolvedValueOnce({ id: 'iX' }) // mismo CUIL en otro concurso
    await expect(designar()).rejects.toMatchObject({ statusCode: 409 })
    expect(txMock.concursoCph.update).not.toHaveBeenCalled()
  })

  it('OM vencida: 409', async () => {
    txMock.ordenMeritoIntegrante.findUnique.mockResolvedValue(integranteBase({}, { fechaVencimiento: pasado }))
    await expect(designar()).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('vigente') })
    expect(txMock.ordenMeritoIntegrante.updateMany).not.toHaveBeenCalled()
  })

  it('OM de otra especialidad: 409', async () => {
    txMock.ordenMeritoIntegrante.findUnique.mockResolvedValue(integranteBase({}, { especialidad: 'Otra' }))
    await expect(designar()).rejects.toMatchObject({ statusCode: 409 })
  })

  it('OM del propio concurso: 409', async () => {
    txMock.ordenMeritoIntegrante.findUnique.mockResolvedValue(integranteBase({}, { concursoCphId: 'cph1' }))
    await expect(designar()).rejects.toMatchObject({ statusCode: 409 })
  })

  it('integrante inexistente: 404; anulado: 409', async () => {
    txMock.ordenMeritoIntegrante.findUnique.mockResolvedValueOnce(null)
    await expect(designar()).rejects.toMatchObject({ statusCode: 404 })
    txMock.ordenMeritoIntegrante.findUnique.mockResolvedValueOnce(integranteBase({ anulado: true }))
    await expect(designar()).rejects.toMatchObject({ statusCode: 409 })
  })

  it('tipoGestion no guardado: 409', async () => {
    destino = destinoBase({ tipoGestion: null })
    await expect(designar()).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('tipo de gestión') })
  })

  it('tipoGestion distinto al del origen: permite y deja la advertencia en la auditoría', async () => {
    destino = destinoBase({ tipoGestion: 'descentralizado' })
    await designar()
    const audit = txMock.auditLog.create.mock.calls[0][0].data
    expect(audit.cambios.advertencias).toHaveLength(1)
  })

  it('concurso sin especialidad: 409', async () => {
    destino = destinoBase({ especialidadSolicitada: null }, {
      cargo: { id: 'c1', codigo: 'CPH-1', hospitalId: 'h1', literalPuesto: 'Enfermero', especialidadLegacy: null, especialidadPuesto: null },
    })
    await expect(designar()).rejects.toMatchObject({ statusCode: 409 })
  })

  it('nuevo_cargo sin autorizar: 409 con el mensaje de SGRASV y no abre tx', async () => {
    destino = destinoBase({}, { autorizadoAt: null })
    await expect(designar()).rejects.toMatchObject({ statusCode: 409, message: MENSAJE_BLOQUEO_ETAPA_2 })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('motivo distinto de nuevo_cargo: 409', async () => {
    destino = destinoBase({}, { motivoConcurso: 'vacante' })
    await expect(designar()).rejects.toMatchObject({ statusCode: 409 })
    expect(txMock.concursoCph.update).not.toHaveBeenCalled()
    expect(txMock.ordenMeritoIntegrante.updateMany).not.toHaveBeenCalled()
  })

  it('concurso ya con salto o finalizado: 409', async () => {
    destino = destinoBase({ saltoOmAt: new Date(), subEstado: 'f-ifacs' })
    await expect(designar()).rejects.toMatchObject({ statusCode: 409 })
    destino = destinoBase({ estado: 'finalizado', resolucionDesignacion: 'R-1' })
    await expect(designar()).rejects.toMatchObject({ statusCode: 409 })
  })

  it('reserva vieja del mismo integrante: se convierte en salto', async () => {
    txMock.ordenMeritoIntegrante.updateMany.mockResolvedValue({ count: 0 })
    txMock.ordenMeritoIntegrante.findUnique.mockResolvedValue(integranteBase({ designado: true, concursoCphDesignadoId: 'cph1' }))
    await designar()
    expect(txMock.concursoCph.update.mock.calls[0][0].data.saltoOmIntegranteId).toBe('i1')
  })

  it('reserva de OTRO integrante en este concurso: 409', async () => {
    txMock.ordenMeritoIntegrante.findFirst.mockResolvedValueOnce({ id: 'otro' })
    await expect(designar()).rejects.toMatchObject({ statusCode: 409 })
    expect(txMock.ordenMeritoIntegrante.updateMany).not.toHaveBeenCalled()
  })

  it('rollback: si falla el update del concurso no se audita ni se avisa y el error se propaga', async () => {
    txMock.concursoCph.update.mockRejectedValue(new Error('boom'))
    await expect(designar()).rejects.toThrow('boom')
    expect(txMock.auditLog.create).not.toHaveBeenCalled()
    expect(subEstadoMock.recalcularSubEstadoCargo).not.toHaveBeenCalled()
    expect(notifMock.crearNotificacion).not.toHaveBeenCalled()
  })

  it('una notificación que lanza no revierte ni propaga', async () => {
    notifMock.crearNotificacion.mockRejectedValueOnce(new Error('sin aviso'))
    await expect(designar()).resolves.toEqual({ id: 'cph1', leidoDeNuevo: true })
    expect(txMock.auditLog.create).toHaveBeenCalledTimes(1)
  })
})

describe('listOmDisponiblesService', () => {
  const omVigente = (over: Record<string, unknown> = {}) => ({
    id: 'om1',
    concursoCphId: 'origen',
    especialidad: 'Enfermeros ATP',
    puesto: null,
    expediente: 'IF-1',
    estado: 'vigente',
    fechaPublicacion: new Date('2026-10-01'),
    fechaVencimiento: futuro,
    fechaProrroga: null,
    concursoCph: { id: 'origen', concurso: { cargo: { codigo: 'CPH-9', escalafonId: 'e1', hospital: { sigla: 'HZ', nombre: 'Hospital Z' } } } },
    integrantes: [
      { id: 'i1', posicion: 1, apellidoNombre: 'Perez, Juan', cuil: '20111111112', designado: false, anulado: false, concursoCphDesignadoId: null },
      { id: 'i2', posicion: 2, apellidoNombre: 'Gomez, Ana', cuil: '27222222223', designado: false, anulado: false, concursoCphDesignadoId: null },
    ],
    ...over,
  })
  beforeEach(() => {
    prismaMock.ordenMerito.findMany.mockResolvedValue([omVigente()])
    prismaMock.concursoCph.findMany.mockResolvedValue([{ id: 'origen', tipoGestion: 'centralizado', concurso: { cargo: { hospitalId: 'h1', escalafonId: 'e1' } } }])
    prismaMock.ordenMeritoIntegrante.findMany.mockResolvedValue([])
  })

  it('devuelve las OM elegibles con sus integrantes libres', async () => {
    const r = await listOmDisponiblesService('cph1')
    expect(r).toMatchObject({ habilitado: true, motivoNoHabilitado: null, tipoGestionDestino: 'centralizado' })
    expect(r.ordenes).toHaveLength(1)
    expect(r.ordenes[0]).toMatchObject({
      id: 'om1',
      concursoOrigen: { id: 'origen', codigo: 'CPH-9', tipoGestion: 'centralizado', hospital: { sigla: 'HZ', nombre: 'Hospital Z' } },
      especialidad: 'Enfermeros ATP',
      expediente: 'IF-1',
      advertencias: [],
    })
    expect(r.ordenes[0].integrantes).toEqual([
      { id: 'i1', posicion: 1, apellidoNombre: 'Perez, Juan', cuil: '20111111112' },
      { id: 'i2', posicion: 2, apellidoNombre: 'Gomez, Ana', cuil: '27222222223' },
    ])
  })

  it('saca a quien ya está designado (mismo CUIL) en otro concurso; sin personas disponibles no hay OM', async () => {
    prismaMock.ordenMeritoIntegrante.findMany.mockResolvedValue([{ cuil: '20111111112' }])
    const r1 = await listOmDisponiblesService('cph1')
    expect(r1.ordenes[0].integrantes.map((i: { id: string }) => i.id)).toEqual(['i2'])
    prismaMock.ordenMeritoIntegrante.findMany.mockResolvedValue([{ cuil: '20111111112' }, { cuil: '27222222223' }])
    const r2 = await listOmDisponiblesService('cph1')
    expect(r2.ordenes).toEqual([])
  })

  it('OM sin integrantes disponibles o vencida: no aparece', async () => {
    prismaMock.ordenMerito.findMany.mockResolvedValue([
      omVigente({ integrantes: [{ id: 'i1', posicion: 1, apellidoNombre: 'X', cuil: '1', designado: true, anulado: false, concursoCphDesignadoId: 'otro' }] }),
      omVigente({ id: 'om2', fechaVencimiento: pasado }),
    ])
    expect((await listOmDisponiblesService('cph1')).ordenes).toEqual([])
  })

  it('incluye a quien ya está reservado para este mismo concurso', async () => {
    prismaMock.ordenMerito.findMany.mockResolvedValue([
      omVigente({
        integrantes: [
          { id: 'i1', posicion: 1, apellidoNombre: 'Perez, Juan', cuil: '20111111112', designado: true, anulado: false, concursoCphDesignadoId: 'cph1' },
          { id: 'i2', posicion: 2, apellidoNombre: 'Gomez, Ana', cuil: '27222222223', designado: false, anulado: false, concursoCphDesignadoId: null },
        ],
      }),
    ])
    expect((await listOmDisponiblesService('cph1')).ordenes[0].integrantes).toHaveLength(2)
  })

  it('excluye la OM del propio concurso y la de otra especialidad', async () => {
    prismaMock.ordenMerito.findMany.mockResolvedValue([
      omVigente({ concursoCphId: 'cph1' }),
      omVigente({ id: 'om3', especialidad: 'Otra' }),
    ])
    expect((await listOmDisponiblesService('cph1')).ordenes).toEqual([])
  })

  it('OM de otro escalafón: se excluye; del mismo escalafón: se incluye', async () => {
    prismaMock.concursoCph.findMany.mockResolvedValue([{ id: 'origen', tipoGestion: 'centralizado', concurso: { cargo: { hospitalId: 'h1', escalafonId: 'e2' } } }])
    expect((await listOmDisponiblesService('cph1')).ordenes).toEqual([])
    prismaMock.concursoCph.findMany.mockResolvedValue([{ id: 'origen', tipoGestion: 'centralizado', concurso: { cargo: { hospitalId: 'h1', escalafonId: 'e1' } } }])
    expect((await listOmDisponiblesService('cph1')).ordenes).toHaveLength(1)
  })
  it('tipo de gestión distinto: la ofrece con advertencia', async () => {
    prismaMock.concursoCph.findMany.mockResolvedValue([{ id: 'origen', tipoGestion: 'descentralizado', concurso: { cargo: { hospitalId: 'h1', escalafonId: 'e1' } } }])
    const r = await listOmDisponiblesService('cph1')
    expect(r.ordenes[0].advertencias.length).toBeGreaterThan(0)
  })

  it('tipoGestion no guardado: habilitado=false y no consulta OM', async () => {
    destino = destinoBase({ tipoGestion: null })
    expect(await listOmDisponiblesService('cph1')).toEqual({
      habilitado: false, motivoNoHabilitado: 'sin_tipo_gestion', tipoGestionDestino: null, ordenes: [],
    })
    expect(prismaMock.ordenMerito.findMany).not.toHaveBeenCalled()
  })

  it('concurso sin especialidad: habilitado=false', async () => {
    destino = destinoBase({ especialidadSolicitada: null }, {
      cargo: { id: 'c1', codigo: 'CPH-1', hospitalId: 'h1', escalafonId: 'e1', literalPuesto: null, especialidadLegacy: null, especialidadPuesto: null },
    })
    expect((await listOmDisponiblesService('cph1')).motivoNoHabilitado).toBe('sin_especialidad')
  })

  it('motivo distinto de nuevo_cargo: habilitado=false', async () => {
    destino = destinoBase({}, { motivoConcurso: 'vacante' })
    expect(await listOmDisponiblesService('cph1')).toMatchObject({ habilitado: false, motivoNoHabilitado: 'solo_nuevo_cargo', ordenes: [] })
  })

  it('nuevo_cargo sin autorizar: 409', async () => {
    destino = destinoBase({}, { autorizadoAt: null })
    await expect(listOmDisponiblesService('cph1')).rejects.toMatchObject({ statusCode: 409, message: MENSAJE_BLOQUEO_ETAPA_2 })
  })

  it('concurso inexistente: 404', async () => {
    prismaMock.concursoCph.findUnique.mockResolvedValue(null)
    await expect(listOmDisponiblesService('nope')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('reverso del salto al liberar / rechazar', () => {
  const conSalto = () => destinoBase({ saltoOmAt: new Date(), saltoOmIntegranteId: 'i1', subEstado: 'f-ifacs', subEstado3: 'f-prox. a desig', personaDesignadaId: 'p1' })
  beforeEach(() => {
    prismaMock.ordenMeritoIntegrante.findUnique.mockResolvedValue({ id: 'i1', personaId: 'p1', cuil: '20111111112', designado: true, anulado: false, concursoCphDesignadoId: 'cph1', ordenMeritoId: 'om1' })
    txMock.ordenMeritoIntegrante.findUnique.mockResolvedValue({ personaId: 'p1', cuil: '20111111112' })
    txMock.ordenMeritoIntegrante.update.mockResolvedValue({})
    txMock.ordenMeritoIntegrante.count.mockResolvedValue(2)
  })

  it('liberar con salto: limpia saltoOmAt, persona y vuelve el sub-estado', async () => {
    destino = conSalto()
    await liberarIntegranteOmService('i1', 'u1')
    expect(prismaMock.$transaction.mock.calls[0][1]).toBe(TX_OPTS_LARGA)
    const data = txMock.concursoCph.update.mock.calls[0][0].data
    expect(data).toMatchObject({ saltoOmAt: null, saltoOmIntegranteId: null, personaDesignadaId: null, subEstado: 'b-sorteo jur' })
    expect(subEstadoMock.recalcularSubEstadoCargo).toHaveBeenCalledWith(txMock, 'c1')
    expect(txMock.auditLog.create.mock.calls[0][0].data).toMatchObject({ accion: 'revertir_salto_om', entidad: 'concurso_cph_om', entidadId: 'cph1', usuarioId: 'u1' })
  })

  it('rechazar con salto: también revierte y devuelve disponiblesRestantes', async () => {
    destino = conSalto()
    const r = await rechazarIntegranteOmService('i1', 'no aceptó', 'u1')
    expect(r).toEqual({ ok: true, disponiblesRestantes: 2 })
    expect(prismaMock.$transaction.mock.calls[0][1]).toBe(TX_OPTS_LARGA)
    expect(txMock.concursoCph.update.mock.calls[0][0].data).toMatchObject({ saltoOmAt: null, subEstado: 'b-sorteo jur' })
    expect(txMock.auditLog.create).toHaveBeenCalledTimes(1)
  })

  it('sin salto (reserva común): no cambia el comportamiento ni audita', async () => {
    destino = destinoBase({ personaDesignadaId: 'p1' }) // reserva vieja, sin salto
    await liberarIntegranteOmService('i1')
    // Solo el update de siempre (limpiar la persona designada), sin recalcular nada.
    expect(txMock.concursoCph.update).toHaveBeenCalledTimes(1)
    expect(txMock.concursoCph.update.mock.calls[0][0].data).toEqual({ personaDesignadaId: null })
    expect(txMock.auditLog.create).not.toHaveBeenCalled()
    expect(subEstadoMock.recalcularSubEstadoCargo).not.toHaveBeenCalled()
  })

  it('salto de OTRO integrante: no se toca', async () => {
    destino = { ...conSalto(), saltoOmIntegranteId: 'otro' }
    await rechazarIntegranteOmService('i1')
    expect(txMock.auditLog.create).not.toHaveBeenCalled()
  })
})

describe('permiso de Etapa 2 (tab:autorizacion-jurado)', () => {
  const guard = requirePermiso({ modulo: 'concursos-cph', accion: 'tab:autorizacion-jurado' })
  const llamar = (user: unknown) => guard({ user } as never, {} as never)

  it('rol sin el permiso: 403', async () => {
    prismaMock.rolePermiso.findFirst.mockResolvedValue(null)
    await expect(llamar({ roleId: 'r1', rolSlug: 'editor' })).rejects.toMatchObject({ statusCode: 403 })
    expect(prismaMock.rolePermiso.findFirst).toHaveBeenCalledWith({
      where: { roleId: 'r1', permiso: { OR: [{ modulo: 'concursos-cph', accion: 'tab:autorizacion-jurado' }] } },
    })
  })
  it('rol con el permiso: pasa', async () => {
    prismaMock.rolePermiso.findFirst.mockResolvedValue({ roleId: 'r1' })
    await expect(llamar({ roleId: 'r1', rolSlug: 'editor' })).resolves.toBeUndefined()
  })
  it('admin pasa por bypass sin consultar permisos', async () => {
    await expect(llamar({ roleId: 'r0', rolSlug: 'admin' })).resolves.toBeUndefined()
    expect(prismaMock.rolePermiso.findFirst).not.toHaveBeenCalled()
  })
})
