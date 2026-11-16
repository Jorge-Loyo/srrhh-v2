import { describe, it, expect, vi, beforeEach } from 'vitest'
// =============================================================================
// Paso 3 — al aprobar un alta_cargo se crea AUTOMÁTICAMENTE un concurso "no
// iniciado" (nuevo_cargo, sin autorizar) por CADA cargo nuevo, en la misma
// transacción. Se usan los servicios REALES (autorizaciones, concursos y el
// recálculo de sub_estado) sobre una BD en memoria con rollback simulado.
// =============================================================================
interface Fila { cargoId: string; estado: string; concurso: { motivoConcurso: string | null; autorizadoAt: Date | null } }
const db = vi.hoisted(() => ({
  cargos: [] as { id: string; subEstado: string | null }[],
  concursos: [] as { id: string; cargoId: string; motivoConcurso: string | null; autorizadoAt: Date | null; expediente: string | null }[],
  cph: [] as Fila[],
  ceetps: [] as Fila[],
  solicitud: { estado: 'pendiente', cargosCreadosIds: [] as string[] },
  seq: 0,
  /** Hace fallar la creación del N-ésimo concurso (1-based) para probar el rollback. */
  fallarEnConcurso: 0,
}))
const ctx = vi.hoisted(() => ({
  solicitud: null as unknown,
  /** CR que tiene la carrera (escalafón) de la solicitud, para la deducción por carrera. */
  crsCarrera: [] as { id: string; codigo: string; escalafonId: string }[],
  /** Código del escalafón (Neon) de la solicitud y CR por código, para el fallback sin CR propios. */
  escCodigo: null as string | null,
  crsPorCodigo: [] as { id: string; codigo: string }[],
  /** Último codigoRegistroId guardado en la solicitud / usado al crear cargos. */
  solicitudCrId: undefined as string | undefined,
  cargoCrIds: [] as (string | null)[],
  notificarSgrasv: vi.fn(async () => undefined),
}))

// Cumple la regla de concursoActivo.regla (WHERE_CONCURSO_AUTORIZADO_PARA_CONTAR).
const cuenta = (f: Fila) =>
  f.concurso.motivoConcurso === null || f.concurso.motivoConcurso !== 'nuevo_cargo' || f.concurso.autorizadoAt !== null

