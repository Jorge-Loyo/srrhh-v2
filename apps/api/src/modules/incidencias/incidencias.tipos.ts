// Registro de tipos de incidencia (design §7): cada tipo = slug + contar() +
// listar(); "Todo" es la unión. Agregar un tipo = un objeto acá + su entrada en
// TABS_INCIDENCIAS del web. Las pestañas de incidencias NO llevan permiso
// `tab:*` propio (son vistas bajo `incidencias/ver`); esos permisos por pestaña
// se eliminaron en el commit c3cf0cf.
import { prisma } from '../../shared/prisma.js'
import { normalizarBusqueda, coincideBusqueda } from './incidencias.clasificacion.js'
import { esCargoGestionable } from './incidencias.gestionable.js'
import {
  obtenerSnapshotIncidencias,
  itemsBajaSinConcurso,
  filtrarPorQueryYCarrera,
  camposBusquedaBaja,
  calcularConciliacion,
  type ConciliacionGrupos,
  type ContextoIncidencias,
} from './incidencias.baja-sin-concurso.js'
import {
  leerIncidenciasPersistidas,
  filtrarPersistidas,
  construirItemPersistido,
  ordenarPersistidas,
} from './incidencias.persistidas.js'

// Slugs de pestaña (web). 'otras' AGRUPA los tres 'otras:*' persistidos en una
// sola pestaña (decisión de negocio); el resto mapea 1:1 con el slug persistido.
export type TipoSlug =
  | 'sial-sin-cargo'
  | 'baja-sin-concurso'
  | 'cayo-del-padron'
  | 'cambio-situacion-revista'
  | 'cambios-del-puesto'
  | 'otras'

export interface FiltrosComunes {
  q?: string
  carrera?: string
}

export interface OpcionesLectura {
  refrescar?: boolean
}

// Forma común de la unión ("Todo").
export interface IncidenciaItem {
  clave: string
  tipo: TipoSlug
  tipoLabel: string
  idSial: string | null
  codigo: string | null
  hospitalSigla: string | null
  carrera: string | null
  puesto: string | null
  especialidad: string | null
  personaCuil: string | null
  personaNombre: string | null
  fecha: string | null
  detalle: string
  cargoId: string | null
  diffId: string | null
}

export interface TipoIncidencia {
  slug: TipoSlug
  label: string
  contar(opts?: OpcionesLectura): Promise<number>
  listar(f: FiltrosComunes, opts?: OpcionesLectura): Promise<IncidenciaItem[]>
}

// ─── Tipo: SIAL sin cargo ────────────────────────────────────────────────────

// MISMO where que getPendientesService (incidencias.service.ts). Si cambia
// allá, cambiar acá (V9 de scripts/sql/validacion-incidencias.sql verifica la paridad).
const WHERE_SIAL_SIN_CARGO = {
  tipo: 'nuevo' as const,
  aprobado: null,
  snapshot: { estado: 'aprobado' as const },
  OR: [{ campo: null }, { campo: { not: '__alta_desdoblada__' } }],
}

function cuilDeDatos(datos: Record<string, string>): string | null {
  return datos.cuil_y_rol ? datos.cuil_y_rol.split('-')[0] : null
}

// Filtro gestionable (FASE 1) para la cola "SIAL sin cargo": un id_sial nuevo
// solo es incidencia si su carrera cumple la regla (PLENOS o 83+Anexo II). El
// código y el literal del puesto vienen del JSON valorNuevo del diff. Como el
// filtro depende del JSON, el conteo NO puede hacerse con prisma.count: hay que
// traer los diffs, parsear y filtrar en TS (misma fuente de verdad que
// baja-sin-concurso vía esCargoGestionable).
function esDiffSialGestionable(datos: Record<string, string>): boolean {
  return esCargoGestionable({
    codigoRegistro: datos.codigo_de_registro ?? null,
    literalPuesto: datos.literal_puesto ?? null,
  })
}

