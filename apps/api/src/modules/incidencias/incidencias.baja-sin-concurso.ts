// Acceso a datos de la pestaña "Baja sin concurso" (SOLO LECTURA). La query
// reúne HECHOS por cargo candidato; la decisión de grupo la toma la función pura
// `clasificarCargo`. Ver .agents/tasks/incidencias-tabs/design.md §5 y §6.
import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { ANEXO_II_83 } from '../padron/derivarRegimen.js'
import { CODIGOS_REGISTRO_GESTIONABLES_PLENOS } from './incidencias.gestionable.js'
import {
  clasificarCargo,
  contarGrupos,
  resolverDeteccion,
  describirDeteccion,
  calcularDiasSinCubrir,
  normalizarBusqueda,
  coincideBusqueda,
  type CargoFacts,
  type GrupoCargo,
  type Deteccion,
} from './incidencias.clasificacion.js'

// ─── Tipos del contrato ──────────────────────────────────────────────────────

export interface BajaSinConcursoItem {
  cargoId: string
  codigo: string | null
  idSial: string | null
  hospitalSigla: string | null
  carrera: string | null
  puesto: string | null
  especialidad: string | null
  persona: { cuil: string | null; nombre: string | null } | null
  estadoCargo: 'vigente' | 'validacion_vacante'
  subEstado: 'ocupado' | 'vacante' | 'concurso' | null
  estadoDesde: string | null
  deteccion: Deteccion & {
    texto: string
    motBaja: string | null
    docRespBaja: string | null
  }
  diasSinCubrir: number | null
  bajaFormal: {
    estado: 'resolucion_a_la_firma' | 'pendiente' | 'confirmada' | 'anulada'
    generaConcurso: boolean
  } | null
  tuvoConcursoCerrado: boolean
}

export interface ContextoIncidencias {
  ultimoPadron: {
    fechaAsignada: string
    totalRegistros: number
    ratioTamano: number | null
    advertenciaTamano: string | null
  } | null
  ultimaBajaSial: { fechaArchivo: string; estado: 'pendiente' | 'aprobado' } | null
}

export interface ConteosBase {
  totalCargos: number
  noVigente: number
  ocupado: number
  vigenteSinOcupante: number
  validacionVacante: number
}

// Fila cruda de la query de hechos (snake_case, como la devuelve Postgres).
export interface HechoRow {
  cargo_id: string
  codigo: string | null
  id_sial: string | null
  estado: string
  sub_estado: string | null
  estado_desde: Date | null
  literal_puesto: string | null
  especialidad_legacy: string | null
  hospital_sigla: string | null
  carrera: string | null
  persona_cuil: string | null
  persona_nombre: string | null
  tiene_ocupante_vigente: boolean
  ocupacion_hasta: Date | null
  ocupacion_desde_ult: Date | null
  tipo_origen: string | null
  concurso_activo: boolean
  tuvo_concurso_cerrado: boolean
  alta_pendiente: boolean
  en_baja_sial: boolean
  bs_cuil: string | null
  bs_ayn: string | null
  bs_cargo_hasta: Date | null
  mot_baja: string | null
  doc_resp_baja: string | null
  bs_primera_fecha: Date | null
  ausente_ultimo_padron: boolean
  fecha_baja_padron: Date | null
  baja_estado: string | null
  baja_genera_concurso: boolean | null
}

export interface SnapshotIncidencias {
  generadoAt: Date
  hechos: HechoRow[]
  conteos: ConteosBase
  contexto: ContextoIncidencias
  // Fecha de archivo de la última carga SIAL (para el fallback de fechaDeteccion).
  ultimaBajaFechaArchivo: string | null
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null)

