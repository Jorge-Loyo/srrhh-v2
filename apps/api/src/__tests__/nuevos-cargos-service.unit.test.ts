import { describe, it, expect, vi, beforeEach } from 'vitest'

// =============================================================================
// PASO 4 (flujo concursos) — tests de listNuevosCargosService, que alimenta la
// pestaña "Nuevos cargos" (/cargos/nuevos-cargos). La fuente cambió: ya no se
// listan CARGOS con expediente (versión del Paso A, que dejaba la pestaña vacía
// porque los cargos nacen con su concurso automático) sino los CONCURSOS de
// cargo nuevo (CPH + CEETPS) que ningún usuario inició. Se mockea Prisma: el
// criterio vive en las cláusulas `where` y en el filtro en memoria.
// =============================================================================

const concursoCph = { findMany: vi.fn() }
const concursoCeetps = { findMany: vi.fn() }
const cargo = { findMany: vi.fn() }
vi.mock('../shared/prisma.js', () => ({
  prisma: { concursoCph, concursoCeetps, cargo },
}))

const { listNuevosCargosService, agruparNuevosCargos } = await import(
  '../modules/cargos/nuevos-cargos.service.js'
)

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- query parcial de test
const query = (o: Record<string, unknown> = {}) => o as any

function cargoRow(n: number, over: Record<string, unknown> = {}) {
  return {
    id: `cargo-${n}`,
    codigo: `CPH-POF-00000${n}`,
    idSial: `MANUAL-CPH-POF-00000${n}`,
    expediente: 'EX-2026-1',
    literalPuesto: 'MEDICO',
    especialidadLegacy: null,
    hospital: { id: 'h1', sigla: 'HGA' },
    escalafon: { nombre: 'Carrera Profesional' },
    puestoCargo: { nombre: 'Médico' },
    especialidadPuesto: { nombre: 'Clínica' },
    etiquetas: [] as { etiqueta: { id: string; nombre: string; color: string | null } }[],
    ...over,
  }
}

function cphRow(n: number, over: Record<string, unknown> = {}) {
  return {
    id: `cph-${n}`,
    eeConcurso: null,
    concurso: { id: `con-${n}`, expediente: 'EX-2026-1', createdAt: new Date(`2026-11-0${n}T10:00:00Z`) },
    cargo: cargoRow(n),
    ...over,
  }
}

function ceetpsRow(n: number, over: Record<string, unknown> = {}) {
  return {
    id: `cee-${n}`,
    expedienteConcurso: null,
    fechaCaratulacion: null,
    concurso: { id: `conc-${n}`, expediente: 'EX-2026-2', createdAt: new Date(`2026-11-0${n}T11:00:00Z`) },
    cargo: cargoRow(n, { codigo: `CEE-ENF-00000${n}`, idSial: `MANUAL-CEE-ENF-00000${n}`, expediente: 'EX-2026-2' }),
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  concursoCph.findMany.mockResolvedValue([])
  concursoCeetps.findMany.mockResolvedValue([])
  cargo.findMany.mockResolvedValue([])
})

