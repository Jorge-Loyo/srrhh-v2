// Pestaña "Baja sin concurso" — SOLO LECTURA.
//
// Lógica: arranca desde la baja SIAL (último snapshot pendiente/aprobado) y
// filtra en cascada:
//   1. Solo registros que tienen cargo en el sistema (cruce id_sial → cargos.codigo no null)
//   2. Sacar no_vigente  → ya dados de baja históricamente
//   3. Sacar con concurso activo (CPH o CEETPS que cuenta) → ya gestionados
//   4. Sacar con baja confirmada o anulada → ya procesados formalmente
//
// Lo que queda: vigente (ocupado o vacante) o validacion_vacante, sin concurso
// activo, sin baja formal cerrada. Pueden tener baja en borrador
// (resolucion_a_la_firma) — se muestran igual porque todavía no confirmaron nada.
//
// Acciones posibles desde la UI: iniciar concurso, declarar no vigente,
// declarar vacante (validacion_vacante).

import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import {
  sqlEstadoCphActivo,
  sqlEstadoCeetpsActivo,
  sqlConcursoAutorizadoParaContar,
} from '../cargos/concursoActivo.regla.js'
import { normalizarBusqueda, coincideBusqueda } from './incidencias.clasificacion.js'

// ─── Tipos del contrato ──────────────────────────────────────────────────────