/** Contador de consultas: cada método del tx simulado suma 1 (para acotar el nº de round-trips). */
const q = vi.hoisted(() => ({ n: 0 }))
function contar<T extends Record<string, Record<string, (...a: never[]) => unknown>>>(tx: T): T {
  for (const modelo of Object.values(tx)) {
    for (const [k, fn] of Object.entries(modelo)) {
      modelo[k] = ((...a: never[]) => { q.n++; return fn(...a) }) as never
    }
  }
  return tx
}
function crearTx() {
  return contar({
    autorizacion: {
      update: vi.fn(async () => ({})),
      findUnique: vi.fn(async () => ({ id: 'aut1', estado: 'aprobada' })),
    },
    solicitudAlta: {
      findUnique: vi.fn(async () => ctx.solicitud),
      update: vi.fn(async ({ data }: { data: { estado: string; cargosCreadosIds: string[]; codigoRegistroId?: string } }) => {
        ctx.solicitudCrId = data.codigoRegistroId
        db.solicitud = { estado: data.estado, cargosCreadosIds: data.cargosCreadosIds }
      }),
    },
    codigoRegistro: {
      findMany: vi.fn(async () => ctx.crsCarrera),
      findUnique: vi.fn(async ({ where }: { where: { codigo: string } }) => ctx.crsPorCodigo.find((c) => c.codigo === where.codigo) ?? null),
    },
    escalafon: { findUnique: vi.fn(async () => (ctx.escCodigo ? { codigo: ctx.escCodigo } : null)) },
    usuario: { findUnique: vi.fn(async () => ({ role: { slug: 'rol_solicitante' } })) },
    cargo: {
      createMany: vi.fn(async ({ data }: { data: { id: string; subEstado: string; codigoRegistroId: string | null }[] }) => {
        for (const d of data) {
          ctx.cargoCrIds.push(d.codigoRegistroId)
          db.cargos.push({ id: d.id, subEstado: d.subEstado })
        }
        return { count: data.length }
      }),
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        db.cargos.filter((c) => where.id.in.includes(c.id)).map((c) => ({ id: c.id, estado: 'vigente' }))),
      updateMany: vi.fn(async ({ where, data }: { where: { id: { in: string[] } }; data: { subEstado: string } }) => {
        for (const c of db.cargos) if (where.id.in.includes(c.id)) c.subEstado = data.subEstado
        return { count: where.id.in.length }
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id, estado: 'vigente', codigo: `COD-${where.id}`, literalPuesto: 'MEDICO', hospital: { sigla: 'HGAT' },
      })),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { subEstado: string } }) => {
        db.cargos.find((c) => c.id === where.id)!.subEstado = data.subEstado
      }),
    },
    ocupacion: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
    concurso: {
      create: vi.fn(async ({ data }: { data: (typeof db.concursos)[number] }) => {
        if (db.fallarEnConcurso && db.concursos.length + 1 === db.fallarEnConcurso) throw new Error('falla al crear concurso')
        const c = { id: `conc${++db.seq}`, cargoId: data.cargoId, motivoConcurso: data.motivoConcurso, autorizadoAt: null, expediente: data.expediente }
        db.concursos.push(c)
        return c
      }),
    },
    concursoCph: {
      findMany: vi.fn(async ({ where }: { where: { cargoId: { in: string[] }; concurso?: unknown } }) =>
        db.cph.filter((f) => where.cargoId.in.includes(f.cargoId) && (!where.concurso || cuenta(f)) && f.estado !== 'finalizado')),
      count: vi.fn(async ({ where }: { where: { cargoId: string } }) =>
        db.cph.filter((f) => f.cargoId === where.cargoId && !['finalizado'].includes(f.estado) && cuenta(f)).length),
      create: vi.fn(async ({ data }: { data: { cargoId: string; concursoId: string; estado: string } }) => {
        const c = db.concursos.find((x) => x.id === data.concursoId)!
        db.cph.push({ cargoId: data.cargoId, estado: data.estado, concurso: c })
        return { id: `cph-${data.concursoId}`, ...data }
      }),
    },
    concursoCeetps: {
      findMany: vi.fn(async ({ where }: { where: { cargoId: { in: string[] }; concurso?: unknown } }) =>
        db.ceetps.filter((f) => where.cargoId.in.includes(f.cargoId) && (!where.concurso || cuenta(f)) && !['finalizado', 'desierto'].includes(f.estado))),
      count: vi.fn(async ({ where }: { where: { cargoId: string } }) =>
        db.ceetps.filter((f) => f.cargoId === where.cargoId && !['finalizado', 'desierto'].includes(f.estado) && cuenta(f)).length),
      create: vi.fn(async ({ data }: { data: { cargoId: string; concursoId: string; estado?: string } }) => {
        const c = db.concursos.find((x) => x.id === data.concursoId)!
        db.ceetps.push({ cargoId: data.cargoId, estado: data.estado ?? 'sin_autorizar', concurso: c })
        return { id: `ceetps-${data.concursoId}`, ...data }
      }),
    },
  })
}

const prismaMock = vi.hoisted(() => ({
  autorizacion: { findUnique: vi.fn() },
  usuario: { findUnique: vi.fn(async () => ({ role: { slug: 'rol_solicitante' } })) },
  $transaction: vi.fn(),
}))
vi.mock('../shared/prisma.js', () => ({ prisma: prismaMock }))
vi.mock('../modules/notificaciones/notificaciones.service.js', () => ({ crearNotificacion: vi.fn(async () => ({})) }))
vi.mock('../modules/notificaciones/notificarSgrasv.js', () => ({ notificarSgrasvYHijos: ctx.notificarSgrasv }))
vi.mock('../modules/tareas/tareas.service.js', () => ({ crearTareaPendiente: vi.fn(), mensajeTareaRechazo: vi.fn() }))
vi.mock('../shared/codigoCargo.js', () => ({
  prefijoDeCargo: vi.fn(() => 'PFX'),
  maxSecuencialCargo: vi.fn(async () => 0),
  prefijoRemplazante: vi.fn(),
}))
// Ids de cargo deterministas (cargo1, cargo2, ...): el alta los genera en memoria para el createMany.
vi.mock('node:crypto', async (orig) => ({ ...(await orig<typeof import('node:crypto')>()), randomUUID: () => `cargo${++db.seq}` }))
vi.mock('../shared/crCph.js', () => ({
  normalizarCrCphId: vi.fn(async (_tx: unknown, id: string) => id),
  normalizarCrCphDeCargo: vi.fn(async () => undefined),
}))

