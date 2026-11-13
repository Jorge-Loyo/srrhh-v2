import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { arrTexto } from './arrayTexto.js'

const DIR = dirname(fileURLToPath(import.meta.url))

describe('arrTexto', () => {
  it('vacio -> vacio', () => expect(arrTexto([])).toEqual([]))
  it('todo null/undefined -> nulls', () => expect(arrTexto([null, undefined])).toEqual([null, null]))
  it('uuid/texto quedan como string', () => expect(arrTexto(['a-b', 'c'])).toEqual(['a-b', 'c']))
  it('boolean -> true/false', () => expect(arrTexto([true, false, null])).toEqual(['true', 'false', null]))
  it('numero -> string', () => expect(arrTexto([1, 0])).toEqual(['1', '0']))
})

describe('SQL crudo del sync', () => {
  const fuentes = readdirSync(DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  it('ningun $N::uuid[] / ::boolean[] sin pasar por text[]', () => {
    for (const f of fuentes) {
      const src = readFileSync(join(DIR, f), 'utf8')
      expect(src.match(/\$\d+::(uuid|boolean|int|integer|date|timestamp)\[\]/g) ?? [], f).toEqual([])
    }
  })
  it('los uuid[] siempre vienen de text[]', () => {
    for (const f of fuentes) {
      const src = readFileSync(join(DIR, f), 'utf8')
      expect(src.match(/(?<!::text\[\])::(uuid|boolean)\[\]/g) ?? [], f).toEqual([])
    }
  })
})