describe('listNuevosCargosService — criterio de "sin iniciar"', () => {
  it('CPH: solo nuevo_cargo sin autorizar, estado no_iniciado y no suspendido', async () => {
    await listNuevosCargosService(query())
    const where = concursoCph.findMany.mock.calls[0][0].where
    expect(where.estado).toBe('no_iniciado')
    expect(where.suspendido).toBe(false)
    expect(where.concurso.motivoConcurso).toBe('nuevo_cargo')
    expect(where.concurso.autorizadoAt).toBeNull()
    expect(where.cargo).toEqual({ deletedAt: null })
  })

  it('CEETPS: solo nuevo_cargo sin autorizar y estado sin_autorizar', async () => {
    await listNuevosCargosService(query())
    const where = concursoCeetps.findMany.mock.calls[0][0].where
    expect(where.estado).toBe('sin_autorizar')
    expect(where.concurso.motivoConcurso).toBe('nuevo_cargo')
    expect(where.concurso.autorizadoAt).toBeNull()
  })

  it('excluye los ya caratulados (CPH con eeConcurso, CEETPS con expediente o fecha de caratulación)', async () => {
    concursoCph.findMany.mockResolvedValue([cphRow(1), cphRow(2, { eeConcurso: 'EX-9' })])
    concursoCeetps.findMany.mockResolvedValue([
      ceetpsRow(1),
      ceetpsRow(2, { expedienteConcurso: 'EX-9' }),
      ceetpsRow(3, { fechaCaratulacion: new Date('2026-11-05') }),
    ])
    const res = await listNuevosCargosService(query())
    const ids = res.data.flatMap((g: { items: { detalleId: string }[] }) => g.items.map((i) => i.detalleId))
    expect(ids.sort()).toEqual(['cee-1', 'cph-1'])
    expect(res.meta.total).toBe(2)
  })

  it('no consulta concursos existentes de otros motivos: el filtro del where los deja afuera', async () => {
    await listNuevosCargosService(query())
    // El motivo se filtra en la query (un concurso por baja/ampliación nunca llega).
    expect(concursoCph.findMany.mock.calls[0][0].where.concurso).toMatchObject({ motivoConcurso: 'nuevo_cargo' })
    expect(concursoCeetps.findMany.mock.calls[0][0].where.concurso).toMatchObject({ motivoConcurso: 'nuevo_cargo' })
  })
})

describe('listNuevosCargosService — filtros', () => {
  it('tipo=cph no consulta CEETPS (y viceversa)', async () => {
    await listNuevosCargosService(query({ tipo: 'cph' }))
    expect(concursoCph.findMany).toHaveBeenCalledTimes(1)
    expect(concursoCeetps.findMany).not.toHaveBeenCalled()
    vi.clearAllMocks()
    concursoCph.findMany.mockResolvedValue([])
    concursoCeetps.findMany.mockResolvedValue([])
    cargo.findMany.mockResolvedValue([])
    await listNuevosCargosService(query({ tipo: 'ceetps' }))
    expect(concursoCph.findMany).not.toHaveBeenCalled()
    expect(concursoCeetps.findMany).toHaveBeenCalledTimes(1)
  })

  it('aplica hospitalId a ambos tipos', async () => {
    await listNuevosCargosService(query({ hospitalId: 'h1' }))
    expect(concursoCph.findMany.mock.calls[0][0].where.hospitalId).toBe('h1')
    expect(concursoCeetps.findMany.mock.calls[0][0].where.hospitalId).toBe('h1')
  })

  it('search busca por expediente (del concurso y del cargo) y por datos del puesto', async () => {
    await listNuevosCargosService(query({ search: 'EX-2026' }))
    const or = concursoCph.findMany.mock.calls[0][0].where.concurso.OR
    expect(or).toHaveLength(3)
    expect(or[0]).toEqual({ expediente: { contains: 'EX-2026', mode: 'insensitive' } })
    expect(or[1]).toEqual({ cargo: { expediente: { contains: 'EX-2026', mode: 'insensitive' } } })
    const campos = or[2].cargo.OR.map((o: Record<string, unknown>) => Object.keys(o)[0])
    expect(campos).toEqual(['codigo', 'literalPuesto', 'especialidadLegacy', 'puestoCargo', 'especialidadPuesto', 'etiquetas'])
  })
})

