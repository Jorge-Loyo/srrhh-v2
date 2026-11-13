// ─────────────────────────────────────────────────────────────────────────────
// Escalafones duplicados del import del padrón (decisión de Jorge, 12-nov). SOLO base local.
//
//   - 'Docentes-c32a65d' ("Docentes", código autogenerado) es un duplicado de '7' ("Docentes Históricos"): todo lo que
//     cuelga de él (cargos, códigos de registro, puestos, especialidades, solicitudes, concursos CEETPS) pasa al '7'. Un
//     puesto del duplicado que ya existe en el '7' (misma modalidad y nombre) se FUSIONA con ese (sus cargos y especialidades
//     se reapuntan al puesto del '7'); los demás se mueven. Después el duplicado se elimina si quedó sin referencias.
//   - Escalafones basura del import (sin cargos ni códigos de registro): se eliminan SOLO si no tienen NINGUNA referencia;
//     si tienen alguna se listan y no se borran. '16T' y '17B' son válidos y no se tocan.
//   - Cualquier otro escalafón con código autogenerado (`<texto>-<7 hex>`) se lista para Jorge, no se toca.
//
// Idempotente: sin el duplicado ni la basura no hace nada. Corre después del escalafón 37 y antes de la carga.
// Las referencias se descubren desde pg_constraint (todas las FK a escalafones / puestos_cargo / especialidades_puesto),
// de modo que una tabla nueva con FK no queda colgada del escalafón viejo.
// ─────────────────────────────────────────────────────────────────────────────
import type { EscalafonFila } from './escalafon.js'

export const ESCALAFON_DOCENTES_DUPLICADO = 'Docentes-c32a65d'
export const ESCALAFON_DOCENTES_DESTINO = '7'
export const CODIGO_REGISTRO_DOCENTES = '07'
/** Escalafones basura del import: se eliminan solo si no tienen ninguna referencia. */
export const ESCALAFONES_BASURA: readonly string[] = [
  '??????????-dc9e5e1', 'Cuerpos Tran-7b86ceb', 'ENF', 'Escalafón Ge-6e87859', 'Médicos-4cf50c8', 'Planta Trans-2f3a5d7',
  'Planta de Ga-18d7782', 'Residentes-a18608f', 'TEC', 'carrera gere-dd1dfec', 'ceetps-a761bd9', 'cuerpos tran-af443df',
  'docentes-f2b3efd', 'escalafon ge-9513e8d', 'medicos-81310d8', 'residentes-812940a',
]
/** Código autogenerado por el import: `<texto>-<7 hex>`. */
export const esCodigoAutogenerado = (codigo: string): boolean => /^.+-[0-9a-f]{7}$/.test(codigo)

export interface FkRef {
  tabla: string
  col: string
}
/** Todas las FK hacia una tabla (solo lectura). `$1` = nombre de la tabla referenciada. */
export const SQL_FKS_HACIA = `
SELECT cl.relname AS tabla, a.attname AS col
FROM pg_constraint k
JOIN pg_class cl ON cl.oid = k.conrelid
JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)
WHERE k.contype = 'f' AND k.confrelid = ($1)::text::regclass
ORDER BY 1, 2`
export const SQL_ESCALAFONES_TODOS = 'SELECT id::text AS id, codigo, nombre FROM escalafones ORDER BY codigo'
/** Puestos del origen que ya existen en el destino (misma modalidad y nombre). */
export const SQL_PUESTOS_COINCIDENTES = `
SELECT o.id::text AS origen, d.id::text AS destino
FROM puestos_cargo o JOIN puestos_cargo d ON d.escalafon_id = $2::uuid AND d.modalidad = o.modalidad AND d.nombre = o.nombre
WHERE o.escalafon_id = $1::uuid ORDER BY o.id`
export const SQL_ESPECIALIDADES_COINCIDENTES = `
SELECT o.id::text AS origen, d.id::text AS destino
FROM especialidades_puesto o JOIN especialidades_puesto d ON d.puesto_cargo_id = $2::uuid AND d.nombre = o.nombre
WHERE o.puesto_cargo_id = $1::uuid ORDER BY o.id`

const IDENT = /^[a-z_][a-z0-9_]*$/i
/** Identificador SQL entre comillas; los nombres vienen de pg_catalog, pero se validan igual. */
export function ident(nombre: string): string {
  if (!IDENT.test(nombre)) throw new Error(`Identificador SQL no valido: ${nombre}`)
  return `"${nombre}"`
}

export interface RepoEscalafonesDuplicados {
  escalafonesTodos(): Promise<EscalafonFila[]>
  /** Filas que referencian al escalafón (suma sobre todas las FK a escalafones). */
  referenciasEscalafon(id: string): Promise<number>
  fusionarEscalafon(origenId: string, destinoId: string): Promise<ResumenFusionEscalafon>
  eliminarEscalafon(id: string): Promise<void>
}
export interface ResumenFusionEscalafon {
  puestos_fusionados: number
  puestos_movidos: number
  especialidades_fusionadas: number
  /** Filas reapuntadas por tabla. */
  filas_movidas: Record<string, number>
}
export interface ResultadoEscalafonesDuplicados {
  docentes: 'ya_aplicado' | 'fusionado'
  fusion: ResumenFusionEscalafon | null
  eliminados: string[]
  /** Basura con referencias: no se borra. */
  con_referencias: { codigo: string; referencias: number }[]
  /** Otros códigos autogenerados que quedan (para Jorge). */
  autogenerados_restantes: { codigo: string; nombre: string; referencias: number }[]
}

