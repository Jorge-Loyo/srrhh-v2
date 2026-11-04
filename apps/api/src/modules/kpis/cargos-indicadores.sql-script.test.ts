import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SUB_ESTADOS_CONCURSO_CPH } from './cargos-indicadores.clasificacion.js'

// Mantiene el script de validación de Jorge sincronizado con el código: la
// lista de sub-estados vive en una sola fuente (SUB_ESTADOS_CONCURSO_CPH).
describe('scripts/sql/validacion-indicadores-cargos.sql', () => {
  const ruta = resolve(__dirname, '../../../../../scripts/sql/validacion-indicadores-cargos.sql')
  const sql = readFileSync(ruta, 'utf8')

  it('\\set sub_estados contiene exactamente SUB_ESTADOS_CONCURSO_CPH', () => {
    const linea = sql.split('\n').find((l) => l.startsWith('\\set sub_estados'))
    expect(linea).toBeTruthy()
    const valores = [...linea!.matchAll(/''([^']+)''/g)].map((m) => m[1])
    expect(valores).toEqual([...SUB_ESTADOS_CONCURSO_CPH])
  })

  it('es solo lectura: sin INSERT/UPDATE/DELETE/DROP TABLE/ALTER', () => {
    const sinComentarios = sql.replace(/--.*$/gm, '')
    expect(sinComentarios).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|TRUNCATE)\b/i)
    expect(sinComentarios).not.toMatch(/DROP\s+TABLE/i)
    expect(sinComentarios).toMatch(/DROP VIEW IF EXISTS pg_temp\.v_ind_hoja/)
  })
})