// ─── Predicado SQL "gestionable" (espejo de esCargoGestionable) ──────────────
// Devuelve un EXISTS sobre codigos_registro para el cargo `c`, equivalente al
// helper puro `esCargoGestionable` (incidencias.gestionable.ts): PLENOS entran
// completos; el '83' entra solo si el literal normalizado del puesto ∈ ANEXO_II_83.
//
// Normalización del literal en SQL = regla de @srrhh/normalizacion aplicada al
// '83': minúscula + sin acento + espacios colapsados + trim. Se usa
// `lower(unaccent(...))` (la extensión `unaccent` está instalada, ver migración
// 20261003000003_unaccent_search_config) más `regexp_replace('\s+',' ')` + btrim.
// unaccent() también quita la tilde de la ñ (ñ→n), a diferencia del TS que la
// mantiene; como NINGUNO de los 9 literales de ANEXO_II_83 tiene ñ, ambos lados
// dan EXACTAMENTE los mismos 9 match (ver reporte.md). Las listas se inyectan con
// Prisma.join desde CODIGOS_REGISTRO_GESTIONABLES_PLENOS y ANEXO_II_83 (una sola
// fuente de verdad, sin hardcodear dos veces).
export function sqlCargoGestionable(alias: string): Prisma.Sql {
  const c = Prisma.raw(alias)
  const plenos = Prisma.join([...CODIGOS_REGISTRO_GESTIONABLES_PLENOS])
  const anexoII = Prisma.join([...ANEXO_II_83])
  return Prisma.sql`EXISTS (
    SELECT 1 FROM codigos_registro cr
    WHERE cr.id = ${c}.codigo_registro_id
      AND (
        cr.codigo IN (${plenos})
        OR (
          cr.codigo = '83'
          AND btrim(regexp_replace(lower(unaccent(${c}.literal_puesto)), '\\s+', ' ', 'g')) IN (${anexoII})
        )
      )
  )`
}

// ─── Queries (solo lectura, sin parámetros de usuario) ───────────────────────