describe('listNuevosCargosService — mezcla CPH/CEETPS y agrupación por expediente', () => {
  it('mezcla ambos tipos y agrupa por el expediente del alta (varios cargos por alta)', async () => {
    concursoCph.findMany.mockResolvedValue([cphRow(1), cphRow(2)])
    concursoCeetps.findMany.mockResolvedValue([ceetpsRow(3)])
    const res = await listNuevosCargosService(query())
    expect(res.meta).toMatchObject({ total: 3, grupos: 2 })
    const g1 = res.data.find((g: { expediente: string | null }) => g.expediente === 'EX-2026-1')!
    const g2 = res.data.find((g: { expediente: string | null }) => g.expediente === 'EX-2026-2')!
    expect(g1.cantidad).toBe(2)
    expect(g1.items.every((i: { tipo: string }) => i.tipo === 'cph')).toBe(true)
    expect(g2.cantidad).toBe(1)
    expect(g2.items[0]).toMatchObject({
      tipo: 'ceetps',
      detalleId: 'cee-3',
      concursoId: 'conc-3',
      hospital: { id: 'h1', sigla: 'HGA' },
      puesto: 'Médico',
      especialidad: 'Clínica',
      carrera: 'Carrera Profesional',
      cargo: { id: 'cargo-3', codigo: 'CEE-ENF-000003', idSial: 'MANUAL-CEE-ENF-000003' },
    })
  })

  it('usa el expediente del cargo si el concurso no lo trae', async () => {
    concursoCph.findMany.mockResolvedValue([
      cphRow(1, { concurso: { id: 'con-1', expediente: null, createdAt: new Date('2026-11-01T10:00:00Z') } }),
    ])
    const res = await listNuevosCargosService(query())
    expect(res.data[0].expediente).toBe('EX-2026-1')
  })

  it('agruparNuevosCargos: grupo más reciente primero y sin expediente en un grupo propio', () => {
    const item = (id: string, expediente: string | null, fechaAlta: string, codigo: string) =>
      ({ concursoId: id, detalleId: id, tipo: 'cph', expediente, hospital: null, puesto: null, especialidad: null,
         carrera: null, cargo: { id, codigo, idSial: null }, fechaAlta }) as never
    const grupos = agruparNuevosCargos([
      item('a', 'EX-1', '2026-11-01T00:00:00.000Z', 'B'),
      item('b', 'EX-1', '2026-11-01T00:00:00.000Z', 'A'),
      item('c', null, '2026-11-05T00:00:00.000Z', 'C'),
    ])
    expect(grupos.map((g) => g.expediente)).toEqual([null, 'EX-1'])
    expect(grupos[1]!.items.map((i) => i.cargo.codigo)).toEqual(['A', 'B'])
  })
})

describe('listNuevosCargosService — cargos nuevos sin concurso', () => {
  const sinConcurso = (n: number, cr: string | null, literal = 'MEDICO') => ({
    ...cargoRow(n, { literalPuesto: literal }),
    createdAt: new Date('2026-11-01T10:00:00Z'),
    codigoRegistro: cr ? { codigo: cr } : null,
  })

  it('busca cargos de alta (MANUAL-, con expediente, vacantes) sin ningún concurso', async () => {
    await listNuevosCargosService(query())
    const where = cargo.findMany.mock.calls[0][0].where
    expect(where.idSial).toEqual({ startsWith: 'MANUAL-' })
    expect(where.expediente).toEqual({ not: null, notIn: [''] })
    expect(where.estado).toBe('vigente')
    expect(where.subEstado).toBe('vacante')
    expect(where.concursos).toEqual({ none: {} })
  })

  it('CR fuera de CPH/CEETPS => motivo sin_tipo; CR válido sin concurso => sin_concurso (alta previa al Paso 3)', async () => {
    cargo.findMany.mockResolvedValue([sinConcurso(1, '60'), sinConcurso(2, null), sinConcurso(3, '37')])
    const res = await listNuevosCargosService(query())
    expect(res.sinConcurso.map((c: { cargoId: string; motivo: string }) => [c.cargoId, c.motivo])).toEqual([
      ['cargo-1', 'sin_tipo'],
      ['cargo-2', 'sin_tipo'],
      ['cargo-3', 'sin_concurso'],
    ])
    expect(res.meta.sinConcurso).toBe(3)
  })

  it('con filtro de tipo solo muestra los cargos que clasifican en ese tipo', async () => {
    cargo.findMany.mockResolvedValue([sinConcurso(1, '60'), sinConcurso(2, '37'), sinConcurso(3, '85')])
    const res = await listNuevosCargosService(query({ tipo: 'ceetps' }))
    expect(res.sinConcurso.map((c: { cargoId: string }) => c.cargoId)).toEqual(['cargo-3'])
  })
})