const { TX_OPTS_LARGA } = await import('../shared/txOpts.js')
const { aprobarAutorizacionService } = await import('../modules/autorizaciones/autorizaciones.service.js')

function solicitud(opts: { cr: string | null; cantidad: number; literal?: string; expediente?: string | null; sinCrId?: boolean }) {
  return {
    id: 'sol1', hospitalId: 'h1', escalafonId: 'esc1', codigoRegistroId: opts.sinCrId ? null : 'cr1', puestoCargoId: null,
    especialidadPuestoId: null, literalPuesto: opts.literal ?? 'MEDICO', especialidad: null, agrupador: null,
    unificadorPuesto: null, regimen: null, expediente: opts.expediente === undefined ? 'EX-1' : opts.expediente,
    desde: null, cantidad: opts.cantidad,
    hospital: { sigla: 'HGAT' }, escalafon: { nombre: 'CPH' }, codigoRegistro: opts.cr ? { codigo: opts.cr } : null, puestoCargo: null,
    // La aprobación propaga las etiquetas de la solicitud a los cargos creados.
    etiquetas: [] as { etiquetaId: string }[],
  }
}

const autAlta = { id: 'aut1', tipo: 'alta_cargo', estado: 'pendiente', referenciaId: 'sol1', resolverPorRolSlug: 'r', solicitadoPorId: 'u0' }

beforeEach(() => {
  vi.clearAllMocks()
  q.n = 0
  Object.assign(db, { cargos: [], concursos: [], cph: [], ceetps: [], seq: 0, fallarEnConcurso: 0 })
  db.solicitud = { estado: 'pendiente', cargosCreadosIds: [] }
  ctx.crsCarrera = []; ctx.escCodigo = null; ctx.crsPorCodigo = []; ctx.solicitudCrId = undefined; ctx.cargoCrIds = []
  prismaMock.autorizacion.findUnique.mockResolvedValue(autAlta)
  // $transaction con rollback simulado: si el callback falla, se restaura el estado.
  prismaMock.$transaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => {
    const snap = structuredClone({ cargos: db.cargos, concursos: db.concursos, solicitud: db.solicitud })
    const snapCph = db.cph.map((f) => ({ ...f }))
    const snapCe = db.ceetps.map((f) => ({ ...f }))
    try {
      return await fn(crearTx())
    } catch (e) {
      db.cargos = snap.cargos; db.concursos = snap.concursos; db.solicitud = snap.solicitud
      db.cph = snapCph; db.ceetps = snapCe
      throw e
    }
  })
})

