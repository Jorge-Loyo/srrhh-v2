// FASE 4 (design §D.2): lectura (SOLO LECTURA) de las incidencias del ciclo de
// vida del cargo que el paso 12 ya PERSISTIÓ en `padron_incidencias`. A
// diferencia de "SIAL sin cargo" / "Baja sin concurso" (que derivan on-demand de
// padron_diff / cálculo), estas pestañas NO recalculan nada: leen las filas de
// `padron_incidencias` del ÚLTIMO snapshot aprobado y las enriquecen con los
// datos del cargo (hospital, carrera, puesto, especialidad, persona viva).
//
// Las columnas resuelta/resolucion de la tabla NO se tocan (son del próximo
// sprint). Acá no se filtra por resuelta: se muestran todas las incidencias del
// snapshot.
import { prisma } from '../../shared/prisma.js'
import { normalizarBusqueda, coincideBusqueda } from './incidencias.clasificacion.js'

// Slugs persistidos en padron_incidencias.tipo (espejo de
// incidencias.clasificacion.ts). La pestaña "otras" AGRUPA los tres 'otras:*'.
export type TipoPersistidoSlug =
  | 'cayo-del-padron'
  | 'cambio-situacion-revista'
  | 'cambios-del-puesto'
  | 'otras:nueva-baja'
  | 'otras:cambio-persona'
  | 'otras:reaparecio'

// Fila cruda del JOIN padron_incidencias → cargos (snake_case, como la devuelve
// Postgres). persona_* viene de la ocupación viva del cargo (hasta IS NULL).
export interface IncidenciaPersistidaRow {
  id: string
  tipo: string
  cargo_id: string | null
  id_sial: string | null
  id_sial_rol: string | null
  estado_anterior: unknown
  estado_nuevo: unknown
  detalle: string | null
  created_at: Date
  codigo: string | null
  hospital_sigla: string | null
  carrera: string | null
  puesto: string | null
  especialidad: string | null
  persona_cuil: string | null
  persona_nombre: string | null
  fecha_asignada: Date | null
}

// Lee las filas persistidas del último snapshot aprobado para un conjunto de
// slugs. Sin filtros de usuario (q/carrera se aplican en TS, igual que las
// demás pestañas). Devuelve [] si no hay snapshot aprobado o no hay filas.
export async function leerIncidenciasPersistidas(
  slugs: readonly string[],
): Promise<IncidenciaPersistidaRow[]> {
  if (slugs.length === 0) return []
  const placeholders = slugs.map((_, i) => `$${i + 1}`).join(', ')
  // $queryRawUnsafe para poder expandir la lista de slugs; los valores van
  // SIEMPRE como parámetros ligados (no se interpola ningún input de usuario).
  return prisma.$queryRawUnsafe<IncidenciaPersistidaRow[]>(
    `
WITH ult_padron AS (
  SELECT id
  FROM padron_snapshots
  WHERE estado::text = 'aprobado'
  ORDER BY fecha_asignada DESC
  LIMIT 1
),
occ_viva AS (
  SELECT DISTINCT ON (o.cargo_id)
         o.cargo_id, p.cuil AS persona_cuil, p.apellido_nombre AS persona_nombre
  FROM ocupaciones o
  JOIN personas p ON p.id = o.persona_id
  WHERE o.hasta IS NULL
  ORDER BY o.cargo_id, o.desde DESC NULLS LAST
)
SELECT
  pi.id,
  pi.tipo,
  pi.cargo_id,
  pi.id_sial,
  pi.id_sial_rol,
  pi.estado_anterior,
  pi.estado_nuevo,
  pi.detalle,
  pi.created_at,
  c.codigo,
  h.sigla AS hospital_sigla,
  e.nombre AS carrera,
  c.literal_puesto AS puesto,
  c.especialidad_legacy AS especialidad,
  occ_viva.persona_cuil,
  occ_viva.persona_nombre,
  s.fecha_asignada
FROM padron_incidencias pi
JOIN ult_padron u        ON u.id = pi.snapshot_id
JOIN padron_snapshots s  ON s.id = pi.snapshot_id
LEFT JOIN cargos c       ON c.id = pi.cargo_id
LEFT JOIN hospitales h   ON h.id = c.hospital_id
LEFT JOIN escalafones e  ON e.id = c.escalafon_id
LEFT JOIN occ_viva       ON occ_viva.cargo_id = pi.cargo_id
WHERE pi.tipo IN (${placeholders})`,
    ...slugs,
  )
}

const iso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)

