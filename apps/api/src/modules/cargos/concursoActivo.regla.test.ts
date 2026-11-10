import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { EstadoConcursoCph, EstadoConcursoCeetps } from '@prisma/client'

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  padronSnapshot: { findFirst: vi.fn() },
  bajaSialSnapshot: { findFirst: vi.fn() },
}))
vi.mock('../../shared/prisma.js', () => ({ prisma: prismaMock }))

import {
  ESTADOS_CPH_ACTIVOS,
  ESTADOS_CEETPS_ACTIVOS,
  ESTADOS_CPH_TERMINALES,
  ESTADOS_CEETPS_TERMINALES,
  concursoCuentaComoActivo,
  concursoPendienteAutorizacion,
  sqlEstadoCphActivo,
  sqlEstadoCeetpsActivo,
  sqlConcursoAutorizadoParaContar,
  sqlCargoTieneConcursoActivo,
  type ConcursoParaRegla,
} from './concursoActivo.regla.js'
import { recalcularSubEstado, tieneConcursoActivo, type SubEstadoTx } from './subEstado.repo.js'
import { obtenerSnapshotIncidencias, _resetCacheIncidencias } from '../incidencias/incidencias.baja-sin-concurso.js'

const AUTORIZADO = new Date('2026-11-12T00:00:00Z')
const c = (over: Partial<ConcursoParaRegla>): ConcursoParaRegla => ({
  tipo: 'cph',
  estado: 'activo',
  motivoConcurso: 'cobertura_dotacion',
  autorizadoAt: null,
  ...over,
})

describe('regla TS: concursoCuentaComoActivo', () => {
  it('estados activos + terminales cubren exactamente los enums de Prisma', () => {
    expect([...ESTADOS_CPH_ACTIVOS, ...ESTADOS_CPH_TERMINALES].sort()).toEqual(Object.values(EstadoConcursoCph).sort())
    expect([...ESTADOS_CEETPS_ACTIVOS, ...ESTADOS_CEETPS_TERMINALES].sort()).toEqual(
      Object.values(EstadoConcursoCeetps).sort(),
    )
  })

  it('CPH y CEETPS activos que no son nuevo_cargo cuentan (sin cambio)', () => {
    expect(concursoCuentaComoActivo(c({}))).toBe(true)
    expect(concursoCuentaComoActivo(c({ tipo: 'ceetps', estado: 'en_proceso' }))).toBe(true)
  })
  it('nuevo_cargo sin autorizado_at NO cuenta; con autorizado_at sí (CPH y CEETPS)', () => {
    for (const tipo of ['cph', 'ceetps'] as const) {
      const estado = tipo === 'cph' ? 'no_iniciado' : 'sin_autorizar'
      expect(concursoCuentaComoActivo(c({ tipo, estado, motivoConcurso: 'nuevo_cargo' }))).toBe(false)
      expect(concursoPendienteAutorizacion(c({ tipo, estado, motivoConcurso: 'nuevo_cargo' }))).toBe(true)
      expect(concursoCuentaComoActivo(c({ tipo, estado, motivoConcurso: 'nuevo_cargo', autorizadoAt: AUTORIZADO }))).toBe(true)
      expect(concursoPendienteAutorizacion(c({ tipo, estado, motivoConcurso: 'nuevo_cargo', autorizadoAt: AUTORIZADO }))).toBe(false)
    }
  })
  it('finalizado / desierto no cuentan aunque estén autorizados', () => {
    expect(concursoCuentaComoActivo(c({ estado: 'finalizado', motivoConcurso: 'nuevo_cargo', autorizadoAt: AUTORIZADO }))).toBe(false)
    expect(concursoCuentaComoActivo(c({ tipo: 'ceetps', estado: 'desierto' }))).toBe(false)
    expect(concursoPendienteAutorizacion(c({ estado: 'finalizado', motivoConcurso: 'nuevo_cargo' }))).toBe(false)
  })
  it('motivo NULL sigue contando (IS DISTINCT FROM, no <>)', () => {
    expect(concursoCuentaComoActivo(c({ motivoConcurso: null }))).toBe(true)
    expect(concursoCuentaComoActivo(c({ tipo: 'ceetps', estado: 'autorizado', motivoConcurso: undefined }))).toBe(true)
  })
  it('los concursos EXISTENTES no cambian de comportamiento (todos los motivos actuales, autorizado_at NULL)', () => {
    const motivos = [null, 'cobertura_dotacion', 'alta_por_baja', 'retencion_de_cargo']
    for (const motivoConcurso of motivos) {
      for (const estado of ['no_iniciado', 'activo', 'suspendido', 'finalizado']) {
        // comportamiento previo CPH: estado != finalizado
        expect(concursoCuentaComoActivo(c({ tipo: 'cph', estado, motivoConcurso }))).toBe(estado !== 'finalizado')
      }
      for (const estado of ['sin_autorizar', 'autorizado', 'en_proceso', 'finalizado', 'desierto']) {
        // comportamiento previo CEETPS: estado NOT IN (finalizado, desierto)
        expect(concursoCuentaComoActivo(c({ tipo: 'ceetps', estado, motivoConcurso }))).toBe(
          !['finalizado', 'desierto'].includes(estado),
        )
      }
    }
  })
})