const sialSinCargo: TipoIncidencia = {
  slug: 'sial-sin-cargo',
  label: 'SIAL sin cargo',
  async contar() {
    const diffs = await prisma.padronDiff.findMany({
      where: WHERE_SIAL_SIN_CARGO,
      select: { valorNuevo: true },
    })
    return diffs.reduce(
      (n, d) => n + (esDiffSialGestionable(JSON.parse(d.valorNuevo ?? '{}')) ? 1 : 0),
      0,
    )
  },
  async listar(f) {
    // Lectura liviana: sin diagnóstico de concurso (Todo no lo muestra).
    const diffs = await prisma.padronDiff.findMany({
      where: WHERE_SIAL_SIN_CARGO,
      select: {
        id: true,
        idSialRol: true,
        valorNuevo: true,
        snapshot: { select: { fechaAsignada: true } },
      },
    })
    const qNorm = normalizarBusqueda(f.q)
    const carreraNorm = normalizarBusqueda(f.carrera)
    const out: IncidenciaItem[] = []
    for (const d of diffs) {
      const datos: Record<string, string> = JSON.parse(d.valorNuevo ?? '{}')
      if (!esDiffSialGestionable(datos)) continue
      const escalafon = datos.escalafon ?? null
      if (carreraNorm && normalizarBusqueda(escalafon) !== carreraNorm) continue
      const cuil = cuilDeDatos(datos)
      const idSial = datos.id_sial ?? null
      if (
        !coincideBusqueda(
          { nombre: datos.ayn, cuil, idSial: `${idSial ?? ''} ${d.idSialRol}`, codigo: null },
          qNorm,
        )
      ) {
        continue
      }
      const fecha = d.snapshot.fechaAsignada.toISOString().slice(0, 10)
      const [y, m, dd] = fecha.split('-')
      out.push({
        clave: `sial-sin-cargo:${d.id}`,
        tipo: 'sial-sin-cargo',
        tipoLabel: 'SIAL sin cargo',
        idSial: idSial ?? d.idSialRol,
        codigo: null,
        hospitalSigla: datos.siglas ?? null,
        carrera: escalafon,
        puesto: datos.literal_puesto ?? null,
        especialidad: datos.especialidad ?? null,
        personaCuil: cuil,
        personaNombre: datos.ayn ?? null,
        fecha,
        detalle: `Id_sial nuevo en el padrón del ${dd}/${m}/${y}`,
        cargoId: null,
        diffId: d.id,
      })
    }
    return out
  },
}

// ─── Tipo: Baja sin concurso (adaptador de la misma implementación) ──────────

const bajaSinConcurso: TipoIncidencia = {
  slug: 'baja-sin-concurso',
  label: 'Baja sin concurso',
  async contar(opts) {
    const snap = await obtenerSnapshotIncidencias(opts)
    return itemsBajaSinConcurso(snap).length
  },
  async listar(f, opts) {
    const snap = await obtenerSnapshotIncidencias(opts)
    const items = filtrarPorQueryYCarrera(itemsBajaSinConcurso(snap), f, camposBusquedaBaja)
    return items.map((i) => ({
      clave: `baja-sin-concurso:${i.cargoId}`,
      tipo: 'baja-sin-concurso' as const,
      tipoLabel: 'Baja sin concurso',
      idSial: i.idSial,
      codigo: i.codigo,
      hospitalSigla: i.hospitalSigla,
      carrera: i.carrera,
      puesto: i.puesto,
      especialidad: i.especialidad,
      personaCuil: i.persona?.cuil ?? null,
      personaNombre: i.persona?.nombre ?? null,
      fecha: i.deteccion.fechaBaja ?? i.deteccion.fechaDeteccion,
      detalle: i.deteccion.texto,
      cargoId: i.cargoId,
      diffId: null,
    }))
  },
}

// ─── Tipos persistidos (FASE 4): leen de padron_incidencias ──────────────────
// Cada uno LEE las filas que el paso 12 ya persistió (del último snapshot
// aprobado), sin recalcular. Para la unión "Todo" / resumen exponen el
// IncidenciaItem común; las pestañas dedicadas usan el shape rico
// (incidencias.persistidas.ts) vía listarPersistidas.

// Slugs persistidos que alimentan cada pestaña. 'otras' agrupa los tres.
const SLUGS_POR_PESTANA: Record<
  'cayo-del-padron' | 'cambio-situacion-revista' | 'cambios-del-puesto' | 'otras',
  readonly string[]
> = {
  'cayo-del-padron': ['cayo-del-padron'],
  'cambio-situacion-revista': ['cambio-situacion-revista'],
  'cambios-del-puesto': ['cambios-del-puesto'],
  otras: ['otras:nueva-baja', 'otras:cambio-persona', 'otras:reaparecio'],
}

// Factory: un TipoIncidencia por pestaña persistida. `listar` devuelve el
// IncidenciaItem común (para /todo y resumen); el detalle de la pestaña "otras"
// incluye el sub-tipo para distinguir cuál de los tres es.
function tipoPersistido(
  slug: 'cayo-del-padron' | 'cambio-situacion-revista' | 'cambios-del-puesto' | 'otras',
  label: string,
): TipoIncidencia {
  const slugs = SLUGS_POR_PESTANA[slug]
  return {
    slug,
    label,
    async contar() {
      const rows = await leerIncidenciasPersistidas(slugs)
      return rows.length
    },
    async listar(f) {
      const rows = filtrarPersistidas(await leerIncidenciasPersistidas(slugs), f)
      return rows.map((r) => {
        const it = construirItemPersistido(r)
        const detalle =
          slug === 'otras' && it.subTipo
            ? `${it.subTipo}: ${it.detalle ?? ''}`.trim()
            : it.detalle ?? label
        return {
          clave: it.clave,
          tipo: slug,
          tipoLabel: label,
          idSial: it.idSial,
          codigo: it.codigo,
          hospitalSigla: it.hospitalSigla,
          carrera: it.carrera,
          puesto: it.puesto,
          especialidad: it.especialidad,
          personaCuil: it.personaCuil,
          personaNombre: it.personaNombre,
          fecha: it.fecha,
          detalle,
          cargoId: it.cargoId,
          diffId: null,
        }
      })
    },
  }
}

