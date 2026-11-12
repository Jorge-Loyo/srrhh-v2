import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import {
  CLASIFICACION,
  TABLAS_BORRAR,
  TABLAS_SQL_CRUDO_CONSERVAR,
  construirPlanBorrado,
  ejecutarLimpieza,
  resumirBajas,
  type TxEscritura,
} from './limpieza.js'

const modelos = Prisma.dmmf.datamodel.models
const tablaDe = (m: { name: string; dbName?: string | null }) => m.dbName ?? m.name
const nombreModelo = new Map(modelos.map((m) => [m.name, tablaDe(m)]))

interface Fk {
  origen: string
  destino: string
  opcional: boolean
  cascade: boolean
}
const fks: Fk[] = []
for (const m of modelos) {
  for (const f of m.fields) {
    if (f.kind !== 'object' || !f.relationFromFields || f.relationFromFields.length === 0) continue
    const campos = f.relationFromFields.map((n) => m.fields.find((x) => x.name === n))
    fks.push({
      origen: tablaDe(m),
      destino: nombreModelo.get(f.type) as string,
      opcional: campos.every((c) => c && !c.isRequired),
      cascade: f.relationOnDelete === 'Cascade',
    })
  }
}
const posicion = new Map(TABLAS_BORRAR.map((t, i) => [t.tabla, i]))

describe('clasificacion de tablas', () => {
  it('todas las tablas del schema estan clasificadas (falla si aparece un modelo nuevo)', () => {
    const sinClasificar = modelos.map(tablaDe).filter((t) => !(t in CLASIFICACION))
    expect(sinClasificar).toEqual([])
  })

  it('no hay clasificaciones de tablas que no existen en el schema', () => {
    const reales = new Set(modelos.map(tablaDe))
    expect(Object.keys(CLASIFICACION).filter((t) => !reales.has(t))).toEqual([])
  })

  it('TABLAS_BORRAR coincide exactamente con las clasificadas BORRAR y no repite', () => {
    const lista = TABLAS_BORRAR.map((t) => t.tabla)
    expect(new Set(lista).size).toBe(lista.length)
    const borrar = Object.entries(CLASIFICACION).filter(([, c]) => c === 'BORRAR').map(([t]) => t)
    expect([...lista].sort()).toEqual([...borrar].sort())
  })

  it('las tablas de SQL crudo no estan en el schema ni en TABLAS_BORRAR', () => {
    for (const t of TABLAS_SQL_CRUDO_CONSERVAR) {
      expect(t in CLASIFICACION).toBe(false)
      expect(posicion.has(t)).toBe(false)
    }
  })
})

describe('decisiones de Jorge sobre tablas dudosas (12-nov)', () => {
  it('kpis_dotacion_snapshot y tareas_pendientes se borran; padron_diff y baja_sial_* se conservan; no queda ninguna dudosa', () => {
    expect(CLASIFICACION.kpis_dotacion_snapshot).toBe('BORRAR')
    expect(CLASIFICACION.tareas_pendientes).toBe('BORRAR')
    expect(TABLAS_BORRAR.find((t) => t.tabla === 'kpis_dotacion_snapshot')).toMatchObject({ alcance: 'todo', donde: '' })
    expect(TABLAS_BORRAR.some((t) => t.tabla === 'tareas_pendientes')).toBe(true)
    for (const t of ['padron_diff', 'baja_sial_snapshots', 'baja_sial_diffs', 'baja_sial_registros']) {
      expect(CLASIFICACION[t], t).toBe('CONSERVAR')
      expect(TABLAS_BORRAR.some((x) => x.tabla === t), t).toBe(false)
    }
    expect(Object.entries(CLASIFICACION).filter(([, c]) => c === 'PREGUNTA')).toEqual([])
  })
})
describe('integridad referencial de la limpieza', () => {
  it('ninguna tabla CONSERVAR/PREGUNTA depende de una BORRAR por cascade ni por FK requerida', () => {
    const violaciones = fks.filter(
      (f) => CLASIFICACION[f.origen] !== 'BORRAR' && CLASIFICACION[f.destino] === 'BORRAR' && (f.cascade || !f.opcional),
    )
    expect(violaciones).toEqual([])
  })

  it('las FK opcionales de tablas conservadas hacia tablas BORRAR quedan en SET NULL (no cascade)', () => {
    const f = fks.filter((x) => CLASIFICACION[x.origen] !== 'BORRAR' && CLASIFICACION[x.destino] === 'BORRAR')
    expect(f.every((x) => x.opcional && !x.cascade)).toBe(true)
  })

  it('orden FK valido: una tabla con FK requerida (no cascade) a otra BORRAR se borra antes', () => {
    for (const f of fks) {
      if (!posicion.has(f.origen) || !posicion.has(f.destino) || f.cascade || f.opcional) continue
      expect(posicion.get(f.origen), `${f.origen} debe borrarse antes que ${f.destino}`).toBeLessThan(posicion.get(f.destino) as number)
    }
  })
})