// Campos de búsqueda comunes (persona / id_sial / código), igual que las demás
// pestañas (coincideBusqueda / FiltrosComunes).
function camposBusqueda(r: IncidenciaPersistidaRow) {
  return {
    nombre: r.persona_nombre,
    cuil: r.persona_cuil,
    idSial: `${r.id_sial ?? ''} ${r.id_sial_rol ?? ''}`,
    codigo: r.codigo,
  }
}

// Aplica q (búsqueda) + carrera en TS (misma semántica que
// filtrarPorQueryYCarrera de baja-sin-concurso).
export function filtrarPersistidas(
  rows: IncidenciaPersistidaRow[],
  f: { q?: string; carrera?: string },
): IncidenciaPersistidaRow[] {
  const qNorm = normalizarBusqueda(f.q)
  const carreraNorm = normalizarBusqueda(f.carrera)
  return rows.filter((r) => {
    if (carreraNorm && normalizarBusqueda(r.carrera) !== carreraNorm) return false
    return coincideBusqueda(camposBusqueda(r), qNorm)
  })
}

// Forma de un estado persistido (Json?); el acceso es defensivo porque la
// columna es libre (puede ser null o tener claves distintas por tipo).
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}
function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

// Sub-tipo legible de la pestaña "Otras" a partir del slug 'otras:*'.
export function subTipoOtras(slug: string): string {
  switch (slug) {
    case 'otras:nueva-baja':
      return 'Nueva baja'
    case 'otras:cambio-persona':
      return 'Cambió la persona'
    case 'otras:reaparecio':
      return 'Reapareció'
    default:
      return slug
  }
}

// Campos ant/nue expuestos a la UI por tipo (solo los que cada pestaña muestra).
export interface IncidenciaPersistidaItem {
  clave: string
  id: string
  tipo: TipoPersistidoSlug
  subTipo: string | null
  idSial: string | null
  idSialRol: string | null
  codigo: string | null
  hospitalSigla: string | null
  carrera: string | null
  puesto: string | null
  especialidad: string | null
  personaCuil: string | null
  personaNombre: string | null
  fecha: string | null
  detalle: string | null
  cargoId: string | null
  // Situación de revista (tipo 'cambio-situacion-revista').
  situacionAnterior: string | null
  situacionNueva: string | null
  elegibleReemplazante: boolean
  // Puesto/especialidad (tipo 'cambios-del-puesto').
  puestoAnterior: string | null
  puestoNuevo: string | null
  especialidadAnterior: string | null
  especialidadNueva: string | null
}

// El detalle de "elegible para reemplazante" lo escribe el paso 12 en el texto
// del detalle (incidencias.paso12.ts). La UI lo destaca leyendo el detalle, sin
// recalcular la regla.
function esElegibleDesdeDetalle(detalle: string | null): boolean {
  return normalizarBusqueda(detalle).includes('elegible para reemplazante')
}

export function construirItemPersistido(r: IncidenciaPersistidaRow): IncidenciaPersistidaItem {
  const ant = obj(r.estado_anterior)
  const nue = obj(r.estado_nuevo)
  const esOtras = r.tipo.startsWith('otras:')
  return {
    clave: `${r.tipo}:${r.id}`,
    id: r.id,
    tipo: r.tipo as TipoPersistidoSlug,
    subTipo: esOtras ? subTipoOtras(r.tipo) : null,
    idSial: r.id_sial ?? r.id_sial_rol,
    idSialRol: r.id_sial_rol,
    codigo: r.codigo,
    hospitalSigla: r.hospital_sigla,
    carrera: r.carrera,
    puesto: r.puesto,
    especialidad: r.especialidad,
    personaCuil: r.persona_cuil,
    personaNombre: r.persona_nombre,
    fecha: iso(r.fecha_asignada),
    detalle: r.detalle,
    cargoId: r.cargo_id,
    situacionAnterior: str(ant.situacionRevista),
    situacionNueva: str(nue.situacionRevista),
    elegibleReemplazante: esElegibleDesdeDetalle(r.detalle),
    puestoAnterior: str(ant.literalPuesto),
    puestoNuevo: str(nue.literalPuesto),
    especialidadAnterior: str(ant.especialidad),
    especialidadNueva: str(nue.especialidad),
  }
}

// Orden estable: fecha asc (nulls al final), desempate por clave (igual que /todo).
export function ordenarPersistidas(items: IncidenciaPersistidaItem[]): IncidenciaPersistidaItem[] {
  return [...items].sort((a, b) => {
    if (a.fecha == null && b.fecha != null) return 1
    if (a.fecha != null && b.fecha == null) return -1
    if (a.fecha != null && b.fecha != null && a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1
    return a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0
  })
}
