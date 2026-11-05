import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// El módulo padron no tiene tests que mockeen Prisma (los *.test.ts del padrón
// testean helpers puros). Acá sí hace falta un doble de Prisma para ejercitar
// getPendientesService (query §4.2) y la Opción A §5.3 (padron_historico + KPI
// del mes de gestión) sin tocar la BD (el backend local apunta a Neon prod).
//
// Se mockean: el cliente Prisma compartido y los helpers de resolución de
// puesto/código que aprobarDiffNuevoService usa, para poder recorrer su camino
// feliz (crear persona + cargo + ocupación) de forma determinística.
// ─────────────────────────────────────────────────────────────────────────────

// Mock del cliente Prisma: cada test setea los retornos que necesita.
// vi.hoisted asegura que prismaMock exista cuando el factory de vi.mock (que se
// hoistea al tope del archivo) lo referencia.
const prismaMock = vi.hoisted(() => ({
  padronDiff: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  padronSnapshot: { findUnique: vi.fn() },
  baja: { findMany: vi.fn() },
  cargo: { findMany: vi.fn(), findUnique: vi.fn() },
  persona: { findMany: vi.fn() },
  hospital: { findMany: vi.fn() },
  codigoRegistro: { findMany: vi.fn() },
  escalafon: { findMany: vi.fn() },
  concursoCph: { findMany: vi.fn() },
  $transaction: vi.fn(),
}))

vi.mock('../../shared/prisma.js', () => ({ prisma: prismaMock }))

// Helpers de resolución de puesto/código — se neutralizan para el camino feliz.
vi.mock('./../padron/resolverPuestoCargo.js', () => ({
  cargarCatalogoPuestos: vi.fn().mockResolvedValue({ puestos: new Map(), especialidades: new Map() }),
  resolverPuestoCargoId: vi.fn().mockResolvedValue({ id: 'puesto-1', nombre: 'Puesto 1' }),
  resolverEspecialidadPuestoId: vi.fn().mockResolvedValue(null),
  especialidadSialReal: vi.fn().mockReturnValue(null),
  normPuestoKey: (s: string) => s,
}))

vi.mock('./../padron/reconciliarConduccion.js', () => ({
  reconciliarCargoConduccionVacante: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../shared/codigoCargo.js', () => ({
  prefijoDeCargo: vi.fn().mockReturnValue('POF'),
  maxSecuencialCargo: vi.fn().mockResolvedValue(0),
  siguienteCodigoCargo: vi.fn().mockResolvedValue('POF-000001'),
}))

// Importaciones DESPUÉS de los mocks (ESM: los vi.mock se hoistean).
import { getPendientesService } from './incidencias.service.js'
import { aprobarDiffNuevoService } from '../padron/padron.service.js'

const diffNuevo = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'diff-1',
  snapshotId: 'snap-1',
  idSialRol: 'ROL-1',
  tipo: 'nuevo',
  campo: null,
  aprobado: null,
  valorNuevo: JSON.stringify({
    id_sial: 'SIAL-1',
    cuil_y_rol: '20111111113-1',
    ayn: 'Perez, Juan',
    siglas: 'HOSP',
    escalafon: 'Profesional',
    literal_puesto: 'Médico',
    // Código gestionable pleno (CPH 37): el diff entra a la cola "SIAL sin cargo".
    // Ver incidencias.gestionable.ts (regla PLENOS/83+Anexo II, FASE 1).
    codigo_de_registro: '37',
    especialidad: 'Clínica',
    situacion_de_revista: 'planta',
    estado: 'A',
  }),
  snapshot: { fechaAsignada: new Date('2026-01-15') },
  ...over,
})

