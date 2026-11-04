import { describe, it, expect, vi, beforeEach } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  padronSnapshot: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  bajaSialSnapshot: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  padronDiff: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../shared/prisma.js', () => ({ prisma: prismaMock }))

import {
  obtenerSnapshotIncidencias,
  listarBajaSinConcurso,
  listarBajaSinConcursoDeSnapshot,
  calcularConciliacion,
  _resetCacheIncidencias,
  CACHE_TTL_MS,
  type HechoRow,
  type SnapshotIncidencias,
} from './incidencias.baja-sin-concurso.js'
import { listarTodo, type TipoIncidencia, type IncidenciaItem } from './incidencias.tipos.js'

const hecho = (over: Partial<HechoRow> = {}): HechoRow => ({
  cargo_id: 'c1',
  codigo: 'POF-000001',
  id_sial: '001-2',
  estado: 'validacion_vacante',
  sub_estado: 'ocupado',
  estado_desde: new Date('2026-11-01'),
  literal_puesto: 'Médico',
  especialidad_legacy: 'Clínica',
  hospital_sigla: 'HOSP',
  carrera: 'Profesional',
  persona_cuil: '20111111113',
  persona_nombre: 'Pérez, Juan',
  tiene_ocupante_vigente: false,
  ocupacion_hasta: new Date('2026-10-30'),
  ocupacion_desde_ult: new Date('2025-01-01'),
  tipo_origen: null,
  concurso_activo: false,
  tuvo_concurso_cerrado: false,
  alta_pendiente: false,
  en_baja_sial: false,
  bs_cuil: null,
  bs_ayn: null,
  bs_cargo_hasta: null,
  mot_baja: null,
  doc_resp_baja: null,
  bs_primera_fecha: null,
  ausente_ultimo_padron: true,
  fecha_baja_padron: new Date('2026-11-01'),
  baja_estado: null,
  baja_genera_concurso: null,
  ...over,
})

const snapDe = (hechos: HechoRow[]): SnapshotIncidencias => ({
  generadoAt: new Date('2026-11-10T00:00:00Z'),
  hechos,
  conteos: { totalCargos: 100, noVigente: 10, ocupado: 80, vigenteSinOcupante: 0, validacionVacante: hechos.length },
  contexto: { ultimoPadron: null, ultimaBajaSial: null },
  ultimaBajaFechaArchivo: '2026-11-08',
})

beforeEach(() => {
  vi.clearAllMocks()
  _resetCacheIncidencias()
})

describe('caché de obtenerSnapshotIncidencias', () => {
  const fake = (): SnapshotIncidencias => snapDe([])

  it('dos llamadas dentro del TTL cargan una vez; pasado el TTL, otra vez', async () => {
    let t = 1_000
    const cargar = vi.fn().mockImplementation(async () => fake())
    const deps = { ahora: () => t, cargar }
    await obtenerSnapshotIncidencias({}, deps)
    t += 10_000
    await obtenerSnapshotIncidencias({}, deps)
    expect(cargar).toHaveBeenCalledTimes(1)
    t += CACHE_TTL_MS + 1_000
    await obtenerSnapshotIncidencias({}, deps)
    expect(cargar).toHaveBeenCalledTimes(2)
  })

  it('refrescar fuerza la carga', async () => {
    const cargar = vi.fn().mockImplementation(async () => fake())
    const deps = { ahora: () => 1_000, cargar }
    await obtenerSnapshotIncidencias({}, deps)
    await obtenerSnapshotIncidencias({ refrescar: true }, deps)
    expect(cargar).toHaveBeenCalledTimes(2)
  })

  it('llamadas concurrentes comparten una sola carga (single-flight)', async () => {
    const cargar = vi.fn().mockImplementation(async () => fake())
    const deps = { ahora: () => 1_000, cargar }
    await Promise.all([obtenerSnapshotIncidencias({}, deps), obtenerSnapshotIncidencias({}, deps)])
    expect(cargar).toHaveBeenCalledTimes(1)
  })

  it('si la carga falla no se cachea el error: la siguiente reintenta', async () => {
    const cargar = vi.fn().mockRejectedValueOnce(new Error('neon')).mockImplementation(async () => fake())
    const deps = { ahora: () => 1_000, cargar }
    await expect(obtenerSnapshotIncidencias({}, deps)).rejects.toThrow('neon')
    await expect(obtenerSnapshotIncidencias({}, deps)).resolves.toBeDefined()
    expect(cargar).toHaveBeenCalledTimes(2)
  })
})