// Tx mock que interpreta el `where` Prisma que arma tieneConcursoActivo.
interface FilaConcurso {
  estado: string
  concurso: { motivoConcurso: string | null; autorizadoAt: Date | null }
}
function txCon(cph: FilaConcurso[], ceetps: FilaConcurso[]): SubEstadoTx {
  type Cond = { motivoConcurso?: null | { not: string }; autorizadoAt?: { not: null } }
  const cumple = (f: FilaConcurso, w: { estado: { notIn: string[] }; concurso: { OR: Cond[] } }) =>
    !w.estado.notIn.includes(f.estado) &&
    w.concurso.OR.some((k) => {
      if ('motivoConcurso' in k) {
        if (k.motivoConcurso === null) return f.concurso.motivoConcurso === null
        // semántica SQL de Prisma `not`: excluye NULL
        return f.concurso.motivoConcurso !== null && f.concurso.motivoConcurso !== k.motivoConcurso!.not
      }
      return f.concurso.autorizadoAt !== null
    })
  return {
    ocupacion: { count: async () => 0 },
    concursoCph: { count: async ({ where }: { where: never }) => cph.filter((f) => cumple(f, where)).length },
    concursoCeetps: { count: async ({ where }: { where: never }) => ceetps.filter((f) => cumple(f, where)).length },
  } as unknown as SubEstadoTx
}
const fila = (estado: string, motivoConcurso: string | null, autorizadoAt: Date | null = null): FilaConcurso => ({
  estado,
  concurso: { motivoConcurso, autorizadoAt },
})

describe('subEstado.repo: tieneConcursoActivo / recalcularSubEstado con la regla nueva', () => {
  it('CPH activo no nuevo_cargo -> concurso (sin cambio)', async () => {
    const tx = txCon([fila('activo', 'cobertura_dotacion')], [])
    expect(await tieneConcursoActivo(tx, 'x')).toBe(true)
    expect(await recalcularSubEstado(tx, 'x', 'vigente')).toBe('concurso')
  })
  it('nuevo_cargo sin autorizado_at -> vacante; con autorizado_at -> concurso (CPH)', async () => {
    expect(await recalcularSubEstado(txCon([fila('no_iniciado', 'nuevo_cargo')], []), 'x', 'vigente')).toBe('vacante')
    expect(await recalcularSubEstado(txCon([fila('no_iniciado', 'nuevo_cargo', AUTORIZADO)], []), 'x', 'vigente')).toBe('concurso')
  })
  it('CEETPS igual', async () => {
    expect(await recalcularSubEstado(txCon([], [fila('sin_autorizar', 'nuevo_cargo')]), 'x', 'vigente')).toBe('vacante')
    expect(await recalcularSubEstado(txCon([], [fila('sin_autorizar', 'nuevo_cargo', AUTORIZADO)]), 'x', 'vigente')).toBe('concurso')
    expect(await recalcularSubEstado(txCon([], [fila('en_proceso', 'alta_por_baja')]), 'x', 'vigente')).toBe('concurso')
  })
  it('finalizado / desierto no cuentan', async () => {
    expect(await recalcularSubEstado(txCon([fila('finalizado', 'cobertura_dotacion')], [fila('desierto', null)]), 'x', 'vigente')).toBe('vacante')
  })
  it('motivo NULL sigue contando', async () => {
    expect(await recalcularSubEstado(txCon([fila('activo', null)], []), 'x', 'vigente')).toBe('concurso')
    expect(await recalcularSubEstado(txCon([], [fila('autorizado', null)]), 'x', 'vigente')).toBe('concurso')
  })
  it('un nuevo_cargo sin autorizar no tapa a otro concurso que sí cuenta', async () => {
    const tx = txCon([fila('no_iniciado', 'nuevo_cargo'), fila('activo', 'alta_por_baja')], [])
    expect(await recalcularSubEstado(tx, 'x', 'vigente')).toBe('concurso')
  })
})