describe('construirPlanBorrado', () => {
  it('usa el total para alcance todo y el conteo exacto del cruce para concursos fuera del Excel', () => {
    const conteos = Object.fromEntries(TABLAS_BORRAR.map((t) => [t.tabla, 10]))
    const plan = construirPlanBorrado(conteos, { concursos_cph: 4, concursos_ceetps: 3, concursos: 7 })
    expect(plan.map((p) => p.tabla)).toEqual(TABLAS_BORRAR.map((t) => t.tabla))
    expect(plan.find((p) => p.tabla === 'audit_logs')).toMatchObject({ filas: 10, exacto: true })
    expect(plan.find((p) => p.tabla === 'concursos_cph')).toMatchObject({ filas: 4, exacto: true, total: 10 })
    expect(plan.find((p) => p.tabla === 'inscriptos_concurso')).toMatchObject({ filas: 10, exacto: true, alcance: 'todo' })
  })

  it('tablas sin conteo cuentan 0', () => {
    expect(construirPlanBorrado({}).every((p) => p.filas === 0)).toBe(true)
  })
})

/** Base simulada: cada tabla tiene N filas; DELETE las vacía (idempotente). */
function txSimulada(filas: Record<string, number>) {
  const sentencias: { sql: string; valores: unknown[] }[] = []
  const tx: TxEscritura = {
    $executeRawUnsafe: async (sql, ...valores) => {
      sentencias.push({ sql, valores })
      const tabla = /DELETE FROM (\w+)/.exec(sql)?.[1] as string
      const n = filas[tabla] ?? 0
      filas[tabla] = 0
      return n
    },
  }
  return { tx, sentencias }
}

describe('ejecutarLimpieza', () => {
  const local = 'postgresql://u:p@localhost:5432/srrhh'

  it('borra en orden con DELETE y la segunda corrida borra 0', async () => {
    const filas = Object.fromEntries(TABLAS_BORRAR.map((t) => [t.tabla, 5]))
    const { tx, sentencias } = txSimulada(filas)
    const r1 = await ejecutarLimpieza(tx, { databaseUrl: local, conservarConcursoIds: ['id-1'] })
    expect(Object.values(r1).every((n) => n === 5)).toBe(true)
    expect(sentencias.map((s) => /DELETE FROM (\w+)/.exec(s.sql)?.[1])).toEqual(TABLAS_BORRAR.map((t) => t.tabla))
    expect(sentencias.every((s) => s.sql.startsWith('DELETE FROM') && !/TRUNCATE/i.test(s.sql))).toBe(true)
    const r2 = await ejecutarLimpieza(tx, { databaseUrl: local, conservarConcursoIds: ['id-1'] })
    expect(Object.values(r2).every((n) => n === 0)).toBe(true)
  })

  it('pasa los concursos a conservar como parametro solo en el alcance fuera_excel', async () => {
    const { tx, sentencias } = txSimulada({})
    await ejecutarLimpieza(tx, { databaseUrl: local, conservarConcursoIds: ['a', 'b'] })
    for (const [i, t] of TABLAS_BORRAR.entries()) {
      expect(sentencias[i].valores).toEqual(t.alcance === 'todo' ? [] : [['a', 'b']])
    }
  })

  it('se niega con Neon sin ejecutar nada', async () => {
    const { tx, sentencias } = txSimulada({})
    await expect(
      ejecutarLimpieza(tx, { databaseUrl: 'postgresql://u:p@ep-x.us-east-2.aws.neon.tech/db', conservarConcursoIds: [] }),
    ).rejects.toThrow(/neon\.tech/)
    expect(sentencias).toHaveLength(0)
  })
})