export interface BajaSinConcursoItem {
  cargoId: string
  codigo: string                      // siempre presente (filtro 1 lo garantiza)
  idSial: string
  hospitalSigla: string | null
  carrera: string | null
  codigoRegistro: string | null
  puesto: string | null
  especialidad: string | null
  estadoCargo: 'vigente' | 'validacion_vacante'
  subEstado: 'ocupado' | 'vacante' | 'concurso' | null
  // Persona: ocupante vigente si existe, sino datos de la baja SIAL
  persona: { cuil: string | null; nombre: string | null } | null
  // Datos de la baja SIAL
  bajaSial: {
    cargoHasta: string | null
    motBaja: string | null
    docRespBaja: string | null
    fechaArchivo: string              // fecha del snapshot
  }
  // Baja formal en el sistema (borrador resolucion_a_la_firma si existe)
  bajaFormal: {
    id: string
    estado: 'resolucion_a_la_firma' | 'pendiente' | 'confirmada' | 'anulada'
    generaConcurso: boolean
    eeBaja: string | null
  } | null
  diasDesdeBaja: number | null
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

export interface SnapshotBajaSinConcurso {
  generadoAt: Date
  items: BajaSinConcursoItem[]
  contexto: ContextoIncidencias
}

const iso = (d: Date | null | undefined): string | null =>
  d ? d.toISOString().slice(0, 10) : null

// ─── Query principal ─────────────────────────────────────────────────────────

interface RawRow {
  cargo_id: string
  codigo: string
  id_sial: string
  estado: string
  sub_estado: string | null
  estado_desde: Date | null
  literal_puesto: string | null
  especialidad_legacy: string | null
  hospital_sigla: string | null
  carrera: string | null
  codigo_registro: string | null
  // ocupante vigente
  ocup_cuil: string | null
  ocup_nombre: string | null
  // datos baja SIAL
  bs_cuil: string | null
  bs_ayn: string | null
  bs_cargo_hasta: Date | null
  bs_mot_baja: string | null
  bs_doc_resp_baja: string | null
  bs_fecha_archivo: Date
  // baja formal más reciente no confirmada/anulada (o null si no hay)
  bf_id: string | null
  bf_estado: string | null
  bf_genera_concurso: boolean | null
  bf_ee_baja: string | null
}

async function obtenerItems(): Promise<BajaSinConcursoItem[]> {
  const rows = await prisma.$queryRaw<RawRow[]>`
WITH
-- Último snapshot de baja SIAL (pendiente o aprobado)
ult_baja AS (
  SELECT id, fecha_archivo
  FROM baja_sial_snapshots
  WHERE estado::text IN ('pendiente', 'aprobado')
  ORDER BY fecha_archivo DESC
  LIMIT 1
),
-- Todos los registros del último snapshot
bs AS (
  SELECT DISTINCT ON (r.cargo)
    r.cargo       AS id_sial,
    r.cuil        AS bs_cuil,
    r.ayn         AS bs_ayn,
    r.cargo_hasta AS bs_cargo_hasta,
    r.mot_baja    AS bs_mot_baja,
    r.doc_resp_baja AS bs_doc_resp_baja,
    u.fecha_archivo AS bs_fecha_archivo
  FROM baja_sial_registros r
  JOIN ult_baja u ON u.id = r.snapshot_id
  ORDER BY r.cargo, r.cargo_hasta DESC NULLS LAST
),
-- Cargos del sistema que cruzan con la baja SIAL y tienen codigo (filtro 1)
cand AS (
  SELECT c.id, c.codigo, c.id_sial, c.estado::text AS estado,
         c.sub_estado::text AS sub_estado, c.estado_desde,
         c.literal_puesto, c.especialidad_legacy,
         c.hospital_id, c.escalafon_id, c.codigo_registro_id
  FROM cargos c
  JOIN bs ON bs.id_sial = c.id_sial
  WHERE c.deleted_at IS NULL
    AND c.codigo IS NOT NULL
    -- Filtro 2: sacar no_vigente
    AND c.estado::text != 'no_vigente'
    -- Filtro 3: sacar con concurso activo que cuenta
    AND NOT EXISTS (
      SELECT 1 FROM concursos_cph cph
      JOIN concursos co ON co.id = cph.concurso_id
      WHERE cph.cargo_id = c.id
        AND ${Prisma.raw(sqlEstadoCphActivo('cph'))}
        AND ${Prisma.raw(sqlConcursoAutorizadoParaContar('co'))}
    )
    AND NOT EXISTS (
      SELECT 1 FROM concursos_ceetps ce
      JOIN concursos co ON co.id = ce.concurso_id
      WHERE ce.cargo_id = c.id
        AND ${Prisma.raw(sqlEstadoCeetpsActivo('ce'))}
        AND ${Prisma.raw(sqlConcursoAutorizadoParaContar('co'))}
    )
    -- Filtro 4: sacar con baja confirmada o anulada
    AND NOT EXISTS (
      SELECT 1 FROM bajas b
      WHERE b.cargo_id = c.id
        AND b.estado::text IN ('confirmada', 'anulada')
    )
),
-- Ocupante vigente de cada candidato
ocup AS (
  SELECT DISTINCT ON (o.cargo_id)
    o.cargo_id,
    p.cuil  AS ocup_cuil,
    p.apellido_nombre AS ocup_nombre
  FROM ocupaciones o
  JOIN cand ON cand.id = o.cargo_id
  JOIN personas p ON p.id = o.persona_id
  WHERE o.hasta IS NULL
  ORDER BY o.cargo_id
),
-- Baja formal más reciente en borrador (resolucion_a_la_firma) si existe
bf AS (
  SELECT DISTINCT ON (b.cargo_id)
    b.cargo_id,
    b.id          AS bf_id,
    b.estado::text AS bf_estado,
    b.genera_concurso AS bf_genera_concurso,
    b.ee_baja     AS bf_ee_baja
  FROM bajas b
  JOIN cand ON cand.id = b.cargo_id
  WHERE b.estado::text = 'resolucion_a_la_firma'
  ORDER BY b.cargo_id, b.created_at DESC
)
SELECT
  cand.id           AS cargo_id,
  cand.codigo,
  cand.id_sial,
  cand.estado,
  cand.sub_estado,
  cand.estado_desde,
  cand.literal_puesto,
  cand.especialidad_legacy,
  h.sigla           AS hospital_sigla,
  e.nombre          AS carrera,
  cr.codigo         AS codigo_registro,
  ocup.ocup_cuil,
  ocup.ocup_nombre,
  bs.bs_cuil,
  bs.bs_ayn,
  bs.bs_cargo_hasta,
  bs.bs_mot_baja,
  bs.bs_doc_resp_baja,
  bs.bs_fecha_archivo,
  bf.bf_id,
  bf.bf_estado,
  bf.bf_genera_concurso,
  bf.bf_ee_baja
FROM cand
JOIN bs              ON bs.id_sial    = cand.id_sial
LEFT JOIN hospitales h   ON h.id      = cand.hospital_id
LEFT JOIN escalafones e  ON e.id      = cand.escalafon_id
LEFT JOIN codigos_registro cr ON cr.id = cand.codigo_registro_id
LEFT JOIN ocup       ON ocup.cargo_id = cand.id
LEFT JOIN bf         ON bf.cargo_id   = cand.id
ORDER BY bs.bs_cargo_hasta ASC NULLS LAST, cand.codigo
`

  const hoy = new Date()
  return rows.map((r): BajaSinConcursoItem => {
    const fechaBaja = iso(r.bs_cargo_hasta)
    const diasDesdeBaja = fechaBaja
      ? (() => {
          const [y, m, d] = fechaBaja.split('-').map(Number)
          const ref = Date.UTC(y, m - 1, d)
          const h = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
          return Math.max(0, Math.floor((h - ref) / 86_400_000))
        })()
      : null

    const persona =
      r.ocup_cuil || r.ocup_nombre
        ? { cuil: r.ocup_cuil, nombre: r.ocup_nombre }
        : r.bs_cuil || r.bs_ayn
          ? { cuil: r.bs_cuil, nombre: r.bs_ayn }
          : null

    return {
      cargoId: r.cargo_id,
      codigo: r.codigo,
      idSial: r.id_sial,
      hospitalSigla: r.hospital_sigla,
      carrera: r.carrera,
      codigoRegistro: r.codigo_registro,
      puesto: r.literal_puesto,
      especialidad: r.especialidad_legacy,
      estadoCargo: r.estado as 'vigente' | 'validacion_vacante',
      subEstado: r.sub_estado as BajaSinConcursoItem['subEstado'],
      persona,
      bajaSial: {
        cargoHasta: fechaBaja,
        motBaja: r.bs_mot_baja,
        docRespBaja: r.bs_doc_resp_baja,
        fechaArchivo: iso(r.bs_fecha_archivo) as string,
      },
      bajaFormal: r.bf_id
        ? {
            id: r.bf_id,
            estado: r.bf_estado as NonNullable<BajaSinConcursoItem['bajaFormal']>['estado'],
            generaConcurso: r.bf_genera_concurso ?? false,
            eeBaja: r.bf_ee_baja,
          }
        : null,
      diasDesdeBaja,
    }
  })
}

async function obtenerContexto(): Promise<ContextoIncidencias> {
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
  }
}