// ─── PARIDAD regla TS <-> SQL ───────────────────────────────────────────────
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const raiz = resolve(__dirname, '../../../../../')

describe('paridad: la regla TS coincide con todas las copias SQL', () => {
  it('fragmentos generados usan las listas y la condición de la regla', () => {
    expect(sqlEstadoCphActivo('cph')).toBe("cph.estado::text IN ('no_iniciado','activo','suspendido')")
    expect(sqlEstadoCeetpsActivo('ce')).toBe("ce.estado::text IN ('sin_autorizar','autorizado','en_proceso')")
    expect(sqlConcursoAutorizadoParaContar('co')).toBe(
      "(co.motivo_concurso IS DISTINCT FROM 'nuevo_cargo' OR co.autorizado_at IS NOT NULL)",
    )
  })

  it('paso 11 (padron.service.ts) arma el SQL con el fragmento compartido y sin listas propias', () => {
    const src = readFileSync(resolve(raiz, 'apps/api/src/modules/padron/padron.service.ts'), 'utf8')
    expect(src).toContain("Prisma.raw(sqlCargoTieneConcursoActivo('c.id'))")
    expect(src).not.toContain("'no_iniciado','activo','suspendido'")
    expect(src).not.toContain("'sin_autorizar','autorizado','en_proceso'")
    const frag = norm(sqlCargoTieneConcursoActivo('c.id'))
    expect(frag).toContain(sqlEstadoCphActivo('cph'))
    expect(frag).toContain(sqlEstadoCeetpsActivo('ce'))
    expect(frag.split(sqlConcursoAutorizadoParaContar('co'))).toHaveLength(3) // una vez por tipo
    expect(frag).toContain('JOIN concursos co ON co.id = cph.concurso_id')
    expect(frag).toContain('JOIN concursos co ON co.id = ce.concurso_id')
  })

  describe('Incidencias (CTE conc generada)', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      _resetCacheIncidencias()
    })
    it('contiene exactamente las listas de estado y la condición de la regla', async () => {
      prismaMock.$queryRaw.mockResolvedValue([])
      prismaMock.padronSnapshot.findFirst.mockResolvedValue(null)
      prismaMock.bajaSialSnapshot.findFirst.mockResolvedValue(null)
      await obtenerSnapshotIncidencias({ refrescar: true })
      const textos = prismaMock.$queryRaw.mock.calls.map(([strings, ...vals]: [TemplateStringsArray, ...unknown[]]) =>
        strings.reduce((acc, s, i) => acc + s + (i < vals.length ? ((vals[i] as { sql?: string } | null)?.sql ?? '?') : ''), ''),
      )
      const sql = norm(textos.find((t: string) => t.includes('conc AS')) as string)
      expect(sql).toContain(sqlEstadoCphActivo('cph'))
      expect(sql).toContain(sqlEstadoCeetpsActivo('ce'))
      expect(sql.split(sqlConcursoAutorizadoParaContar('co')).length - 1).toBe(2)
      expect(sql).toContain('bool_or(x.activo AND x.cuenta) AS concurso_activo')
      expect(sql).toContain('bool_or(x.activo AND NOT x.cuenta) AS pendiente_autorizacion')
      expect(sql).toContain('bool_or(NOT x.activo) AS tuvo_concurso_cerrado')
    })
  })

  it('scripts/sql/recalcular-sub-estado-cargos.sql contiene la misma condición y listas', () => {
    const sql = norm(readFileSync(resolve(raiz, 'scripts/sql/recalcular-sub-estado-cargos.sql'), 'utf8').replace(/^--.*$/gm, ''))
    const cond = sqlConcursoAutorizadoParaContar('co')
    // 2 copias en la vista de cálculo + 2 en la verificación final
    expect(sql.split(cond).length - 1).toBe(4)
    expect(sql.split(sqlEstadoCphActivo('cph')).length - 1).toBe(2)
    expect(sql.split(sqlEstadoCeetpsActivo('ce')).length - 1).toBe(2)
    expect(sql).toContain('JOIN concursos co ON co.id = cph.concurso_id')
    expect(sql).toContain('JOIN concursos co ON co.id = ce.concurso_id')
  })

  it('scripts/sql/validacion-incidencias.sql (espejo de Incidencias) usa la misma condición', () => {
    const sql = norm(readFileSync(resolve(raiz, 'scripts/sql/validacion-incidencias.sql'), 'utf8').replace(/^--.*$/gm, ''))
    expect(sql).toContain(sqlConcursoAutorizadoParaContar('co'))
    expect(sql).toContain('bool_or(x.activo AND x.cuenta) AS concurso_activo')
  })
})