// Configura el escenario de getPendientesService con UN diff nuevo pendiente.
// `padronDiff.findMany` lo usan dos consumidores con WHERE distinto: la query
// principal (where.snapshot) y diagnosticarDiffsNuevosService (where.snapshotId);
// se ramifica por la forma del WHERE para devolver la forma correcta a cada uno.
function setupPendientesUnDiff(opts: { bajas?: Array<{ persona: { cuil: string } }> } = {}) {
  prismaMock.padronDiff.findMany.mockImplementation((args: { where?: Record<string, unknown> }) => {
    const where = args?.where ?? {}
    if ('snapshotId' in where) {
      // diagnosticarDiffsNuevosService
      return Promise.resolve([
        { id: 'diff-1', idSialRol: 'ROL-1', valorNuevo: diffNuevo().valorNuevo },
      ])
    }
    // query principal §4.2
    return Promise.resolve([diffNuevo()])
  })
  prismaMock.padronSnapshot.findUnique.mockResolvedValue({ id: 'snap-1', estado: 'aprobado' })
  // lookups del diagnóstico (todos vacíos → clasificacion nuevo_de_0, sin concurso)
  prismaMock.cargo.findMany.mockResolvedValue([])
  prismaMock.persona.findMany.mockResolvedValue([])
  prismaMock.hospital.findMany.mockResolvedValue([])
  prismaMock.codigoRegistro.findMany.mockResolvedValue([])
  prismaMock.escalafon.findMany.mockResolvedValue([])
  prismaMock.concursoCph.findMany.mockResolvedValue([])
  prismaMock.baja.findMany.mockResolvedValue(opts.bajas ?? [])
}

// Variante: la query principal devuelve los diffs que se le pasen (para
// ejercitar el filtro gestionable). El diagnóstico se neutraliza a vacío.
function setupPendientesConDiffs(diffs: Array<ReturnType<typeof diffNuevo>>) {
  prismaMock.padronDiff.findMany.mockImplementation((args: { where?: Record<string, unknown> }) => {
    const where = args?.where ?? {}
    if ('snapshotId' in where) {
      return Promise.resolve(
        diffs.map((d) => ({ id: d.id, idSialRol: d.idSialRol, valorNuevo: d.valorNuevo })),
      )
    }
    return Promise.resolve(diffs)
  })
  prismaMock.padronSnapshot.findUnique.mockResolvedValue({ id: 'snap-1', estado: 'aprobado' })
  prismaMock.cargo.findMany.mockResolvedValue([])
  prismaMock.persona.findMany.mockResolvedValue([])
  prismaMock.hospital.findMany.mockResolvedValue([])
  prismaMock.codigoRegistro.findMany.mockResolvedValue([])
  prismaMock.escalafon.findMany.mockResolvedValue([])
  prismaMock.concursoCph.findMany.mockResolvedValue([])
  prismaMock.baja.findMany.mockResolvedValue([])
}

// Arma un diff nuevo con código y literal de puesto a medida (para el filtro).
function diffConCargo(id: string, codigo: string, literal: string) {
  return diffNuevo({
    id,
    idSialRol: `ROL-${id}`,
    valorNuevo: JSON.stringify({
      id_sial: `SIAL-${id}`,
      cuil_y_rol: '20111111113-1',
      ayn: 'Perez, Juan',
      siglas: 'HOSP',
      escalafon: 'X',
      literal_puesto: literal,
      codigo_de_registro: codigo,
      especialidad: null,
    }),
  })
}

describe('getPendientesService — filtro gestionable (FASE 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('excluye un id_sial nuevo no gestionable (Residencias código 60)', async () => {
    setupPendientesConDiffs([diffConCargo('g', '37', 'Médico'), diffConCargo('ng', '60', 'Residente')])
    const result = await getPendientesService()
    expect(result.pendientes.map((p) => p.diffId)).toEqual(['g']) // solo el gestionable (código 37)
    expect(result.resumen.total).toBe(1)
  })

  it('excluye un 83 fuera del Anexo II y conserva un 83 del Anexo II', async () => {
    setupPendientesConDiffs([
      diffConCargo('anexo', '83', 'Capellán'), // ∈ ANEXO_II_83 → gestionable
      diffConCargo('fuera', '83', 'Administrativo'), // ∉ Anexo II → fuera
    ])
    const result = await getPendientesService()
    expect(result.pendientes.map((p) => p.idSialRol)).toEqual(['ROL-anexo'])
    expect(result.resumen.total).toBe(1)
  })
})

