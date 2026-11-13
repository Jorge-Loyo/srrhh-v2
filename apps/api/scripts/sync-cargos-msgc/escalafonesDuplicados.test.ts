import { describe, expect, it } from 'vitest'
import {
  ESCALAFONES_BASURA,
  ESCALAFON_DOCENTES_DESTINO,
  ESCALAFON_DOCENTES_DUPLICADO,
  ejecutarEscalafonesDuplicados,
  esCodigoAutogenerado,
  ident,
  planificarFusionEscalafones,
  type RepoEscalafonesDuplicados,
} from './escalafonesDuplicados.js'
import type { EscalafonFila } from './escalafon.js'

const E = (id: string, codigo: string, nombre = codigo): EscalafonFila => ({ id, codigo, nombre })
function repoEn(escalafones: EscalafonFila[], referencias: Record<string, number> = {}) {
  const log: string[] = []
  const repo: RepoEscalafonesDuplicados = {
    escalafonesTodos: async () => [...escalafones],
    referenciasEscalafon: async (id) => referencias[id] ?? 0,
    fusionarEscalafon: async (o, d) => {
      log.push(`fusionar ${o}->${d}`)
      referencias[o] = 0
      return { puestos_fusionados: 7, puestos_movidos: 4, especialidades_fusionadas: 0, filas_movidas: { 'cargos.escalafon_id': 775 } }
    },
    eliminarEscalafon: async (id) => {
      log.push(`eliminar ${id}`)
      escalafones.splice(escalafones.findIndex((e) => e.id === id), 1)
    },
  }
  return { repo, log, escalafones }
}

describe('escalafones duplicados', () => {
  it('reconoce los codigos autogenerados', () => {
    expect(esCodigoAutogenerado('Docentes-c32a65d')).toBe(true)
    expect(esCodigoAutogenerado('??????????-dc9e5e1')).toBe(true)
    expect(esCodigoAutogenerado('16T')).toBe(false)
    expect(esCodigoAutogenerado('17B')).toBe(false)
    expect(ESCALAFONES_BASURA).toHaveLength(16)
    expect(ESCALAFONES_BASURA).not.toContain('16T')
    expect(ESCALAFONES_BASURA).not.toContain('17B')
  })
  it('fusiona Docentes en el 7, elimina el duplicado y la basura sin referencias', async () => {
    const { repo, log } = repoEn([E('d', ESCALAFON_DOCENTES_DUPLICADO), E('7', ESCALAFON_DOCENTES_DESTINO), E('b', 'ENF'), E('x', '16T')], { d: 800 })
    const r = await ejecutarEscalafonesDuplicados(repo)
    expect(r.docentes).toBe('fusionado')
    expect(r.fusion?.puestos_fusionados).toBe(7)
    expect(r.eliminados).toEqual([ESCALAFON_DOCENTES_DUPLICADO, 'ENF'])
    expect(log).toEqual(['fusionar d->7', 'eliminar d', 'eliminar b'])
  })
  it('NO borra la basura que tiene alguna referencia y la informa', async () => {
    const { repo, log } = repoEn([E('7', '7'), E('t', 'TEC')], { t: 3 })
    const r = await ejecutarEscalafonesDuplicados(repo)
    expect(r.eliminados).toEqual([])
    expect(r.con_referencias).toEqual([{ codigo: 'TEC', referencias: 3 }])
    expect(log).toEqual([])
  })
  it('lista otros codigos autogenerados que quedan (no los toca)', async () => {
    const { repo } = repoEn([E('7', '7'), E('o', 'Otro-1234abc', 'Otro')], { o: 2 })
    const r = await ejecutarEscalafonesDuplicados(repo)
    expect(r.autogenerados_restantes).toEqual([{ codigo: 'Otro-1234abc', nombre: 'Otro', referencias: 2 }])
  })
  it('es idempotente: sin duplicado ni basura no escribe nada', async () => {
    const { repo, log } = repoEn([E('7', '7'), E('x', '16T')])
    const r = await ejecutarEscalafonesDuplicados(repo)
    expect(r.docentes).toBe('ya_aplicado')
    expect(r.eliminados).toEqual([])
    expect(log).toEqual([])
  })
  it('falla si existe el duplicado pero no el escalafon 7', async () => {
    const { repo } = repoEn([E('d', ESCALAFON_DOCENTES_DUPLICADO)])
    await expect(ejecutarEscalafonesDuplicados(repo)).rejects.toThrow(/Docentes Historicos/)
  })
  it('ident rechaza identificadores raros', () => {
    expect(ident('cargos')).toBe('"cargos"')
    expect(() => ident('x"; DROP TABLE y; --')).toThrow()
  })
  it('el plan de solo lectura (dry-run) usa solo SELECT', async () => {
    const sqls: string[] = []
    const q = {
      $queryRawUnsafe: async (sql: string, ...v: unknown[]) => {
        sqls.push(sql)
        if (/FROM escalafones ORDER/.test(sql)) return [E('d', ESCALAFON_DOCENTES_DUPLICADO), E('7', '7'), E('b', 'TEC')]
        if (/pg_constraint/.test(sql)) return [{ tabla: 'cargos', col: 'escalafon_id' }, { tabla: 'puestos_cargo', col: 'escalafon_id' }]
        if (/puestos_cargo o JOIN/.test(sql)) return [{ origen: 'a', destino: 'b' }]
        if (/count/.test(sql)) return [{ n: v[0] === 'd' ? 5 : 0 }]
        return []
      },
    }
    const p = await planificarFusionEscalafones(q)
    expect(p.docentes_duplicado_existe).toBe(true)
    expect(p.a_eliminar).toEqual([ESCALAFON_DOCENTES_DUPLICADO, 'TEC'])
    expect(p.puestos_a_fusionar).toBe(1)
    for (const s of sqls) expect(s.trim()).toMatch(/^(SELECT|WITH)\b/i)
  })
})