// IMPORTANTE: el cuerpo de esta query es el mismo de la vista temporal
// v_inc_hechos de scripts/sql/validacion-incidencias.sql. Si se cambia una,
// cambiar la otra.
async function obtenerHechosCandidatos(): Promise<HechoRow[]> {
  return prisma.$queryRaw<HechoRow[]>`
WITH ult_padron AS (
  SELECT id, fecha_asignada, total_registros, ratio_tamano, advertencia_tamano
  FROM padron_snapshots
  WHERE estado::text = 'aprobado'
  ORDER BY fecha_asignada DESC
  LIMIT 1
),
ult_baja AS (
  SELECT id, fecha_archivo, estado::text AS estado
  FROM baja_sial_snapshots
  WHERE estado::text IN ('pendiente', 'aprobado')
  ORDER BY fecha_archivo DESC
  LIMIT 1
),
cand AS (
  SELECT c.*
  FROM cargos c
  WHERE c.deleted_at IS NULL
    AND ${sqlCargoGestionable('c')}
    AND (
      c.estado::text = 'validacion_vacante'
      OR (c.estado::text = 'vigente'
          AND NOT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL))
    )
),
occ AS (
  SELECT DISTINCT ON (o.cargo_id)
         o.cargo_id, o.hasta AS occ_hasta, p.cuil AS persona_cuil, p.apellido_nombre AS persona_nombre
  FROM ocupaciones o
  JOIN cand ON cand.id = o.cargo_id
  JOIN personas p ON p.id = o.persona_id
  ORDER BY o.cargo_id, (o.hasta IS NULL) DESC, o.hasta DESC NULLS LAST, o.desde DESC NULLS LAST
),
occ_max AS (
  SELECT o.cargo_id, max(o.hasta) AS ultima_hasta, max(o.desde) AS ultima_desde
  FROM ocupaciones o JOIN cand ON cand.id = o.cargo_id
  GROUP BY o.cargo_id
),
elim_hist AS (
  SELECT o.cargo_id, max(s.fecha_asignada) AS fecha_baja_padron
  FROM padron_diff d
  JOIN padron_snapshots s ON s.id = d.snapshot_id AND s.estado::text = 'aprobado'
  JOIN ocupaciones o ON o.id_sial_rol = d.id_sial_rol
  JOIN cand ON cand.id = o.cargo_id
  WHERE d.tipo::text = 'eliminado' AND d.campo IS NULL
  GROUP BY o.cargo_id
),
elim_ult AS (
  SELECT o.cargo_id
  FROM padron_diff d
  JOIN ult_padron u ON u.id = d.snapshot_id
  JOIN ocupaciones o ON o.id_sial_rol = d.id_sial_rol
  JOIN cand ON cand.id = o.cargo_id
  WHERE d.tipo::text = 'eliminado'
  UNION
  SELECT cand.id
  FROM padron_diff d
  JOIN ult_padron u ON u.id = d.snapshot_id
  JOIN cand ON cand.id_sial = d.id_sial_rol
  WHERE d.tipo::text = 'eliminado'
),
alta_pend AS (
  SELECT DISTINCT cand.id AS cargo_id
  FROM padron_diff d
  JOIN padron_snapshots s ON s.id = d.snapshot_id AND s.estado::text = 'aprobado'
  JOIN cand ON cand.id_sial IS NOT NULL
           AND (d.id_sial_rol = cand.id_sial OR starts_with(d.id_sial_rol, cand.id_sial || '-'))
  WHERE d.tipo::text = 'nuevo' AND d.aprobado IS NULL
    AND (d.campo IS NULL OR d.campo <> '__alta_desdoblada__')
),
bs AS (
  SELECT DISTINCT ON (r.cargo)
         r.cargo AS id_sial, r.cuil AS bs_cuil, r.ayn AS bs_ayn, r.cargo_hasta AS bs_cargo_hasta,
         r.mot_baja, r.doc_resp_baja
  FROM baja_sial_registros r
  JOIN ult_baja u ON u.id = r.snapshot_id
  JOIN cand ON cand.id_sial = r.cargo
  ORDER BY r.cargo, r.cargo_hasta DESC NULLS LAST
),
bs_primera AS (
  SELECT d.cargo AS id_sial, min(s.fecha_archivo) AS bs_primera_fecha
  FROM baja_sial_diffs d
  JOIN baja_sial_snapshots s ON s.id = d.snapshot_id
  WHERE d.tipo::text = 'nuevo' AND s.estado::text IN ('pendiente', 'aprobado')
    AND d.cargo IN (SELECT id_sial FROM cand WHERE id_sial IS NOT NULL)
  GROUP BY d.cargo
),
conc AS (
  SELECT x.cargo_id,
         bool_or(x.activo)     AS concurso_activo,
         bool_or(NOT x.activo) AS tuvo_concurso_cerrado
  FROM (
    SELECT cph.cargo_id, cph.estado::text IN ('no_iniciado','activo','suspendido') AS activo
      FROM concursos_cph cph WHERE cph.cargo_id IN (SELECT id FROM cand)
    UNION ALL
    SELECT ce.cargo_id, ce.estado::text IN ('sin_autorizar','autorizado','en_proceso') AS activo
      FROM concursos_ceetps ce WHERE ce.cargo_id IN (SELECT id FROM cand)
  ) x
  GROUP BY x.cargo_id
),
bf AS (
  SELECT DISTINCT ON (b.cargo_id) b.cargo_id, b.estado::text AS baja_estado, b.genera_concurso
  FROM bajas b JOIN cand ON cand.id = b.cargo_id
  ORDER BY b.cargo_id, b.fecha_baja DESC, b.created_at DESC
)
SELECT
  cand.id AS cargo_id, cand.codigo, cand.id_sial,
  cand.estado::text AS estado, cand.sub_estado::text AS sub_estado, cand.estado_desde,
  cand.literal_puesto, cand.especialidad_legacy,
  h.sigla AS hospital_sigla, e.nombre AS carrera,
  occ.persona_cuil, occ.persona_nombre,
  (occ.cargo_id IS NOT NULL AND occ.occ_hasta IS NULL) AS tiene_ocupante_vigente,
  occ_max.ultima_hasta AS ocupacion_hasta,
  occ_max.ultima_desde AS ocupacion_desde_ult,
  cand.tipo_origen,
  (conc.concurso_activo IS TRUE) AS concurso_activo,
  (conc.tuvo_concurso_cerrado IS TRUE) AS tuvo_concurso_cerrado,
  (alta_pend.cargo_id IS NOT NULL) AS alta_pendiente,
  (bs.id_sial IS NOT NULL) AS en_baja_sial,
  bs.bs_cuil, bs.bs_ayn, bs.bs_cargo_hasta, bs.mot_baja, bs.doc_resp_baja, bs_primera.bs_primera_fecha,
  (elim_ult.cargo_id IS NOT NULL) AS ausente_ultimo_padron,
  elim_hist.fecha_baja_padron,
  bf.baja_estado, bf.genera_concurso AS baja_genera_concurso
FROM cand
LEFT JOIN hospitales h   ON h.id = cand.hospital_id
LEFT JOIN escalafones e  ON e.id = cand.escalafon_id
LEFT JOIN occ            ON occ.cargo_id = cand.id
LEFT JOIN occ_max        ON occ_max.cargo_id = cand.id
LEFT JOIN conc           ON conc.cargo_id = cand.id
LEFT JOIN alta_pend      ON alta_pend.cargo_id = cand.id
LEFT JOIN bs             ON bs.id_sial = cand.id_sial
LEFT JOIN bs_primera     ON bs_primera.id_sial = cand.id_sial
LEFT JOIN elim_ult       ON elim_ult.cargo_id = cand.id
LEFT JOIN elim_hist      ON elim_hist.cargo_id = cand.id
LEFT JOIN bf             ON bf.cargo_id = cand.id`
}