describe('getPendientesService — cola §4.2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('arma el WHERE con nuevo/aprobado=null, snapshot aprobado e IS DISTINCT FROM __alta_desdoblada__ (incluye campo=null)', async () => {
    setupPendientesUnDiff()

    const result = await getPendientesService()

    const whereArg = prismaMock.padronDiff.findMany.mock.calls[0][0].where
    expect(whereArg.tipo).toBe('nuevo')
    expect(whereArg.aprobado).toBeNull()
    expect(whereArg.snapshot).toEqual({ estado: 'aprobado' })
    // OR que replica IS DISTINCT FROM (incluye campo=null)
    expect(whereArg.OR).toEqual([{ campo: null }, { campo: { not: '__alta_desdoblada__' } }])

    expect(result.pendientes).toHaveLength(1)
    expect(result.pendientes[0].valorNuevo.idSial).toBe('SIAL-1')
    expect(result.pendientes[0].valorNuevo.cuil).toBe('20111111113')
    expect(result.resumen.total).toBe(1)
  })

  it('marca tieneBajaAsociada cuando la persona del id_sial tiene una baja (cruce por CUIL)', async () => {
    setupPendientesUnDiff({ bajas: [{ persona: { cuil: '20111111113' } }] })

    const result = await getPendientesService()
    expect(result.pendientes[0].tieneBajaAsociada).toBe(true)
    expect(result.resumen.conBajaAsociada).toBe(1)
  })

  it('tieneBajaAsociada=false cuando no hay baja para la persona ni el cargo del id_sial', async () => {
    setupPendientesUnDiff({ bajas: [] })

    const result = await getPendientesService()
    expect(result.pendientes[0].tieneBajaAsociada).toBe(false)
    expect(result.resumen.conBajaAsociada).toBe(0)
  })
})

describe('aprobarDiffNuevoService — Opción A §5.3 (padron_historico + KPI del mes de gestión)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('al crear el cargo escribe padron_historico con fecha del mes en curso y repuebla el KPI de ese mes', async () => {
    // Diff fuera de la tx
    prismaMock.padronDiff.findUnique.mockResolvedValue(diffNuevo())

    // Doble de la transacción: recoge los $executeRaw (KPI) y el historico.
    const executeRawCalls: unknown[] = []
    const historicoCreate = vi.fn().mockResolvedValue({})
    const ocupacionFinal = {
      personaId: 'per-1',
      cargoId: 'car-1',
      idSialRol: 'ROL-1',
      estadoPersona: 'A',
      situacionRevista: 'planta',
      persona: { cuil: '20111111113' },
      cargo: {
        literalPuesto: 'Médico',
        especialidadLegacy: 'Clínica',
        agrupador: null,
        unificadorPuesto: null,
        hospital: { sigla: 'HOSP' },
        escalafon: { nombre: 'Profesional' },
      },
    }

    const tx = {
      hospital: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'hosp-1', sigla: 'HOSP', nombre: 'HOSP' }),
      },
      codigoRegistro: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ escalafon: { id: 'esc-1', nombre: 'Profesional' } }) // resolver escalafón
          .mockResolvedValueOnce({ id: 'cr-1' }), // resolver codigoRegistroId
      },
      persona: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'per-1', cuil: '20111111113' }),
      },
      cargo: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'car-1', idSial: 'SIAL-1', estado: 'vigente' }),
        update: vi.fn().mockResolvedValue({}),
      },
      ocupacion: {
        // 1ª: chequeo "ocupExistente" (null → crea); 2ª: lectura Opción A (incluye relaciones)
        findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(ocupacionFinal),
        create: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      padronHistorico: { create: historicoCreate },
      padronDiff: { update: vi.fn().mockResolvedValue({}) },
      $executeRaw: vi.fn((...args: unknown[]) => {
        executeRawCalls.push(args)
        return Promise.resolve(1)
      }),
    }

    prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => Promise<unknown>) =>
      cb(tx),
    )

    await aprobarDiffNuevoService('snap-1', 'diff-1', 'user-1')

    // (1) padron_historico escrito con fecha del MES EN CURSO (now()), no la
    //     fechaAsignada del snapshot (2026-01).
    expect(historicoCreate).toHaveBeenCalledTimes(1)
    const historicoData = historicoCreate.mock.calls[0][0].data
    const ahora = new Date()
    expect(historicoData.fechaAsignada.getUTCFullYear()).toBe(ahora.getUTCFullYear())
    expect(historicoData.fechaAsignada.getUTCMonth()).toBe(ahora.getUTCMonth())
    expect(historicoData.idSialRol).toBe('ROL-1')
    expect(historicoData.cuil).toBe('20111111113')

    // (2) repopularKpiDotacionMes corrió para el mes en curso: dos $executeRaw
    //     (DELETE del mes + INSERT...SELECT) tras crear el histórico.
    expect(executeRawCalls.length).toBeGreaterThanOrEqual(2)

    // (3) el diff quedó marcado como gestionado (aprobado=true, resolucion='cargo').
    expect(tx.padronDiff.update).toHaveBeenCalledWith({
      where: { id: 'diff-1' },
      data: { aprobado: true, resolucion: 'cargo' },
    })
  })
})
