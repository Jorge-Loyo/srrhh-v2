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
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))

  /** Quita comentarios de bloque y de línea (aproximación suficiente para este chequeo). */
  const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

  it('hay fuentes que revisar', () => {
    expect(fuentes).toEqual(expect.arrayContaining(['cruce.ts', 'sistemaReadonly.ts', 'reporteCsv.ts', 'dry-run.ts']))
  })

  const prohibidos = ['.create(', '.createMany(', '.update(', '.updateMany(', '.delete(', '.deleteMany(', '.upsert(', 'INSERT ', 'UPDATE ', 'DELETE ']
  for (const archivo of fuentes) {
    it(`${archivo} no contiene sentencias de escritura`, () => {
      const t = sinComentarios(fs.readFileSync(path.join(dir, archivo), 'utf8'))
      for (const p of prohibidos) expect(t, `${archivo} contiene ${p}`).not.toContain(p)
    })
  }
})
