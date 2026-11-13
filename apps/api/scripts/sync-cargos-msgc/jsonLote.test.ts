import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { jsonLote, TAMANIO_CHUNK_SQL, trocear } from './jsonLote.js'

const DIR = dirname(fileURLToPath(import.meta.url))

describe('jsonLote', () => {
  it('lote vacio -> []', () => expect(jsonLote([])).toBe('[]'))
  it('undefined se emite como null explicito', () => {
    expect(jsonLote([{ a: 'x', b: undefined, c: null }])).toBe('[{"a":"x","b":null,"c":null}]')
  })
  it('conserva booleanos, numeros y texto con comillas/unicode', () => {
    const filas = [{ t: 'a"b\\c ñ', ok: false, n: 0 }]
    expect(JSON.parse(jsonLote(filas))).toEqual(filas)
  })
  it('lista de ids', () => expect(jsonLote(['a', 'b'])).toBe('["a","b"]'))
})

describe('trocear', () => {
  it('parte en trozos de a lo sumo n', () => {
    expect(trocear([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(trocear([], 2)).toEqual([])
  })
  it('por defecto 2000 filas', () => {
    expect(trocear(Array.from({ length: 4001 }, (_, i) => i)).map((t) => t.length)).toEqual([TAMANIO_CHUNK_SQL, TAMANIO_CHUNK_SQL, 1])
  })
})

describe('SQL del sync: ningun parametro array', () => {
  const fuentes = readdirSync(DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  it('hay fuentes que revisar', () => expect(fuentes).toContain('repoPrisma.ts'))
  it('ninguna sentencia usa $N::tipo[] ni unnest($N)', () => {
    for (const f of fuentes) {
      const src = readFileSync(join(DIR, f), 'utf8')
      expect(src.match(/\$\d+::[a-z_]+\[\]/gi) ?? [], `${f}: cast a array de un parametro`).toEqual([])
      expect(src.match(/::(uuid|text|boolean|int|integer|date|timestamp)\[\]/g) ?? [], `${f}: cast ::tipo[]`).toEqual([])
      expect(src.match(/unnest\(\s*\$/gi) ?? [], `${f}: unnest($N)`).toEqual([])
    }
  })
  it('ningun execute/query pasa un array JS (arrTexto ya no existe)', () => {
    for (const f of fuentes) expect(readFileSync(join(DIR, f), 'utf8'), f).not.toMatch(/arrTexto/)
  })
})
