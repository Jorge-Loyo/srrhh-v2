import { describe, expect, it } from 'vitest'
import { regenerarKpisDotacion, sqlKpisInsertar, SQL_KPIS_BORRAR } from './kpisDotacion.js'

const ESTADO = 'WITH cortes AS (SELECT 1) SELECT v.* FROM vigente v'

describe('kpisDotacion', () => {
  it('el INSERT reutiliza el CTE del sistema y agrega por carrera y situacion mas la fila (total)', () => {
    const sql = sqlKpisInsertar(ESTADO)
    expect(sql).toContain(`WITH estado AS (${ESTADO})`)
    expect(sql).toContain('INSERT INTO kpis_dotacion_snapshot (fecha, codigo_registro, situacion_revista, personas)')
    expect(sql).toContain("'(total)'")
    expect(sql).toContain('count(DISTINCT cuil)')
    // la agregacion toma el codigo de registro del cargo (el que dejo la carga)
    expect(sql).toContain('JOIN cargos c ON c.id = estado.cargo_id')
    expect(sql).toContain('LEFT JOIN codigos_registro cr ON cr.id = c.codigo_registro_id')
  })
  it('rechaza un estado que no sea un WITH', () => {
    expect(() => sqlKpisInsertar('SELECT 1')).toThrow(/WITH/)
  })
  it('borra y luego inserta; devuelve las filas insertadas', async () => {
    const sentencias: string[] = []
    const n = await regenerarKpisDotacion(
      { $executeRawUnsafe: async (sql) => (sentencias.push(sql), sql.includes('INSERT') ? 7 : 3) },
      async () => ESTADO,
    )
    expect(n).toBe(7)
    expect(sentencias).toHaveLength(2)
    expect(sentencias[0]).toBe(SQL_KPIS_BORRAR)
    expect(sentencias[1]).toContain('INSERT INTO kpis_dotacion_snapshot')
  })
  it('es idempotente: el DELETE previo hace que repetir no duplique (misma secuencia de sentencias)', async () => {
    const a: string[] = []
    const b: string[] = []
    const tx = (log: string[]) => ({ $executeRawUnsafe: async (sql: string) => (log.push(sql), 1) })
    await regenerarKpisDotacion(tx(a), async () => ESTADO)
    await regenerarKpisDotacion(tx(b), async () => ESTADO)
    expect(a).toEqual(b)
    expect(a[0]).toBe(SQL_KPIS_BORRAR)
  })
  it('el CTE real del sistema se puede importar y no trae parametros', async () => {
    const { estadoActivoSqlDelSistema } = await import('./kpisDotacion.js')
    const sql = await estadoActivoSqlDelSistema()
    expect(sql).toMatch(/^\s*WITH cortes AS/)
    expect(() => sqlKpisInsertar(sql)).not.toThrow()
  })
})