describe('listarBajaSinConcurso (solo lectura)', () => {
  it('mapea hechos a ítems y no invoca ninguna escritura', async () => {
    prismaMock.$queryRaw
      // 1ª llamada: hechos; 2ª: conteos base
      .mockResolvedValueOnce([
        hecho(),
        hecho({ cargo_id: 'c2', codigo: 'POF-000002', id_sial: '002-2', tiene_ocupante_vigente: true, estado: 'validacion_vacante' }),
        hecho({ cargo_id: 'c3', codigo: 'POF-000003', concurso_activo: true }),
      ])
      .mockResolvedValueOnce([
        { total_cargos: 10n, no_vigente: 1n, ocupado: 5n, vigente_sin_ocupante: 0n, validacion_vacante: 3n },
      ])
    prismaMock.padronSnapshot.findFirst.mockResolvedValue({
      fechaAsignada: new Date('2026-11-01'),
      totalRegistros: 49249,
      ratioTamano: 1,
      advertenciaTamano: null,
    })
    prismaMock.bajaSialSnapshot.findFirst.mockResolvedValue({
      fechaArchivo: new Date('2026-11-08'),
      estado: 'aprobado',
    })

    const r = await listarBajaSinConcurso({ page: 1, pageSize: 50 }, { refrescar: true })

    expect(r.items).toHaveLength(1)
    const it0 = r.items[0]
    expect(it0.cargoId).toBe('c1')
    expect(it0.estadoDesde).toBe('2026-11-01')
    expect(it0.deteccion.origen).toBe('padron')
    expect(it0.deteccion.texto).toBe('Ausente del padrón desde el 01/11/2026')
    expect(it0.persona).toEqual({ cuil: '20111111113', nombre: 'Pérez, Juan' })
    expect(it0.bajaFormal).toBeNull()
    expect(r.meta.total).toBe(1)
    expect(r.contexto.ultimaBajaSial).toEqual({ fechaArchivo: '2026-11-08', estado: 'aprobado' })
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled()
    for (const m of [prismaMock.padronSnapshot, prismaMock.bajaSialSnapshot, prismaMock.padronDiff]) {
      expect(m.create).not.toHaveBeenCalled()
      expect(m.update).not.toHaveBeenCalled()
      expect(m.delete).not.toHaveBeenCalled()
    }
  })
})

describe('filtros y conciliación', () => {
  const hechos = [
    hecho({ cargo_id: 'a', codigo: 'A-1', en_baja_sial: true, bs_primera_fecha: new Date('2026-11-08'), carrera: 'Profesional' }),
    hecho({ cargo_id: 'b', codigo: 'B-1', carrera: 'Enfermería', persona_nombre: 'Gómez, Ana', persona_cuil: '27222222224' }),
    hecho({ cargo_id: 'c', codigo: 'C-1', concurso_activo: true }),
  ]
  const snap = snapDe(hechos)
  const hoy = new Date('2026-11-10T00:00:00Z')

  it('filtra por carrera (normalizada), buscador y origen; porOrigen ignora origen', () => {
    const base = { page: 1, pageSize: 50 }
    expect(listarBajaSinConcursoDeSnapshot(snap, { ...base, carrera: 'enfermeria' }, hoy).items.map((i) => i.cargoId)).toEqual(['b'])
    expect(listarBajaSinConcursoDeSnapshot(snap, { ...base, q: 'gomez' }, hoy).items.map((i) => i.cargoId)).toEqual(['b'])
    expect(listarBajaSinConcursoDeSnapshot(snap, { ...base, q: '27-22222222' }, hoy).items.map((i) => i.cargoId)).toEqual(['b'])
    const r = listarBajaSinConcursoDeSnapshot(snap, { ...base, origen: 'baja_sial' }, hoy)
    expect(r.items.map((i) => i.cargoId)).toEqual(['a'])
    expect(r.porOrigen).toEqual({ baja_sial: 1, padron: 1 })
  })

  it('pagina', () => {
    const r = listarBajaSinConcursoDeSnapshot(snap, { page: 2, pageSize: 1 }, hoy)
    expect(r.items).toHaveLength(1)
    expect(r.meta).toEqual({ total: 2, page: 2, pageSize: 1, pages: 2 })
  })

  it('la suma de grupos de la conciliación coincide con el total de los conteos base', () => {
    const c = calcularConciliacion(snap, hoy)
    expect(c.grupos.baja_sin_concurso).toBe(2)
    expect(c.grupos.en_concurso).toBe(1)
    expect(c.sumaGrupos).toBe(10 + 80 + 3)
  })
})

describe('listarTodo con tipos inyectados', () => {
  const item = (tipo: 'sial-sin-cargo' | 'baja-sin-concurso', id: string, fecha: string | null): IncidenciaItem => ({
    clave: `${tipo}:${id}`,
    tipo,
    tipoLabel: tipo,
    idSial: null,
    codigo: null,
    hospitalSigla: null,
    carrera: null,
    puesto: null,
    especialidad: null,
    personaCuil: null,
    personaNombre: null,
    fecha,
    detalle: '',
    cargoId: null,
    diffId: null,
  })
  const tipos: TipoIncidencia[] = [
    {
      slug: 'sial-sin-cargo',
      label: 'x',
      contar: async () => 2,
      listar: async () => [item('sial-sin-cargo', '1', '2026-11-05'), item('sial-sin-cargo', '2', null)],
    },
    {
      slug: 'baja-sin-concurso',
      label: 'y',
      contar: async () => 1,
      listar: async () => [item('baja-sin-concurso', '9', '2026-11-01')],
    },
  ]

  it('une, ordena por fecha con nulls al final y claves únicas', async () => {
    const r = await listarTodo({ page: 1, pageSize: 10 }, tipos)
    expect(r.items.map((i) => i.clave)).toEqual(['baja-sin-concurso:9', 'sial-sin-cargo:1', 'sial-sin-cargo:2'])
    expect(new Set(r.items.map((i) => i.clave)).size).toBe(3)
    expect(r.porTipo).toEqual({ 'sial-sin-cargo': 2, 'baja-sin-concurso': 1 })
  })

  it('filtra por tipo (porTipo lo ignora) y pagina', async () => {
    const r = await listarTodo({ page: 1, pageSize: 10, tipo: 'sial-sin-cargo' }, tipos)
    expect(r.items).toHaveLength(2)
    expect(r.porTipo['baja-sin-concurso']).toBe(1)
    const p = await listarTodo({ page: 2, pageSize: 2 }, tipos)
    expect(p.items).toHaveLength(1)
    expect(p.meta.pages).toBe(2)
  })
})
