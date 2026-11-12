// Acceso a datos de la pestaña "Bloqueados" (SOLO LECTURA, on-demand). Lee las
// ocupaciones VIVAS (hasta IS NULL) cuyo puesto está bloqueado (fecha_bloqueo IS
// NOT NULL), restringidas al universo gestionable (sqlCargoGestionable). El
// bloqueo es una CONDICIÓN VIGENTE del puesto, no un evento del paso 12, por eso
// NO se persiste: se consulta en vivo.
//
// NOTA (FASE 5): hasta que entre un padrón nuevo procesado con el pipeline v2
// (FEAT-001 puebla bien fecha_bloqueo), esta pestaña mostrará ~5 filas — las
// únicas ocupaciones vivas que hoy tienen fecha_bloqueo cargada. Es ESPERADO:
// NO hay backfill. Con el próximo padrón la lista se completa.
import { prisma } from '../../shared/prisma.js'
import { sqlCargoGestionable } from './incidencias.baja-sin-concurso.js'
import { normalizarBusqueda, coincideBusqueda } from './incidencias.clasificacion.js'

// ─── Tipo del contrato ───────────────────────────────────────────────────────

export interface BloqueadosItem {
  cargoId: string
  idSial: string | null
  codigoRegistro: string | null
  hospitalSigla: string | null
  carrera: string | null
  puesto: string | null
  especialidad: string | null
  persona: { cuil: string | null; nombre: string | null } | null
  fechaBloqueo: string | null
  bloqMotivo: string | null
  bloqueoComentario: string | null
}

// Fila cruda de la query (snake_case, como la devuelve Postgres).
export interface BloqueadoRow {
  cargo_id: string
  id_sial: string | null
  codigo_registro: string | null
  hospital_sigla: string | null
  carrera: string | null
  literal_puesto: string | null
  especialidad: string | null
  persona_cuil: string | null
  persona_nombre: string | null
  fecha_bloqueo: Date | null
  bloq_motivo: string | null
  bloqueo_comentario: string | null
}

export interface FiltrosBloqueados {
  page: number
  pageSize: number
  q?: string
  carrera?: string
  refrescar?: boolean
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null)

// ─── Query (solo lectura, sin parámetros de usuario) ─────────────────────────
// Ocupaciones VIVAS bloqueadas, universo gestionable. Query directa (sin el
// snapshot cacheado de baja-sin-concurso): la pestaña es simple y de bajo
// volumen. `sqlCargoGestionable` se reutiliza TAL CUAL (espejo SQL de
// esCargoGestionable: PLENOS 37/22/23/85/87 + 83 ∈ ANEXO_II_83).
async function obtenerBloqueados(): Promise<BloqueadoRow[]> {
  return prisma.$queryRaw<BloqueadoRow[]>`
SELECT
  c.id                                       AS cargo_id,
  c.id_sial                                  AS id_sial,
  cr.codigo                                  AS codigo_registro,
  h.sigla                                    AS hospital_sigla,
  e.nombre                                   AS carrera,
  c.literal_puesto                           AS literal_puesto,
  COALESCE(ep.nombre, c.especialidad_legacy) AS especialidad,
  p.cuil                                     AS persona_cuil,
  p.apellido_nombre                          AS persona_nombre,
  o.fecha_bloqueo                            AS fecha_bloqueo,
  o.bloq_motivo                              AS bloq_motivo,
  o.bloqueo_comentario                       AS bloqueo_comentario
FROM ocupaciones o
JOIN cargos c                    ON c.id = o.cargo_id AND c.deleted_at IS NULL
JOIN personas p                  ON p.id = o.persona_id
LEFT JOIN hospitales h           ON h.id = c.hospital_id
LEFT JOIN escalafones e          ON e.id = c.escalafon_id
LEFT JOIN especialidades_puesto ep ON ep.id = c.especialidad_puesto_id
LEFT JOIN codigos_registro cr    ON cr.id = c.codigo_registro_id
WHERE o.hasta IS NULL
  AND o.fecha_bloqueo IS NOT NULL
  AND ${sqlCargoGestionable('c')}
ORDER BY o.fecha_bloqueo DESC NULLS LAST, c.id_sial`
}

// ─── Construcción de ítems ───────────────────────────────────────────────────

export function construirItemBloqueado(r: BloqueadoRow): BloqueadosItem {
  return {
    cargoId: r.cargo_id,
    idSial: r.id_sial,
    codigoRegistro: r.codigo_registro,
    hospitalSigla: r.hospital_sigla,
    carrera: r.carrera,
    puesto: r.literal_puesto,
    especialidad: r.especialidad,
    persona:
      r.persona_cuil || r.persona_nombre
        ? { cuil: r.persona_cuil ?? null, nombre: r.persona_nombre ?? null }
        : null,
    fechaBloqueo: iso(r.fecha_bloqueo),
    bloqMotivo: r.bloq_motivo,
    bloqueoComentario: r.bloqueo_comentario,
  }
}

// Filtro q/carrera en memoria (mismo criterio que las demás pestañas).
export function filtrarBloqueados(items: BloqueadosItem[], f: { q?: string; carrera?: string }): BloqueadosItem[] {
  const qNorm = normalizarBusqueda(f.q)
  const carreraNorm = normalizarBusqueda(f.carrera)
  return items.filter((i) => {
    if (carreraNorm && normalizarBusqueda(i.carrera) !== carreraNorm) return false
    return coincideBusqueda(
      { nombre: i.persona?.nombre, cuil: i.persona?.cuil, idSial: i.idSial, codigo: i.codigoRegistro },
      qNorm,
    )
  })
}

// ─── Listado filtrado / paginado ─────────────────────────────────────────────

export async function listarBloqueados(f: FiltrosBloqueados) {
  const items = (await obtenerBloqueados()).map(construirItemBloqueado)
  const filtrados = filtrarBloqueados(items, f)
  const total = filtrados.length
  const pages = Math.max(1, Math.ceil(total / f.pageSize))
  const start = (f.page - 1) * f.pageSize
  return {
    items: filtrados.slice(start, start + f.pageSize),
    meta: { total, page: f.page, pageSize: f.pageSize, pages },
    generadoAt: new Date().toISOString(),
  }
}