/** Aplica la fusión de Docentes y la limpieza de escalafones basura. Idempotente. */
export async function ejecutarEscalafonesDuplicados(repo: RepoEscalafonesDuplicados): Promise<ResultadoEscalafonesDuplicados> {
  const escalafones = await repo.escalafonesTodos()
  const porCodigo = (c: string) => escalafones.find((e) => e.codigo === c)
  const eliminados: string[] = []
  let fusion: ResumenFusionEscalafon | null = null
  let docentes: ResultadoEscalafonesDuplicados['docentes'] = 'ya_aplicado'
  const origen = porCodigo(ESCALAFON_DOCENTES_DUPLICADO)
  if (origen) {
    const destino = porCodigo(ESCALAFON_DOCENTES_DESTINO)
    if (!destino) throw new Error(`No existe el escalafon "${ESCALAFON_DOCENTES_DESTINO}" (Docentes Historicos): no se puede fusionar el duplicado.`)
    fusion = await repo.fusionarEscalafon(origen.id, destino.id)
    docentes = 'fusionado'
    if ((await repo.referenciasEscalafon(origen.id)) === 0) {
      await repo.eliminarEscalafon(origen.id)
      eliminados.push(origen.codigo)
    }
  }
  const conReferencias: ResultadoEscalafonesDuplicados['con_referencias'] = []
  for (const codigo of ESCALAFONES_BASURA) {
    const e = porCodigo(codigo)
    if (!e) continue
    const n = await repo.referenciasEscalafon(e.id)
    if (n === 0) {
      await repo.eliminarEscalafon(e.id)
      eliminados.push(codigo)
    } else conReferencias.push({ codigo, referencias: n })
  }
  const restantes: ResultadoEscalafonesDuplicados['autogenerados_restantes'] = []
  for (const e of escalafones) {
    if (!esCodigoAutogenerado(e.codigo) || eliminados.includes(e.codigo)) continue
    restantes.push({ codigo: e.codigo, nombre: e.nombre, referencias: await repo.referenciasEscalafon(e.id) })
  }
  return { docentes, fusion, eliminados, con_referencias: conReferencias, autogenerados_restantes: restantes }
}

/** Lo que el dry-run informa de este paso (solo lectura): qué se movería y qué se eliminaría. */
export interface PlanFusionEscalafones {
  docentes_duplicado_existe: boolean
  /** Filas por tabla que pasarían del duplicado al '7'. */
  filas_a_mover: Record<string, number>
  puestos_a_fusionar: number
  puestos_a_mover: number
  a_eliminar: string[]
  con_referencias: { codigo: string; referencias: number }[]
  autogenerados_restantes: { codigo: string; nombre: string; referencias: number }[]
}
type Consulta = { $queryRawUnsafe<T = unknown>(sql: string, ...valores: unknown[]): Promise<T> }
/** Arma el plan SOLO con SELECT (se usa en el dry-run y en los tests). */
export async function planificarFusionEscalafones(q: Consulta): Promise<PlanFusionEscalafones> {
  const escalafones = await q.$queryRawUnsafe<EscalafonFila[]>(SQL_ESCALAFONES_TODOS)
  const fks = await q.$queryRawUnsafe<FkRef[]>(SQL_FKS_HACIA, 'escalafones')
  const referencias = async (id: string) => {
    let n = 0
    for (const f of fks) {
      const r = await q.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${ident(f.tabla)} WHERE ${ident(f.col)} = $1::uuid`, id)
      n += Number(r[0]?.n ?? 0)
    }
    return n
  }
  const origen = escalafones.find((e) => e.codigo === ESCALAFON_DOCENTES_DUPLICADO)
  const destino = escalafones.find((e) => e.codigo === ESCALAFON_DOCENTES_DESTINO)
  const filas: Record<string, number> = {}
  let fusionar = 0
  let mover = 0
  if (origen) {
    for (const f of fks) {
      const r = await q.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${ident(f.tabla)} WHERE ${ident(f.col)} = $1::uuid`, origen.id)
      if (Number(r[0]?.n ?? 0) > 0) filas[`${f.tabla}.${f.col}`] = Number(r[0].n)
    }
    const total = filas['puestos_cargo.escalafon_id'] ?? 0
    fusionar = destino ? (await q.$queryRawUnsafe<unknown[]>(SQL_PUESTOS_COINCIDENTES, origen.id, destino.id)).length : 0
    mover = total - fusionar
  }
  const aEliminar: string[] = origen ? [origen.codigo] : []
  const conRef: PlanFusionEscalafones['con_referencias'] = []
  for (const codigo of ESCALAFONES_BASURA) {
    const e = escalafones.find((x) => x.codigo === codigo)
    if (!e) continue
    const n = await referencias(e.id)
    if (n === 0) aEliminar.push(codigo)
    else conRef.push({ codigo, referencias: n })
  }
  const restantes: PlanFusionEscalafones['autogenerados_restantes'] = []
  for (const e of escalafones) {
    if (esCodigoAutogenerado(e.codigo) && !aEliminar.includes(e.codigo)) restantes.push({ codigo: e.codigo, nombre: e.nombre, referencias: await referencias(e.id) })
  }
  return { docentes_duplicado_existe: Boolean(origen), filas_a_mover: filas, puestos_a_fusionar: fusionar, puestos_a_mover: mover, a_eliminar: aEliminar, con_referencias: conRef, autogenerados_restantes: restantes }
}
