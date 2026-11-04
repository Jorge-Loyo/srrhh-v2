import { describe, it, expect, vi, beforeEach } from 'vitest'

const { queryRaw, findMany } = vi.hoisted(() => ({ queryRaw: vi.fn(), findMany: vi.fn() }))
vi.mock('../../shared/prisma.js', () => ({
  prisma: { $queryRaw: queryRaw, codigoRegistro: { findMany } },
}))

import { getCargosIndicadoresService, sqlConcursos } from './cargos-indicadores.service.js'
import { cargosIndicadoresQuerySchema } from './cargos-indicadores.schema.js'

const NOW = new Date('2026-11-05T15:00:00Z')
const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const log = { error: vi.fn(), warn: vi.fn() }

interface Capt {
  sql: string
  values: unknown[]
}
let capturas: Capt[] = []

function fila(over: Record<string, unknown>) {
  return {
    codigo_registro_id: U1,
    estado: 'vigente',
    ed_rel: 'le',
    sits: null,
    sit_aprox: false,
    concurso: 'no',
    n: 1,
    total_base: 10,
    ...over,
  }
}

function configurar(opts: { primerDatos?: string | null; cargaInicial?: string | null; filasVivo?: unknown[]; filasRec?: unknown[] } = {}) {
  const { primerDatos = '2026-01-31', cargaInicial = '2026-02-10' } = opts
  queryRaw.mockImplementation(async (q: Capt) => {
    capturas.push({ sql: q.sql, values: q.values })
    if (q.sql.includes('FROM padron_snapshots')) return [{ d: primerDatos }]
    if (q.sql.includes('GROUP BY 1 ORDER BY count(*) DESC')) return [{ d: cargaInicial }]
    if (q.sql.includes('kpis_dotacion_snapshot')) return [{ codigo: '37', personas: 5, fecha: '2026-10-01' }]
    if (q.sql.includes('WITH base AS') && q.sql.includes("'le' AS ed_rel")) {
      return opts.filasVivo ?? [fila({ n: 6, sits: ['activo'], total_base: 10 }), fila({ n: 4, total_base: 10 })]
    }
    if (q.sql.includes('WITH base AS')) {
      return opts.filasRec ?? [fila({ n: 7, sits: ['comision'], total_base: 9 }), fila({ n: 2, estado: 'no_vigente', total_base: 9 })]
    }
    return []
  })
}

beforeEach(() => {
  capturas = []
  queryRaw.mockReset()
  findMany.mockReset()
  log.error.mockReset()
  log.warn.mockReset()
  findMany.mockResolvedValue([{ id: U1, codigo: '37', literal: 'Nueva Carrera' }])
})

const principales = () => capturas.filter((c) => c.sql.includes('WITH base AS'))