describe('aprobar alta_cargo — concursos automáticos (Paso 3)', () => {
  it('1 cargo CPH: crea 1 concurso no iniciado nuevo_cargo, sin autorizar, con el expediente del alta', async () => {
    ctx.solicitud = solicitud({ cr: '37', cantidad: 1 })
    const r = (await aprobarAutorizacionService('aut1', 'u1', 'r')) as { concursosCreados: number; concursosSinTipo: number }
    expect(r).toMatchObject({ concursosCreados: 1, concursosSinTipo: 0, concursosYaExistentes: 0 })
    expect(db.cargos).toHaveLength(1)
    expect(db.concursos).toEqual([
      expect.objectContaining({ cargoId: 'cargo1', motivoConcurso: 'nuevo_cargo', autorizadoAt: null, expediente: 'EX-1' }),
    ])
    expect(db.cph).toHaveLength(1)
    expect(db.cph[0]!.estado).toBe('no_iniciado')
  })

  it('varios cargos (cantidad 3): TODOS reciben su concurso, no solo el primero', async () => {
    ctx.solicitud = solicitud({ cr: '37', cantidad: 3 })
    const r = (await aprobarAutorizacionService('aut1', 'u1', 'r')) as { concursosCreados: number }
    expect(r.concursosCreados).toBe(3)
    const ids = db.cargos.map((c) => c.id)
    expect(db.concursos.map((c) => c.cargoId).sort()).toEqual([...ids].sort())
    expect(db.cph).toHaveLength(3)
    expect((db.solicitud as { cargosCreadosIds: string[] }).cargosCreadosIds).toEqual(ids)
  })

  it('CEETPS: crea el concurso en concursos_ceetps (sin autorizar)', async () => {
    ctx.solicitud = solicitud({ cr: '85', cantidad: 2 })
    const r = (await aprobarAutorizacionService('aut1', 'u1', 'r')) as { concursosCreados: number }
    expect(r.concursosCreados).toBe(2)
    expect(db.ceetps).toHaveLength(2)
    expect(db.cph).toHaveLength(0)
    expect(db.ceetps.every((f) => f.estado === 'sin_autorizar')).toBe(true)
  })

  it('lote mixto: cada solicitud crea el suyo en la tabla de su tipo (CPH y CEETPS)', async () => {
    ctx.solicitud = solicitud({ cr: '37', cantidad: 1 })
    await aprobarAutorizacionService('aut1', 'u1', 'r')
    ctx.solicitud = solicitud({ cr: '87', cantidad: 1 })
    await aprobarAutorizacionService('aut1', 'u1', 'r')
    expect(db.cph).toHaveLength(1)
    expect(db.ceetps).toHaveLength(1)
    expect(db.concursos).toHaveLength(2)
  })

  it('cargo con tipo null (CR fuera de CPH/CEETPS): no crea concurso, no rompe y lo informa', async () => {
    ctx.solicitud = solicitud({ cr: '99', cantidad: 2 })
    const r = (await aprobarAutorizacionService('aut1', 'u1', 'r')) as unknown as Record<string, number>
    expect(r).toMatchObject({ concursosCreados: 0, concursosSinTipo: 2 })
    expect(db.cargos).toHaveLength(2)
    expect(db.concursos).toHaveLength(0)
    expect((db.solicitud as { estado: string }).estado).toBe('aprobada')
    expect(ctx.notificarSgrasv).not.toHaveBeenCalled()
  })

  it('solicitud sin código de registro: tipo null, sin concurso', async () => {
    ctx.solicitud = solicitud({ cr: null, cantidad: 1 })
    const r = (await aprobarAutorizacionService('aut1', 'u1', 'r')) as unknown as Record<string, number>
    expect(r).toMatchObject({ concursosCreados: 0, concursosSinTipo: 1 })
  })

  it('el cargo NO pasa a "concurso": queda vacante mientras autorizado_at sea NULL', async () => {
    ctx.solicitud = solicitud({ cr: '37', cantidad: 2 })
    await aprobarAutorizacionService('aut1', 'u1', 'r')
    expect(db.cargos.map((c) => c.subEstado)).toEqual(['vacante', 'vacante'])
    // Al autorizarse (autorizado_at != NULL) la misma regla sí lo cuenta.
    db.concursos[0]!.autorizadoAt = new Date()
    expect(db.cph.filter(cuenta).map((f) => f.cargoId)).toEqual(['cargo1'])
  })

  it('idempotencia: si el cargo ya tiene un concurso abierto no crea otro', async () => {
    ctx.solicitud = solicitud({ cr: '37', cantidad: 1 })
    // Un concurso abierto preexistente sobre el cargo que se va a crear (cargo1).
    db.cph.push({ cargoId: 'cargo1', estado: 'activo', concurso: { motivoConcurso: 'nuevo_cargo', autorizadoAt: null } })
    const r = (await aprobarAutorizacionService('aut1', 'u1', 'r')) as unknown as Record<string, number>
    expect(r).toMatchObject({ concursosCreados: 0, concursosYaExistentes: 1 })
    expect(db.concursos).toHaveLength(0)
  })

  it('aprobar dos veces: la segunda se rechaza y no duplica concursos', async () => {
    ctx.solicitud = solicitud({ cr: '37', cantidad: 1 })
    await aprobarAutorizacionService('aut1', 'u1', 'r')
    prismaMock.autorizacion.findUnique.mockResolvedValue({ ...autAlta, estado: 'aprobada' })
    await expect(aprobarAutorizacionService('aut1', 'u1', 'r')).rejects.toThrow(/ya fue resuelta/)
    expect(db.concursos).toHaveLength(1)
  })

  it('rollback: si falla la creación de un concurso, no queda nada a medias (ni cargos ni solicitud aprobada)', async () => {
    ctx.solicitud = solicitud({ cr: '37', cantidad: 3 })
    db.fallarEnConcurso = 2
    await expect(aprobarAutorizacionService('aut1', 'u1', 'r')).rejects.toThrow('falla al crear concurso')
    expect(db.cargos).toHaveLength(0)
    expect(db.concursos).toHaveLength(0)
    expect(db.cph).toHaveLength(0)
    expect((db.solicitud as { estado: string }).estado).toBe('pendiente')
  })

  it('notifica UNA vez a SGRASV y sus hijos con el resumen (no una por concurso)', async () => {
    ctx.solicitud = solicitud({ cr: '37', cantidad: 3 })
    await aprobarAutorizacionService('aut1', 'u1', 'r')
    expect(ctx.notificarSgrasv).toHaveBeenCalledTimes(1)
    expect(ctx.notificarSgrasv).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'concurso_iniciado', mensaje: expect.stringContaining('3 concurso(s) CPH') }),
    )
  })
  it('los avisos corren DESPUÉS del commit: un fallo al notificar no revierte el alta', async () => {
    ctx.solicitud = solicitud({ cr: '37', cantidad: 2 })
    ctx.notificarSgrasv.mockRejectedValueOnce(new Error('falla notificar'))
    const r = (await aprobarAutorizacionService('aut1', 'u1', 'r')) as { concursosCreados: number }
    expect(r.concursosCreados).toBe(2)
    expect(db.cargos).toHaveLength(2)
    expect((db.solicitud as { estado: string }).estado).toBe('aprobada')
  })
})
describe('aprobar alta_cargo — transacción larga (timeout "Transaction not found")', () => {
  it('pasa timeout y maxWait explícitos y generosos a $transaction', async () => {
    ctx.solicitud = solicitud({ cr: '37', cantidad: 1 })
    await aprobarAutorizacionService('aut1', 'u1', 'r')
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), TX_OPTS_LARGA)
    expect(TX_OPTS_LARGA.timeout).toBeGreaterThanOrEqual(60_000)
    expect(TX_OPTS_LARGA.maxWait).toBeGreaterThanOrEqual(10_000)
  })
  const consultas = async (cantidad: number, cr: string) => {
    q.n = 0
    ctx.solicitud = solicitud({ cr, cantidad })
    await aprobarAutorizacionService('aut1', 'u1', 'r')
    return q.n
  }
  it('con 20 cargos solo crece por cargo lo imprescindible: las 2 escrituras del concurso (antes ~10 por cargo)', async () => {
    const n1 = await consultas(1, '37')
    db.cargos = []; db.concursos = []; db.cph = []; db.seq = 0; ctx.cargoCrIds = []
    const n20 = await consultas(20, '37')
    expect(db.cph).toHaveLength(20)
    // Por cargo: concurso + concursoCph (2); el resto es constante por lote.
    expect((n20 - n1) / 19).toBe(2)
    expect(n20).toBeLessThanOrEqual(2 * 20 + 15)
  })
  it('CEETPS con 20 cargos: una sola transacción y todos los cargos quedan vacantes', async () => {
    ctx.solicitud = solicitud({ cr: '85', cantidad: 20 })
    await aprobarAutorizacionService('aut1', 'u1', 'r')
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(db.ceetps).toHaveLength(20)
    expect(db.cargos.every((c) => c.subEstado === 'vacante')).toBe(true)
  })
})