// ─── Caché en proceso (single-flight, TTL 45s) ───────────────────────────────

export const CACHE_TTL_MS = 45_000

let cache: { valor: SnapshotBajaSinConcurso; en: number } | null = null
let enCurso: Promise<SnapshotBajaSinConcurso> | null = null

export function _resetCacheIncidencias(): void {
  cache = null
  enCurso = null
}

async function cargarSnapshot(): Promise<SnapshotBajaSinConcurso> {
  const [items, contexto] = await Promise.all([obtenerItems(), obtenerContexto()])
  return { generadoAt: new Date(), items, contexto }
}

export async function obtenerSnapshotIncidencias(
  opts: { refrescar?: boolean } = {},
): Promise<SnapshotBajaSinConcurso> {
  const ahora = Date.now
  if (!opts.refrescar && cache && ahora() - cache.en < CACHE_TTL_MS) return cache.valor
  if (enCurso) return enCurso
  const t = ahora()
  const p = cargarSnapshot().then(
    (valor) => { cache = { valor, en: t }; enCurso = null; return valor },
    (err)   => { enCurso = null; throw err },
  )
  enCurso = p
  return p
}

// ─── Filtrado / paginado ─────────────────────────────────────────────────────

export interface FiltrosBajaSinConcurso {
  page: number
  pageSize: number
  q?: string
  carrera?: string
  estadoCargo?: 'vigente' | 'validacion_vacante'
}

export function listarBajaSinConcursoDeSnapshot(
  snap: SnapshotBajaSinConcurso,
  f: FiltrosBajaSinConcurso,
) {
  const qNorm = normalizarBusqueda(f.q)

  const filtrados = snap.items.filter((i) => {
    if (f.estadoCargo && i.estadoCargo !== f.estadoCargo) return false
    if (f.carrera && (i.codigoRegistro ?? '').trim() !== f.carrera) return false
    return coincideBusqueda(
      { nombre: i.persona?.nombre, cuil: i.persona?.cuil, idSial: i.idSial, codigo: i.codigo },
      qNorm,
    )
  })

  const total = filtrados.length
  const pages = Math.max(1, Math.ceil(total / f.pageSize))
  const start = (f.page - 1) * f.pageSize

  return {
    items: filtrados.slice(start, start + f.pageSize),
    meta: { total, page: f.page, pageSize: f.pageSize, pages },
    generadoAt: snap.generadoAt.toISOString(),
    contexto: snap.contexto,
  }
}

export async function listarBajaSinConcurso(
  f: FiltrosBajaSinConcurso,
  opts: { refrescar?: boolean } = {},
) {
  const snap = await obtenerSnapshotIncidencias(opts)
  return listarBajaSinConcursoDeSnapshot(snap, f)
}
