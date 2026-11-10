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
  notificarSgrasv: vi.fn(async () => undefined),
}))

// Cumple la regla de concursoActivo.regla (WHERE_CONCURSO_AUTORIZADO_PARA_CONTAR).
const cuenta = (f: Fila) =>
  f.concurso.motivoConcurso === null || f.concurso.motivoConcurso !== 'nuevo_cargo' || f.concurso.autorizadoAt !== null

function crearTx() {
  return {
    autorizacion: {
      update: vi.fn(async () => ({})),
      findUnique: vi.fn(async () => ({ id: 'aut1', estado: 'aprobada' })),
    },
    solicitudAlta: {
      findUnique: vi.fn(async () => ctx.solicitud),
      update: vi.fn(async ({ data }: { data: { estado: string; cargosCreadosIds: string[] } }) => {
        db.solicitud = { estado: data.estado, cargosCreadosIds: data.cargosCreadosIds }
      }),
    },
    usuario: { findUnique: vi.fn(async () => ({ role: { slug: 'rol_solicitante' } })) },
    cargo: {
      create: vi.fn(async ({ data }: { data: { subEstado: string } }) => {
        const c = { id: `cargo${++db.seq}`, subEstado: data.subEstado }
        db.cargos.push(c)
        return c
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id, estado: 'vigente', codigo: `COD-${where.id}`, literalPuesto: 'MEDICO', hospital: { sigla: 'HGAT' },
      })),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { subEstado: string } }) => {
        db.cargos.find((c) => c.id === where.id)!.subEstado = data.subEstado
      }),
    },
    ocupacion: { count: vi.fn(async () => 0) },
    concurso: {
      create: vi.fn(async ({ data }: { data: (typeof db.concursos)[number] }) => {
        if (db.fallarEnConcurso && db.concursos.length + 1 === db.fallarEnConcurso) throw new Error('falla al crear concurso')
        const c = { id: `conc${++db.seq}`, cargoId: data.cargoId, motivoConcurso: data.motivoConcurso, autorizadoAt: null, expediente: data.expediente }
        db.concursos.push(c)
        return c
      }),
    },
    concursoCph: {
      findFirst: vi.fn(async ({ where }: { where: { cargoId: string } }) =>
        db.cph.find((f) => f.cargoId === where.cargoId && f.estado !== 'finalizado') ?? null),
      count: vi.fn(async ({ where }: { where: { cargoId: string } }) =>
        db.cph.filter((f) => f.cargoId === where.cargoId && !['finalizado'].includes(f.estado) && cuenta(f)).length),
      create: vi.fn(async ({ data }: { data: { cargoId: string; concursoId: string; estado: string } }) => {
        const c = db.concursos.find((x) => x.id === data.concursoId)!
        db.cph.push({ cargoId: data.cargoId, estado: data.estado, concurso: c })
        return { id: `cph-${data.concursoId}`, ...data }
      }),
    },
    concursoCeetps: {
      findFirst: vi.fn(async ({ where }: { where: { cargoId: string } }) =>
        db.ceetps.find((f) => f.cargoId === where.cargoId && !['finalizado', 'desierto'].includes(f.estado)) ?? null),
      count: vi.fn(async ({ where }: { where: { cargoId: string } }) =>
        db.ceetps.filter((f) => f.cargoId === where.cargoId && !['finalizado', 'desierto'].includes(f.estado) && cuenta(f)).length),
      create: vi.fn(async ({ data }: { data: { cargoId: string; concursoId: string; estado?: string } }) => {
        const c = db.concursos.find((x) => x.id === data.concursoId)!
        db.ceetps.push({ cargoId: data.cargoId, estado: data.estado ?? 'sin_autorizar', concurso: c })
        return { id: `ceetps-${data.concursoId}`, ...data }
      }),
    },
  }
}

const prismaMock = vi.hoisted(() => ({
  autorizacion: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('../shared/prisma.js', () => ({ prisma: prismaMock }))
vi.mock('../modules/notificaciones/notificaciones.service.js', () => ({ crearNotificacion: vi.fn(async () => ({})) }))
vi.mock('../modules/notificaciones/notificarSgrasv.js', () => ({ notificarSgrasvYHijos: ctx.notificarSgrasv }))
vi.mock('../modules/tareas/tareas.service.js', () => ({ crearTareaPendiente: vi.fn(), mensajeTareaRechazo: vi.fn() }))
vi.mock('../shared/codigoCargo.js', () => ({
  prefijoDeCargo: vi.fn(() => 'PFX'),
  siguienteCodigoCargo: vi.fn(async () => `PFX-${Math.random()}`),
  prefijoRemplazante: vi.fn(),
}))
vi.mock('../shared/crCph.js', () => ({
  normalizarCrCphId: vi.fn(async (_tx: unknown, id: string) => id),
  normalizarCrCphDeCargo: vi.fn(async () => undefined),
}))

const { aprobarAutorizacionService } = await import('../modules/autorizaciones/autorizaciones.service.js')

function solicitud(opts: { cr: string | null; cantidad: number; literal?: string; expediente?: string | null }) {
  return {
    id: 'sol1', hospitalId: 'h1', escalafonId: 'esc1', codigoRegistroId: 'cr1', puestoCargoId: null,
    especialidadPuestoId: null, literalPuesto: opts.literal ?? 'MEDICO', especialidad: null, agrupador: null,
    unificadorPuesto: null, regimen: null, expediente: opts.expediente === undefined ? 'EX-1' : opts.expediente,
    desde: null, cantidad: opts.cantidad,
    hospital: { sigla: 'HGAT' }, escalafon: { nombre: 'CPH' }, codigoRegistro: opts.cr ? { codigo: opts.cr } : null, puestoCargo: null,
  }
}

const autAlta = { id: 'aut1', tipo: 'alta_cargo', estado: 'pendiente', referenciaId: 'sol1', resolverPorRolSlug: 'r', solicitadoPorId: 'u0' }

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(db, { cargos: [], concursos: [], cph: [], ceetps: [], seq: 0, fallarEnConcurso: 0 })
  db.solicitud = { estado: 'pendiente', cargosCreadosIds: [] }
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
    const r = (await aprobarAutorizacionService('aut1', 'u1', 'r')) as Record<string, number>
    expect(r).toMatchObject({ concursosCreados: 0, concursosSinTipo: 2 })
    expect(db.cargos).toHaveLength(2)
    expect(db.concursos).toHaveLength(0)
    expect((db.solicitud as { estado: string }).estado).toBe('aprobada')
    expect(ctx.notificarSgrasv).not.toHaveBeenCalled()
  })

  it('solicitud sin código de registro: tipo null, sin concurso', async () => {
    ctx.solicitud = solicitud({ cr: null, cantidad: 1 })
    const r = (await aprobarAutorizacionService('aut1', 'u1', 'r')) as Record<string, number>
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
    const r = (await aprobarAutorizacionService('aut1', 'u1', 'r')) as Record<string, number>
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
      expect.anything(),
    )
  })
})