describe('aprobar alta_cargo — CR deducido de la carrera cuando la solicitud no lo trae', () => {
  const aprobar = () => aprobarAutorizacionService('aut1', 'u1', 'r') as Promise<{ concursosCreados: number; concursosSinTipo: number }>
  it('carrera CPH (CR 22 y 37): deduce el 37, crea concurso CPH y guarda el CR en solicitud y cargo', async () => {
    ctx.solicitud = solicitud({ cr: null, sinCrId: true, cantidad: 2 })
    ctx.crsCarrera = [{ id: 'cr22', codigo: '22', escalafonId: 'esc1' }, { id: 'cr37', codigo: '37', escalafonId: 'esc1' }]
    const r = await aprobar()
    expect(r).toMatchObject({ concursosCreados: 2, concursosSinTipo: 0 })
    expect(db.cph).toHaveLength(2)
    expect(db.cph.every((f) => f.estado === 'no_iniciado' && f.concurso.motivoConcurso === 'nuevo_cargo' && f.concurso.autorizadoAt === null)).toBe(true)
    expect(ctx.cargoCrIds).toEqual(['cr37', 'cr37'])
    expect(ctx.solicitudCrId).toBe('cr37')
  })
  it('carrera CEETPS (enfermería, CR 87): crea concurso CEETPS', async () => {
    ctx.solicitud = solicitud({ cr: null, sinCrId: true, cantidad: 1, literal: 'Enfermero' })
    ctx.crsCarrera = [{ id: 'cr87', codigo: '87', escalafonId: 'esc1' }]
    const r = await aprobar()
    expect(r.concursosCreados).toBe(1)
    expect(db.ceetps).toHaveLength(1)
    expect(db.cph).toHaveLength(0)
    expect(ctx.cargoCrIds).toEqual(['cr87'])
  })
  it('carrera sin mapeo (CR 19 / 83 fuera de Anexo II): sin concurso, sin romper, cargo sin CR', async () => {
    ctx.solicitud = solicitud({ cr: null, sinCrId: true, cantidad: 1, literal: 'Administrativo' })
    ctx.crsCarrera = [{ id: 'cr83', codigo: '83', escalafonId: 'esc1' }, { id: 'cr19', codigo: '19', escalafonId: 'esc1' }]
    const r = await aprobar()
    expect(r).toMatchObject({ concursosCreados: 0, concursosSinTipo: 1 })
    expect(db.cargos).toHaveLength(1)
    expect(ctx.cargoCrIds).toEqual([null])
    expect(ctx.solicitudCrId).toBeUndefined()
  })
  it('escalafón 87 SIN CR en codigos_registro: cae al código del escalafón => CEETPS, CR 87', async () => {
    ctx.solicitud = solicitud({ cr: null, sinCrId: true, cantidad: 1, literal: 'Enfermero' })
    ctx.escCodigo = '87'
    ctx.crsPorCodigo = [{ id: 'cr87', codigo: '87' }]
    const r = await aprobar()
    expect(r.concursosCreados).toBe(1)
    expect(db.ceetps).toHaveLength(1)
    expect(ctx.cargoCrIds).toEqual(['cr87'])
  })
  it('escalafón 85 sin CR propios => CEETPS, CR 85; escalafón 37 => CPH, CR 37', async () => {
    ctx.solicitud = solicitud({ cr: null, sinCrId: true, cantidad: 1, literal: 'Técnico' })
    ctx.escCodigo = '85'
    ctx.crsPorCodigo = [{ id: 'cr85', codigo: '85' }]
    await aprobar()
    expect(db.ceetps).toHaveLength(1)
    expect(ctx.cargoCrIds).toEqual(['cr85'])
  })
  it('escalafón 37 sin CR propios => CPH, CR 37', async () => {
    ctx.solicitud = solicitud({ cr: null, sinCrId: true, cantidad: 1 })
    ctx.escCodigo = '37'
    ctx.crsPorCodigo = [{ id: 'cr37', codigo: '37' }]
    await aprobar()
    expect(db.cph).toHaveLength(1)
    expect(ctx.cargoCrIds).toEqual(['cr37'])
  })
  it('escalafón no gestionado (24) sin CR propios: sin concurso', async () => {
    ctx.solicitud = solicitud({ cr: null, sinCrId: true, cantidad: 1 })
    ctx.escCodigo = '24'
    const r = await aprobar()
    expect(r).toMatchObject({ concursosCreados: 0, concursosSinTipo: 1 })
  })
  it('carrera sin códigos de registro: sin concurso, sin romper', async () => {
    ctx.solicitud = solicitud({ cr: null, sinCrId: true, cantidad: 1 })
    const r = await aprobar()
    expect(r).toMatchObject({ concursosCreados: 0, concursosSinTipo: 1 })
  })
  it('CR explícito tiene prioridad: no se consulta ni se pisa con el de la carrera', async () => {
    ctx.solicitud = solicitud({ cr: '85', cantidad: 1 })
    ctx.crsCarrera = [{ id: 'cr37', codigo: '37', escalafonId: 'esc1' }]
    const r = await aprobar()
    expect(r.concursosCreados).toBe(1)
    expect(db.ceetps).toHaveLength(1)
    expect(db.cph).toHaveLength(0)
    expect(ctx.cargoCrIds).toEqual(['cr1'])
    expect(ctx.solicitudCrId).toBeUndefined()
  })
})