describe('getCargosIndicadoresService', () => {
  it('arma la respuesta completa y concilia', async () => {
    configurar()
    const r = await getCargosIndicadoresService({}, log, NOW)
    expect(r.actual).toMatchObject({ mes: '2026-11', modo: 'vivo', disponible: true })
    expect(r.anterior).toMatchObject({ mes: '2026-10', fechaCorte: '2026-10-31', modo: 'reconstruido', disponible: true })
    expect(r.total.celdas.total.actual).toBe(10)
    expect(r.total.celdas.total.anterior).toBe(9)
    expect(r.total.celdas.total.variacionAbs).toBe(1)
    expect(r.total.celdas.ocupado.actual).toBe(6)
    expect(r.conciliacion).toEqual({ ok: true, totalActual: 10, totalAnterior: 9 })
    expect(log.error).not.toHaveBeenCalled()
  })

  it('Σ n distinto de total_base -> conciliacion.ok=false y log de error', async () => {
    configurar({ filasVivo: [fila({ n: 6, total_base: 10 })] })
    const r = await getCargosIndicadoresService({}, log, NOW)
    expect(r.conciliacion.ok).toBe(false)
    expect(log.error).toHaveBeenCalled()
  })

  it('solo lectura: no hay métodos de escritura y las consultas son SELECT/WITH', async () => {
    configurar()
    await getCargosIndicadoresService({}, log, NOW)
    for (const c of capturas) {
      expect(c.sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER)\b/i)
    }
    expect(findMany).toHaveBeenCalledTimes(1)
  })

  it('período reconstruido no disponible: no ejecuta su consulta y sus celdas son n/d', async () => {
    configurar({ primerDatos: '2026-11-01' })
    const r = await getCargosIndicadoresService({}, log, NOW)
    expect(r.anterior.disponible).toBe(false)
    expect(r.anterior.motivoNoDisponible).toContain('anterior al primer padrón aprobado')
    expect(principales()).toHaveLength(1)
    expect(r.total.celdas.total.anterior).toBeNull()
    expect(r.total.celdas.total.variacionAbs).toBeNull()
  })

  it('sin padrones aprobados: motivo explícito', async () => {
    configurar({ primerDatos: null })
    const r = await getCargosIndicadoresService({}, log, NOW)
    expect(r.anterior.motivoNoDisponible).toBe('sin padrones aprobados')
  })

  it('reconstruido sin cargos -> no disponible', async () => {
    configurar({ filasRec: [] })
    const r = await getCargosIndicadoresService({}, log, NOW)
    expect(r.anterior.motivoNoDisponible).toBe('sin cargos existentes a esa fecha')
  })

  it('mes futuro -> AppError 400', async () => {
    configurar()
    await expect(getCargosIndicadoresService({ mes: '2026-12' }, log, NOW)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('filtros: ::uuid y valores en todas las consultas (dos veces en la viva)', async () => {
    configurar()
    await getCargosIndicadoresService({ hospitalId: U2, codigoRegistroId: U1 }, log, NOW)
    const [viva, rec] = [
      principales().find((c) => c.sql.includes("'le' AS ed_rel"))!,
      principales().find((c) => !c.sql.includes("'le' AS ed_rel"))!,
    ]
    for (const c of [viva, rec]) {
      expect(c.sql).toContain('::uuid')
      expect(c.values).toContain(U1)
      expect(c.values).toContain(U2)
    }
    expect(viva.values.filter((v) => v === U1)).toHaveLength(2)
    expect(viva.values.filter((v) => v === U2)).toHaveLength(2)
    expect(rec.values.filter((v) => v === U1)).toHaveLength(1)
  })

  it('sin filtros no aparece ::uuid', async () => {
    configurar()
    await getCargosIndicadoresService({}, log, NOW)
    for (const c of principales()) expect(c.sql).not.toContain('::uuid')
  })

  it('mismo predicado de concurso en ambos períodos; nunca clasifica por sub_estado del cargo', async () => {
    configurar()
    await getCargosIndicadoresService({}, log, NOW)
    const [viva, rec] = [
      principales().find((c) => c.sql.includes("'le' AS ed_rel"))!,
      principales().find((c) => !c.sql.includes("'le' AS ed_rel"))!,
    ]
    const frag = sqlConcursos('2026-11-05').sql
    expect(viva.sql).toContain(frag)
    expect(rec.sql).toContain(frag)
    expect(sqlConcursos('2026-10-31').sql).toBe(frag)
    expect(viva.values).toContain('2026-11-05')
    expect(rec.values).toContain('2026-10-31')
    for (const c of [viva, rec]) {
      expect(c.sql).not.toMatch(/\bc\.sub_estado/)
      expect(c.sql).not.toContain("sub_estado = 'ocupado'")
    }
  })

  it('el override de la carga inicial no se pasa a la consulta viva (null por defecto)', async () => {
    configurar()
    await getCargosIndicadoresService({}, log, NOW)
    const rec = principales().find((c) => !c.sql.includes("'le' AS ed_rel"))!
    expect(rec.sql).toContain('<= ?::date')
    expect(rec.values).toContain(null)
  })

  it('personas_ref sale de kpis_dotacion_snapshot; con hospital queda n/d y no se consulta', async () => {
    configurar()
    const r = await getCargosIndicadoresService({}, log, NOW)
    expect(r.filas[0]!.celdas.personas_ref.actual).toBe(5)
    expect(r.referenciaPersonas.anteriorFecha).toBe('2026-10-01')
    capturas = []
    const h = await getCargosIndicadoresService({ hospitalId: U2 }, log, NOW)
    expect(h.filas[0]!.celdas.personas_ref.actual).toBeNull()
    expect(capturas.some((c) => c.sql.includes('kpis_dotacion_snapshot'))).toBe(false)
  })
})

describe('cargosIndicadoresQuerySchema', () => {
  it('mes: 2020-01 ok; 2019-12, 1999-01 y 2026-13 fallan', () => {
    expect(cargosIndicadoresQuerySchema.safeParse({ mes: '2020-01' }).success).toBe(true)
    expect(cargosIndicadoresQuerySchema.safeParse({}).success).toBe(true)
    for (const mes of ['2019-12', '1999-01', '2026-13']) {
      expect(cargosIndicadoresQuerySchema.safeParse({ mes }).success).toBe(false)
    }
    expect(cargosIndicadoresQuerySchema.safeParse({ hospitalId: 'x' }).success).toBe(false)
  })
})