async function obtenerConteosBase(): Promise<ConteosBase> {
  const rows = await prisma.$queryRaw<
    Array<{
      total_cargos: bigint
      no_vigente: bigint
      ocupado: bigint
      vigente_sin_ocupante: bigint
      validacion_vacante: bigint
    }>
  >`
SELECT
  count(*)                                                            AS total_cargos,
  count(*) FILTER (WHERE c.estado::text = 'no_vigente')               AS no_vigente,
  count(*) FILTER (WHERE c.estado::text = 'vigente' AND oc.tiene)     AS ocupado,
  count(*) FILTER (WHERE c.estado::text = 'vigente' AND NOT oc.tiene) AS vigente_sin_ocupante,
  count(*) FILTER (WHERE c.estado::text = 'validacion_vacante')       AS validacion_vacante
FROM cargos c
CROSS JOIN LATERAL (
  SELECT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL) AS tiene
) oc
WHERE c.deleted_at IS NULL
  AND ${sqlCargoGestionable('c')}`
  const r = rows[0]
  return {
    totalCargos: Number(r?.total_cargos ?? 0),
    noVigente: Number(r?.no_vigente ?? 0),
    ocupado: Number(r?.ocupado ?? 0),
    vigenteSinOcupante: Number(r?.vigente_sin_ocupante ?? 0),
    validacionVacante: Number(r?.validacion_vacante ?? 0),
  }
}

async function obtenerContexto(): Promise<{ contexto: ContextoIncidencias; ultimaBajaFechaArchivo: string | null }> {
  const [padron, baja] = await Promise.all([
    prisma.padronSnapshot.findFirst({
      where: { estado: 'aprobado' },
      orderBy: { fechaAsignada: 'desc' },
      select: { fechaAsignada: true, totalRegistros: true, ratioTamano: true, advertenciaTamano: true },
    }),
    prisma.bajaSialSnapshot.findFirst({
      where: { estado: { in: ['pendiente', 'aprobado'] } },
      orderBy: { fechaArchivo: 'desc' },
      select: { fechaArchivo: true, estado: true },
    }),
  ])
  return {
    contexto: {
      ultimoPadron: padron
        ? {
            fechaAsignada: iso(padron.fechaAsignada) as string,
            totalRegistros: padron.totalRegistros ?? 0,
            ratioTamano: padron.ratioTamano ?? null,
            advertenciaTamano: padron.advertenciaTamano ?? null,
          }
        : null,
      ultimaBajaSial: baja
        ? { fechaArchivo: iso(baja.fechaArchivo) as string, estado: baja.estado as 'pendiente' | 'aprobado' }
        : null,
    },
    ultimaBajaFechaArchivo: baja ? iso(baja.fechaArchivo) : null,
  }
}

// ─── Caché en proceso con single-flight (design §6.2) ────────────────────────

export const CACHE_TTL_MS = 45_000

export interface CacheDeps {
  ahora?: () => number
  cargar?: () => Promise<SnapshotIncidencias>
}

async function cargarSnapshot(): Promise<SnapshotIncidencias> {
  const [hechos, conteos, ctx] = await Promise.all([
    obtenerHechosCandidatos(),
    obtenerConteosBase(),
    obtenerContexto(),
  ])
  return {
    generadoAt: new Date(),
    hechos,
    conteos,
    contexto: ctx.contexto,
    ultimaBajaFechaArchivo: ctx.ultimaBajaFechaArchivo,
  }
}