const cayoDelPadron = tipoPersistido('cayo-del-padron', 'Cayó del padrón')
const cambioSituacionRevista = tipoPersistido('cambio-situacion-revista', 'Cambió la situación de revista')
const cambiosDelPuesto = tipoPersistido('cambios-del-puesto', 'Cambios del puesto')
const otras = tipoPersistido('otras', 'Otras incidencias')

export const TIPOS_INCIDENCIA: TipoIncidencia[] = [
  sialSinCargo,
  bajaSinConcurso,
  cayoDelPadron,
  cambioSituacionRevista,
  cambiosDelPuesto,
  otras,
]

// ─── Listado dedicado (shape rico) por pestaña persistida ─────────────────────
// Lo usan las rutas GET /incidencias/<slug> de las pestañas nuevas. Devuelve el
// IncidenciaPersistidaItem completo (campos ant/nue por tipo) + paginación, con
// el mismo contrato de meta que /todo y /baja-sin-concurso. `subTipo` solo en
// 'otras'.
export async function listarPersistidas(
  slug: 'cayo-del-padron' | 'cambio-situacion-revista' | 'cambios-del-puesto' | 'otras',
  f: FiltrosComunes & { page: number; pageSize: number },
) {
  const slugs = SLUGS_POR_PESTANA[slug]
  const rows = filtrarPersistidas(await leerIncidenciasPersistidas(slugs), f)
  const items = ordenarPersistidas(rows.map(construirItemPersistido))
  const total = items.length
  const pages = Math.max(1, Math.ceil(total / f.pageSize))
  const start = (f.page - 1) * f.pageSize
  return {
    items: items.slice(start, start + f.pageSize),
    meta: { total, page: f.page, pageSize: f.pageSize, pages },
    generadoAt: new Date().toISOString(),
  }
}

// ─── Unión ("Todo") ──────────────────────────────────────────────────────────

export interface FiltrosTodo extends FiltrosComunes {
  tipo?: TipoSlug
  page: number
  pageSize: number
}

export async function listarTodo(
  f: FiltrosTodo,
  tipos: TipoIncidencia[] = TIPOS_INCIDENCIA,
  opts: OpcionesLectura = {},
) {
  const listas = await Promise.all(tipos.map((t) => t.listar({ q: f.q, carrera: f.carrera }, opts)))
  const porTipo = Object.fromEntries(tipos.map((t, i) => [t.slug, listas[i].length])) as Record<TipoSlug, number>
  const unidos = listas.flat().filter((i) => !f.tipo || i.tipo === f.tipo)
  // fecha ascendente (más antiguas primero), nulls al final, desempate por clave.
  unidos.sort((a, b) => {
    if (a.fecha == null && b.fecha != null) return 1
    if (a.fecha != null && b.fecha == null) return -1
    if (a.fecha != null && b.fecha != null && a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1
    return a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0
  })
  const total = unidos.length
  const pages = Math.max(1, Math.ceil(total / f.pageSize))
  const start = (f.page - 1) * f.pageSize
  return {
    items: unidos.slice(start, start + f.pageSize),
    meta: { total, page: f.page, pageSize: f.pageSize, pages },
    generadoAt: new Date().toISOString(),
    porTipo,
  }
}

// ─── Resumen (contadores + conciliación) ─────────────────────────────────────

export interface ResumenIncidencias {
  tabs: Record<TipoSlug | 'todo', number>
  conciliacion: ConciliacionGrupos
  contexto: ContextoIncidencias
  generadoAt: string
}

export async function resumenIncidencias(
  opts: OpcionesLectura = {},
  tipos: TipoIncidencia[] = TIPOS_INCIDENCIA,
): Promise<ResumenIncidencias> {
  const conteos = await Promise.all(tipos.map((t) => t.contar(opts)))
  const tabs = Object.fromEntries(tipos.map((t, i) => [t.slug, conteos[i]])) as Record<TipoSlug, number>
  const snap = await obtenerSnapshotIncidencias(opts)
  return {
    tabs: { todo: conteos.reduce((a, b) => a + b, 0), ...tabs },
    conciliacion: calcularConciliacion(snap),
    contexto: snap.contexto,
    generadoAt: snap.generadoAt.toISOString(),
  }
}