describe('alcance de bajas: solo las de usuario que no sostienen un concurso conservado', () => {
  const bajas = TABLAS_BORRAR.find((t) => t.tabla === 'bajas')!
  const etiquetas = TABLAS_BORRAR.find((t) => t.tabla === 'etiquetas_baja')!
  /** Mini base: bajas (id, usuario) y concursos (id, baja_id); evalua el predicado de limpieza.ts. */
  const base = {
    bajas: [
      { id: 'b-usr-libre', usuario: true },
      { id: 'b-usr-sostiene', usuario: true },
      { id: 'b-usr-concurso-borrado', usuario: true },
      { id: 'b-sial', usuario: false },
      { id: 'b-import-con-concurso', usuario: false },
    ],
    concursos: [
      { id: 'c-conserva', baja: 'b-usr-sostiene' },
      { id: 'c-borra', baja: 'b-usr-concurso-borrado' },
      { id: 'c-borra-2', baja: 'b-import-con-concurso' },
    ],
  }
  const conservados = ['c-conserva']
  const borradas = () => {
    const sostenidas = new Set(base.concursos.filter((c) => conservados.includes(c.id)).map((c) => c.baja))
    return base.bajas.filter((b) => b.usuario && !sostenidas.has(b.id)).map((b) => b.id)
  }
  it('el SQL exige registrado_por IS NOT NULL y excluye las bajas de concursos conservados (parametro $1)', () => {
    for (const t of [bajas, etiquetas]) {
      expect(t.alcance).toBe('bajas_usuario')
      expect(t.donde).toContain('registrado_por IS NOT NULL')
      expect(t.donde).toContain('baja_id IS NOT NULL AND id = ANY($1::uuid[])')
    }
    expect(bajas.donde).not.toMatch(/registrado_por IS NULL/)
  })
  it('borra las de usuario (incluida la de un concurso que se borra) y conserva las del concurso del Excel y las sin usuario', () => {
    expect(borradas().sort()).toEqual(['b-usr-concurso-borrado', 'b-usr-libre'])
  })
  it('orden sin FK rota: concursos fuera del Excel y etiquetas_baja antes que bajas; solicitudes_alta antes que bajas', () => {
    const pos = (t: string) => TABLAS_BORRAR.findIndex((x) => x.tabla === t)
    expect(pos('concursos')).toBeLessThan(pos('bajas'))
    expect(pos('etiquetas_baja')).toBeLessThan(pos('bajas'))
    expect(pos('solicitudes_alta')).toBeLessThan(pos('bajas'))
  })
  it('la FK va de concurso a baja (SET NULL): borrar un concurso no cascada sobre la baja; ninguna FK hacia bajas es CASCADE salvo etiquetas_baja', () => {
    const haciaBajas = fks.filter((f) => f.destino === 'bajas')
    expect(haciaBajas.map((f) => f.origen).sort()).toEqual(['concursos', 'etiquetas_baja', 'solicitudes_alta'])
    expect(haciaBajas.filter((f) => f.cascade).map((f) => f.origen)).toEqual(['etiquetas_baja'])
    // Desde la baja no sale ninguna FK cascade hacia concursos.
    expect(fks.some((f) => f.origen === 'bajas' && f.destino === 'concursos')).toBe(false)
    const c = modelos.find((m) => m.name === 'Concurso')!
    expect(c.fields.find((f) => f.name === 'bajaId')?.dbName).toBe('baja_id')
  })
  it('plan: exacto de bajas = con usuario - sostenidas; etiquetas_baja cota de las de usuario; origen import se reporta aparte', () => {
    const conteos = { bajas: 3379, etiquetas_baja: 70, bajas_con_usuario: 61, bajas_sin_usuario: 3318, etiquetas_baja_con_usuario: 60 }
    const resumen = resumirBajas(conteos, 38)
    expect(resumen).toEqual({ con_usuario: 61, a_borrar: 23, conservadas_por_concurso: 38, conservadas_por_origen: 3318 })
    const plan = construirPlanBorrado(conteos, { bajas: resumen.a_borrar })
    expect(plan.find((p) => p.tabla === 'bajas')).toMatchObject({ filas: 23, exacto: true, total: 3379, alcance: 'bajas_usuario' })
    expect(plan.find((p) => p.tabla === 'etiquetas_baja')).toMatchObject({ filas: 60, exacto: false, total: 70 })
  })
  it('ejecutarLimpieza pasa los concursos a conservar a bajas y etiquetas_baja', async () => {
    const { tx, sentencias } = txSimulada({})
    await ejecutarLimpieza(tx, { databaseUrl: 'postgresql://u:p@localhost:5432/srrhh', conservarConcursoIds: ['a'] })
    const sb = sentencias.filter((s) => /DELETE FROM (bajas|etiquetas_baja)\b/.test(s.sql))
    expect(sb).toHaveLength(2)
    for (const x of sb) expect(x.valores).toEqual([['a']])
  })
})