let cache: { valor: SnapshotIncidencias; en: number } | null = null
let enCurso: Promise<SnapshotIncidencias> | null = null

export function _resetCacheIncidencias(): void {
  cache = null
  enCurso = null
}

export async function obtenerSnapshotIncidencias(
  opts: { refrescar?: boolean } = {},
  deps: CacheDeps = {},
): Promise<SnapshotIncidencias> {
  const ahora = deps.ahora ?? Date.now
  const cargar = deps.cargar ?? cargarSnapshot
  if (!opts.refrescar && cache && ahora() - cache.en < CACHE_TTL_MS) return cache.valor
  if (enCurso) return enCurso
  const t = ahora()
  const p = cargar().then(
    (valor) => {
      cache = { valor, en: t }
      enCurso = null
      return valor
    },
    (err) => {
      enCurso = null // no se cachea el error
      throw err
    },
  )
  enCurso = p
  return p
}

// ─── Construcción de ítems ───────────────────────────────────────────────────

export function factsDeHecho(h: HechoRow): CargoFacts {
  return {
    estado: h.estado,
    tieneOcupanteVigente: h.tiene_ocupante_vigente,
    concursoActivo: h.concurso_activo,
    altaPendiente: h.alta_pendiente,
    enBajaSial: h.en_baja_sial,
    ausenteUltimoPadron: h.ausente_ultimo_padron,
  }
}

export function construirItem(h: HechoRow, ultimaBajaFechaArchivo: string | null, hoy: Date): BajaSinConcursoItem {
  const det = resolverDeteccion({
    estado: h.estado,
    estadoDesde: iso(h.estado_desde),
    fechaBajaPadronDiff: iso(h.fecha_baja_padron),
    ocupacionDesdeUlt: iso(h.ocupacion_desde_ult),
    ocupacionHasta: iso(h.ocupacion_hasta),
    enBajaSial: h.en_baja_sial,
    bsCargoHasta: iso(h.bs_cargo_hasta),
    bsPrimeraFecha: iso(h.bs_primera_fecha),
    bsFechaArchivoUltima: ultimaBajaFechaArchivo,
    ausenteUltimoPadron: h.ausente_ultimo_padron,
  })
  const cuil = h.persona_cuil ?? h.bs_cuil
  const nombre = h.persona_nombre ?? h.bs_ayn
  const referencia = det.fechaBaja ?? (det.origen === 'baja_sial' ? det.fechaDeteccion : null) ?? det.fechaPadron
  return {
    cargoId: h.cargo_id,
    codigo: h.codigo,
    idSial: h.id_sial,
    hospitalSigla: h.hospital_sigla,
    carrera: h.carrera,
    puesto: h.literal_puesto,
    especialidad: h.especialidad_legacy,
    persona: cuil || nombre ? { cuil: cuil ?? null, nombre: nombre ?? null } : null,
    estadoCargo: h.estado as 'vigente' | 'validacion_vacante',
    subEstado: h.sub_estado as BajaSinConcursoItem['subEstado'],
    estadoDesde: iso(h.estado_desde),
    deteccion: {
      ...det,
      texto: describirDeteccion(det),
      motBaja: h.mot_baja,
      docRespBaja: h.doc_resp_baja,
    },
    diasSinCubrir: calcularDiasSinCubrir(referencia, hoy),
    bajaFormal: h.baja_estado
      ? {
          estado: h.baja_estado as NonNullable<BajaSinConcursoItem['bajaFormal']>['estado'],
          generaConcurso: h.baja_genera_concurso ?? false,
        }
      : null,
    tuvoConcursoCerrado: h.tuvo_concurso_cerrado,
  }
}

// Todos los ítems del grupo baja_sin_concurso, sin filtrar ni paginar.
export function itemsBajaSinConcurso(snap: SnapshotIncidencias, hoy = new Date()): BajaSinConcursoItem[] {
  const out: BajaSinConcursoItem[] = []
  for (const h of snap.hechos) {
    if (clasificarCargo(factsDeHecho(h)) === 'baja_sin_concurso') {
      out.push(construirItem(h, snap.ultimaBajaFechaArchivo, hoy))
    }
  }
  return out
}

