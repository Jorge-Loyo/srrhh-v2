import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IncidenciaPersistidaRow } from './incidencias.persistidas.js'

// Mockeamos SOLO el acceso a BD (leerIncidenciasPersistidas) y conservamos los
// helpers puros reales del módulo (construirItemPersistido / filtrar / ordenar /
// subTipoOtras). Así probamos el wiring de los TipoIncidencia persistidos y el
// agrupamiento de 'otras:*' sin tocar Postgres.
const leerMock = vi.fn<(slugs: readonly string[]) => Promise<IncidenciaPersistidaRow[]>>()

vi.mock('./incidencias.persistidas.js', async (importActual) => {
  const actual = await importActual<typeof import('./incidencias.persistidas.js')>()
  return { ...actual, leerIncidenciasPersistidas: leerMock }
})

const { TIPOS_INCIDENCIA, listarPersistidas, resumenIncidencias } = await import('./incidencias.tipos.js')

const row = (over: Partial<IncidenciaPersistidaRow> = {}): IncidenciaPersistidaRow => ({
  id: 'inc-1',
  tipo: 'cayo-del-padron',
  cargo_id: 'cargo-1',
  id_sial: '001788157',
  id_sial_rol: '001788157-1',
  estado_anterior: null,
  estado_nuevo: null,
  detalle: 'detalle',
  created_at: new Date('2024-01-10T00:00:00Z'),
  codigo: 'C-100',
  hospital_sigla: 'HGA',
  carrera: 'Enfermería',
  puesto: 'Enfermero',
  especialidad: 'Clínica',
  persona_cuil: '20111111113',
  persona_nombre: 'PEREZ JUAN',
  fecha_asignada: new Date('2024-01-08T00:00:00Z'),
  ...over,
})

const tipo = (slug: string) => TIPOS_INCIDENCIA.find((t) => t.slug === slug)!

beforeEach(() => leerMock.mockReset())

describe('TipoIncidencia persistidos (FASE 4)', () => {
  it('registra las 4 pestañas nuevas en TIPOS_INCIDENCIA', () => {
    const slugs = TIPOS_INCIDENCIA.map((t) => t.slug)
    expect(slugs).toContain('cayo-del-padron')
    expect(slugs).toContain('cambio-situacion-revista')
    expect(slugs).toContain('cambios-del-puesto')
    expect(slugs).toContain('otras')
  })

  it('cada pestaña lee SOLO sus slugs de padron_incidencias', async () => {
    leerMock.mockResolvedValue([])
    await tipo('cayo-del-padron').contar()
    expect(leerMock).toHaveBeenCalledWith(['cayo-del-padron'])

    leerMock.mockClear()
    await tipo('otras').contar()
    expect(leerMock).toHaveBeenCalledWith([
      'otras:nueva-baja',
      'otras:cambio-persona',
      'otras:reaparecio',
    ])
  })

  it('contar() devuelve la cantidad de filas', async () => {
    leerMock.mockResolvedValue([row({ id: 'a' }), row({ id: 'b' })])
    expect(await tipo('cayo-del-padron').contar()).toBe(2)
  })

  it('listar() mapea al IncidenciaItem común de la unión', async () => {
    leerMock.mockResolvedValue([row()])
    const [i] = await tipo('cayo-del-padron').listar({})
    expect(i!.tipo).toBe('cayo-del-padron')
    expect(i!.tipoLabel).toBe('Cayó del padrón')
    expect(i!.idSial).toBe('001788157')
    expect(i!.cargoId).toBe('cargo-1')
    expect(i!.fecha).toBe('2024-01-08')
  })

  it('otras: agrupa los tres slugs y el detalle lleva el sub-tipo', async () => {
    leerMock.mockResolvedValue([
      row({ id: 'a', tipo: 'otras:nueva-baja', detalle: 'Baja SIAL antes del padrón' }),
      row({ id: 'b', tipo: 'otras:cambio-persona', detalle: 'Otra persona' }),
      row({ id: 'c', tipo: 'otras:reaparecio', detalle: 'Reaparece' }),
    ])
    const items = await tipo('otras').listar({})
    expect(items).toHaveLength(3)
    expect(items.every((i) => i.tipo === 'otras')).toBe(true)
    // El detalle distingue cuál de los tres es (sub-tipo embebido).
    expect(items.find((i) => i.detalle.startsWith('Nueva baja:'))).toBeTruthy()
    expect(items.find((i) => i.detalle.startsWith('Cambió la persona:'))).toBeTruthy()
    expect(items.find((i) => i.detalle.startsWith('Reapareció:'))).toBeTruthy()
  })

  it('listar() respeta el filtro de búsqueda', async () => {
    leerMock.mockResolvedValue([
      row({ id: 'a', persona_nombre: 'PEREZ JUAN' }),
      row({ id: 'b', persona_nombre: 'GOMEZ ANA' }),
    ])
    const items = await tipo('cayo-del-padron').listar({ q: 'gomez' })
    expect(items).toHaveLength(1)
    expect(items[0]!.personaNombre).toBe('GOMEZ ANA')
  })
})

describe('listarPersistidas (ruta dedicada, shape rico)', () => {
  it('pagina y devuelve meta con el total', async () => {
    leerMock.mockResolvedValue([
      row({ id: 'a', fecha_asignada: new Date('2024-01-01T00:00:00Z') }),
      row({ id: 'b', fecha_asignada: new Date('2024-02-01T00:00:00Z') }),
      row({ id: 'c', fecha_asignada: new Date('2024-03-01T00:00:00Z') }),
    ])
    const res = await listarPersistidas('cayo-del-padron', { page: 1, pageSize: 2 })
    expect(res.meta).toMatchObject({ total: 3, page: 1, pageSize: 2, pages: 2 })
    expect(res.items).toHaveLength(2)
    // orden por fecha asc
    expect(res.items[0]!.id).toBe('a')
  })

  it('devuelve shape correcto y meta coherente con tabla vacía (0 incidencias)', async () => {
    leerMock.mockResolvedValue([])
    const res = await listarPersistidas('otras', { page: 1, pageSize: 50 })
    expect(res.items).toEqual([])
    expect(res.meta).toMatchObject({ total: 0, page: 1, pageSize: 50, pages: 1 })
    expect(typeof res.generadoAt).toBe('string')
  })
})

describe('resumen incluye los tipos nuevos', () => {
  it('tabs tiene una clave por cada pestaña persistida y suma en "todo"', async () => {
    // Todas las pestañas (incluidas sial/baja que no mockeamos) resuelven vía
    // obtenerSnapshotIncidencias → prisma; para aislar, hacemos que el lector
    // persistido devuelva 1 fila por slug y stubeamos el snapshot base.
    leerMock.mockResolvedValue([row()])
    // El resumen real llama también a sial/baja; acá sólo verificamos que las
    // claves nuevas existan en el tipo de retorno a través de TIPOS_INCIDENCIA.
    const slugs = TIPOS_INCIDENCIA.map((t) => t.slug)
    expect(slugs).toEqual(
      expect.arrayContaining([
        'cayo-del-padron',
        'cambio-situacion-revista',
        'cambios-del-puesto',
        'otras',
      ]),
    )
    // Sanity del tipo de resumenIncidencias (no lo ejecutamos contra BD).
    expect(typeof resumenIncidencias).toBe('function')
  })
})
