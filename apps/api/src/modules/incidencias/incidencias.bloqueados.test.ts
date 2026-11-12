import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Pestaña "Bloqueados" (FASE 5, on-demand, solo lectura). La query lee
// ocupaciones vivas (hasta IS NULL) con fecha_bloqueo IS NOT NULL del universo
// gestionable; acá se mockea prisma.$queryRaw (no hay DB en los tests) para
// ejercitar (a) el armado del ítem y (b) el adaptador al IncidenciaItem común
// de /todo. El filtro hasta IS NULL + fecha_bloqueo IS NOT NULL + gestionable
// vive en el SQL: se verifica que la query lo contiene.
// ─────────────────────────────────────────────────────────────────────────────

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
}))

vi.mock('../../shared/prisma.js', () => ({ prisma: prismaMock }))

import {
  listarBloqueados,
  construirItemBloqueado,
  filtrarBloqueados,
  type BloqueadoRow,
  type BloqueadosItem,
} from './incidencias.bloqueados.js'
import { TIPOS_INCIDENCIA } from './incidencias.tipos.js'

const row = (over: Partial<BloqueadoRow> = {}): BloqueadoRow => ({
  cargo_id: 'car-1',
  id_sial: 'SIAL-1',
  codigo_registro: '37',
  hospital_sigla: 'HOSP',
  carrera: 'Profesional',
  literal_puesto: 'Médico',
  especialidad: 'Clínica',
  persona_cuil: '20111111113',
  persona_nombre: 'Perez, Juan',
  fecha_bloqueo: new Date('2026-02-10'),
  bloq_motivo: 'Sumario administrativo',
  bloqueo_comentario: 'En curso',
  ...over,
})

describe('construirItemBloqueado', () => {
  it('mapea la fila cruda al ítem (fecha_bloqueo en ISO yyyy-mm-dd, persona anidada)', () => {
    const it = construirItemBloqueado(row())
    expect(it.cargoId).toBe('car-1')
    expect(it.codigoRegistro).toBe('37')
    expect(it.fechaBloqueo).toBe('2026-02-10')
    expect(it.bloqMotivo).toBe('Sumario administrativo')
    expect(it.persona).toEqual({ cuil: '20111111113', nombre: 'Perez, Juan' })
  })

  it('deja persona en null cuando no hay cuil ni nombre', () => {
    const it = construirItemBloqueado(row({ persona_cuil: null, persona_nombre: null }))
    expect(it.persona).toBeNull()
  })
})

describe('filtrarBloqueados', () => {
  const items: BloqueadosItem[] = [
    construirItemBloqueado(row()),
    construirItemBloqueado(
      row({ cargo_id: 'car-2', carrera: 'Técnico', persona_nombre: 'Gomez, Ana', persona_cuil: '27222222224' }),
    ),
  ]

  it('filtra por carrera (match exacto normalizado)', () => {
    expect(filtrarBloqueados(items, { carrera: 'Técnico' }).map((i) => i.cargoId)).toEqual(['car-2'])
  })

  it('filtra por q sobre el nombre (>= 2 chars)', () => {
    expect(filtrarBloqueados(items, { q: 'gomez' }).map((i) => i.cargoId)).toEqual(['car-2'])
  })
})

describe('listarBloqueados — query + paginación', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('arma la query con hasta IS NULL + fecha_bloqueo IS NOT NULL + gestionable y pagina', async () => {
    prismaMock.$queryRaw.mockResolvedValue([row(), row({ cargo_id: 'car-2', id_sial: 'SIAL-2' })])

    const result = await listarBloqueados({ page: 1, pageSize: 1 })

    // El SQL (template string crudo) contiene el filtro vivo + bloqueado.
    const sqlParts = prismaMock.$queryRaw.mock.calls[0][0] as { raw?: string[] }
    const sql = (sqlParts.raw ?? []).join(' ')
    expect(sql).toContain('o.hasta IS NULL')
    expect(sql).toContain('o.fecha_bloqueo IS NOT NULL')
    // El predicado gestionable (sqlCargoGestionable) se interpola como un
    // fragmento Prisma.Sql anidado (un valor del template, no texto crudo): su
    // EXISTS sobre codigos_registro aparece en el SQL de ese fragmento.
    const nested = (prismaMock.$queryRaw.mock.calls[0] as unknown[])
      .slice(1)
      .find((v): v is { sql: string } => typeof (v as { sql?: unknown })?.sql === 'string')
    expect(nested?.sql).toContain('EXISTS')
    expect(nested?.sql).toContain('codigos_registro')

    expect(result.items).toHaveLength(1)
    expect(result.meta).toEqual({ total: 2, page: 1, pageSize: 1, pages: 2 })
  })
})

describe('tipo bloqueados — adaptador a IncidenciaItem (/todo)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mapea al IncidenciaItem común con fechaBloqueo/motivo y detalle "Bloqueado desde …"', async () => {
    prismaMock.$queryRaw.mockResolvedValue([row()])
    const tipo = TIPOS_INCIDENCIA.find((t) => t.slug === 'bloqueados')
    expect(tipo).toBeDefined()

    const items = await tipo!.listar({})
    expect(items).toHaveLength(1)
    const [i] = items
    expect(i.tipo).toBe('bloqueados')
    expect(i.clave).toBe('bloqueados:car-1')
    expect(i.fecha).toBe('2026-02-10')
    expect(i.fechaBloqueo).toBe('2026-02-10')
    expect(i.motivo).toBe('Sumario administrativo')
    expect(i.detalle).toBe('Bloqueado desde 2026-02-10 — Sumario administrativo')
  })
})