export interface ConciliacionGrupos {
  totalCargos: number
  dotacion: number
  grupos: Record<GrupoCargo, number>
  sumaGrupos: number
  porOrigenBaja: { baja_sial: number; padron: number }
}

export function calcularConciliacion(snap: SnapshotIncidencias, hoy = new Date()): ConciliacionGrupos {
  const cand = contarGrupos(snap.hechos.map(factsDeHecho))
  const grupos: Record<GrupoCargo, number> = {
    ...cand,
    no_vigente: snap.conteos.noVigente,
    ocupado: snap.conteos.ocupado,
  }
  const sumaGrupos = Object.values(grupos).reduce((a, b) => a + b, 0)
  const items = itemsBajaSinConcurso(snap, hoy)
  return {
    totalCargos: snap.conteos.totalCargos,
    dotacion: snap.conteos.totalCargos - snap.conteos.noVigente,
    grupos,
    sumaGrupos,
    porOrigenBaja: {
      baja_sial: items.filter((i) => i.deteccion.origen === 'baja_sial').length,
      padron: items.filter((i) => i.deteccion.origen === 'padron').length,
    },
  }
}

// ─── Listado filtrado / paginado ─────────────────────────────────────────────

export interface FiltrosBajaSinConcurso {
  page: number
  pageSize: number
  q?: string
  carrera?: string
  origen?: 'baja_sial' | 'padron'
  estadoCargo?: 'vigente' | 'validacion_vacante'
}

export function filtrarPorQueryYCarrera<T extends { carrera: string | null }>(
  items: T[],
  f: { q?: string; carrera?: string },
  campos: (i: T) => { nombre?: string | null; cuil?: string | null; idSial?: string | null; codigo?: string | null },
): T[] {
  const qNorm = normalizarBusqueda(f.q)
  const carreraNorm = normalizarBusqueda(f.carrera)
  return items.filter((i) => {
    if (carreraNorm && normalizarBusqueda(i.carrera) !== carreraNorm) return false
    return coincideBusqueda(campos(i), qNorm)
  })
}

export const camposBusquedaBaja = (i: BajaSinConcursoItem) => ({
  nombre: i.persona?.nombre,
  cuil: i.persona?.cuil,
  idSial: i.idSial,
  codigo: i.codigo,
})

// días desc (nulls al final), desempate por código.
export function ordenarBajas(items: BajaSinConcursoItem[]): BajaSinConcursoItem[] {
  return [...items].sort((a, b) => {
    if (a.diasSinCubrir == null && b.diasSinCubrir != null) return 1
    if (a.diasSinCubrir != null && b.diasSinCubrir == null) return -1
    if (a.diasSinCubrir != null && b.diasSinCubrir != null && a.diasSinCubrir !== b.diasSinCubrir) {
      return b.diasSinCubrir - a.diasSinCubrir
    }
    return (a.codigo ?? '').localeCompare(b.codigo ?? '')
  })
}

export function listarBajaSinConcursoDeSnapshot(snap: SnapshotIncidencias, f: FiltrosBajaSinConcurso, hoy = new Date()) {
  const base = filtrarPorQueryYCarrera(itemsBajaSinConcurso(snap, hoy), f, camposBusquedaBaja).filter(
    (i) => !f.estadoCargo || i.estadoCargo === f.estadoCargo,
  )
  const porOrigen = {
    baja_sial: base.filter((i) => i.deteccion.origen === 'baja_sial').length,
    padron: base.filter((i) => i.deteccion.origen === 'padron').length,
  }
  const filtrados = ordenarBajas(base.filter((i) => !f.origen || i.deteccion.origen === f.origen))
  const total = filtrados.length
  const pages = Math.max(1, Math.ceil(total / f.pageSize))
  const start = (f.page - 1) * f.pageSize
  return {
    items: filtrados.slice(start, start + f.pageSize),
    meta: { total, page: f.page, pageSize: f.pageSize, pages },
    generadoAt: snap.generadoAt.toISOString(),
    porOrigen,
    contexto: snap.contexto,
  }
}

export async function listarBajaSinConcurso(f: FiltrosBajaSinConcurso, opts: { refrescar?: boolean } = {}) {
  const snap = await obtenerSnapshotIncidencias(opts)
  return listarBajaSinConcursoDeSnapshot(snap, f)
}
