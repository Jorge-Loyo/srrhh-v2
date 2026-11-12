import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  CONSULTAS_SNAPSHOT,
  SQL_READ_ONLY,
  SQL_VERIFICA_READ_ONLY,
  cargarSnapshot,
  type PrismaLectura,
  type TxLectura,
} from './sistemaReadonly.js'

/** Prisma simulado: registra cada sentencia y responde con tablas vacías. */
function prismaSimulado(readOnly: string) {
  const sentencias: { tipo: 'exec' | 'query'; sql: string }[] = []
  const tx: TxLectura = {
    $executeRawUnsafe: async (sql: string) => {
      sentencias.push({ tipo: 'exec', sql })
      return 0
    },
    $queryRawUnsafe: (async (sql: string) => {
      sentencias.push({ tipo: 'query', sql })
      return sql === SQL_VERIFICA_READ_ONLY ? [{ v: readOnly }] : []
    }) as TxLectura['$queryRawUnsafe'],
  }
  const opciones: { timeout: number; maxWait: number }[] = []
  const prisma: PrismaLectura = {
    $transaction: async (fn, opts) => {
      opciones.push(opts)
      return fn(tx)
    },
  }
  return { prisma, sentencias, opciones }
}

describe('cargarSnapshot', () => {
  it('abre UNA transacción con timeout explícito y la primera sentencia es SET TRANSACTION READ ONLY', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { prisma, sentencias, opciones } = prismaSimulado('on')
    const s = await cargarSnapshot(prisma)
    expect(opciones).toHaveLength(1)
    expect(opciones[0].timeout).toBeGreaterThan(5000)
    expect(sentencias[0]).toEqual({ tipo: 'exec', sql: SQL_READ_ONLY })
    expect(sentencias[0].sql).toBe('SET TRANSACTION READ ONLY')
    expect(sentencias[1].sql).toBe(SQL_VERIFICA_READ_ONLY)
    expect(s.cargos).toEqual([])
  })

  it('aborta sin consultar datos si transaction_read_only no es on', async () => {
    const { prisma, sentencias } = prismaSimulado('off')
    await expect(cargarSnapshot(prisma)).rejects.toThrow(/solo lectura/)
    expect(sentencias.map((s) => s.sql)).toEqual([SQL_READ_ONLY, SQL_VERIFICA_READ_ONLY])
  })

  it('toda consulta de datos empieza con SELECT o WITH y se ejecutan por queryRaw', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { prisma, sentencias } = prismaSimulado('on')
    await cargarSnapshot(prisma)
    const consultas = sentencias.slice(1)
    expect(consultas.length).toBeGreaterThan(10)
    for (const c of consultas) {
      expect(c.tipo).toBe('query')
      expect(c.sql.trim()).toMatch(/^(SELECT|WITH)\b/i)
    }
    for (const sql of CONSULTAS_SNAPSHOT) expect(sql.trim()).toMatch(/^(SELECT|WITH)\b/i)
  })

  it('no selecciona CUIL, persona ni nombres', () => {
    for (const sql of CONSULTAS_SNAPSHOT) {
      expect(sql).not.toMatch(/\bcuil\b/i)
      expect(sql).not.toMatch(/persona_id|apellido|\bnombres?\b\s*,?\s*FROM personas/i)
    }
  })
})

describe('el directorio no tiene código de escritura', () => {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const fuentes = fs
    .readdirSync(dir)
    // limpieza.ts, kpisDotacion.ts (lo usa solo repoPrisma.ts) y repoPrisma.ts son los UNICOS modulos con SQL de escritura
    // (locales y con guardaBase); el dry-run no puede usarlos.
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !['limpieza.ts', 'kpisDotacion.ts', 'repoPrisma.ts'].includes(f))

  /** Quita comentarios de bloque y de línea (aproximación suficiente para este chequeo). */
  const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

  it('hay fuentes que revisar', () => {
    expect(fuentes).toEqual(expect.arrayContaining(['cruce.ts', 'sistemaReadonly.ts', 'reporteCsv.ts', 'dry-run.ts']))
  })

  it('el dry-run y el reporte no invocan ejecutarLimpieza', () => {
    for (const archivo of ['dry-run.ts', 'sistemaReadonly.ts', 'reporteCsv.ts', 'cruce.ts']) {
      const t = fs.readFileSync(path.join(dir, archivo), 'utf8')
      expect(t, archivo).not.toContain('ejecutarLimpieza')
      expect(t, archivo).not.toContain('repoPrisma')
      expect(t, archivo).not.toContain('kpisDotacion')
      expect(t, archivo).not.toContain('ejecutarCarga')
    }
  })
  it('kpisDotacion.ts (DELETE/INSERT de kpis_dotacion_snapshot) solo lo importa repoPrisma.ts', () => {
    const importadores = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .filter((f) => /from '\.\/kpisDotacion\.js'/.test(fs.readFileSync(path.join(dir, f), 'utf8')))
    expect(importadores).toEqual(['repoPrisma.ts'])
  })
  const prohibidos = ['.create(', '.createMany(', '.update(', '.updateMany(', '.delete(', '.deleteMany(', '.upsert(', 'INSERT ', 'UPDATE ', 'DELETE ']
  for (const archivo of fuentes) {
    it(`${archivo} no contiene sentencias de escritura`, () => {
      const t = sinComentarios(fs.readFileSync(path.join(dir, archivo), 'utf8'))
      for (const p of prohibidos) expect(t, `${archivo} contiene ${p}`).not.toContain(p)
    })
  }
})

describe('contarTablasBorrar', () => {
  it('abre READ ONLY, verifica y solo ejecuta SELECT count', async () => {
    const { contarTablasBorrar, CONSULTAS_CONTEO_BORRADO } = await import('./sistemaReadonly.js')
    const { prisma, sentencias } = prismaSimulado('on')
    await contarTablasBorrar(prisma)
    expect(sentencias[0].sql).toBe(SQL_READ_ONLY)
    expect(sentencias.slice(2).map((s) => s.sql)).toEqual([...CONSULTAS_CONTEO_BORRADO])
    expect(CONSULTAS_CONTEO_BORRADO.every((q) => /^SELECT count\(\*\)/.test(q))).toBe(true)
  })
  it('aborta si no es solo lectura', async () => {
    const { contarTablasBorrar } = await import('./sistemaReadonly.js')
    await expect(contarTablasBorrar(prismaSimulado('off').prisma)).rejects.toThrow(/solo lectura/)
  })
})
