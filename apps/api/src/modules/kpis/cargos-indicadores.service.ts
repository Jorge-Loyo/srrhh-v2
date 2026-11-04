// Indicadores de cargos (Reportes) — solo lectura.
//
// Las consultas agregan en la base por COMBINACIÓN DE HECHOS (carrera, estado,
// ocupantes, concurso) y devuelven pocas filas con su count(*). La hoja de cada
// combinación la decide la función pura `clasificarCargo`. Ver
// .agents/tasks/indicadores-cargos/design.md.
import { Prisma } from '@prisma/client'
import type { CargosIndicadores, CargosIndicadoresPeriodo } from '@srrhh/types'
import { prisma } from '../../shared/prisma.js'
import type { CargosIndicadoresQuery } from './cargos-indicadores.schema.js'
import {
  SUB_ESTADOS_CONCURSO_CPH,
  clasificarFilas,
  construirRespuesta,
  evaluarDisponibilidad,
  fechaCivilArgentina,
  resolverPeriodos,
  verificarConciliacion,
  type DatosPeriodo,
  type EdRel,
  type FilaHecho,
  type PeriodoResuelto,
} from './cargos-indicadores.clasificacion.js'

/**
 * Salida opcional para BD de prueba: día `YYYY-MM-DD` (último día de la carga
 * inicial en bloque). Los cargos creados hasta esa fecha se consideran
 * existentes desde el inicio de los datos y la carga inicial deja de bloquear
 * la disponibilidad. No afecta al mes actual (vivo). Con la BD real: null.
 */
export const CARGA_INICIAL_OVERRIDE: string | null = null

interface LoggerLike {
  error: (o: unknown, msg?: string) => void
  warn: (o: unknown, msg?: string) => void
}

type Filtros = { hospitalId?: string; codigoRegistroId?: string }

// Los filtros opcionales se arman con Prisma.sql (nunca por concatenación). El
// alias es un literal de código, no entrada del usuario.
function filtros(alias: 'c' | 't', f: Filtros): Prisma.Sql {
  const a = Prisma.raw(alias)
  return Prisma.sql`${f.hospitalId ? Prisma.sql`AND ${a}.hospital_id = ${f.hospitalId}::uuid` : Prisma.empty}
                    ${f.codigoRegistroId ? Prisma.sql`AND ${a}.codigo_registro_id = ${f.codigoRegistroId}::uuid` : Prisma.empty}`
}

/**
 * Fragmento ÚNICO de concursos, usado por el período vivo (corte = hoy) y por el
 * reconstruido. Requiere un CTE `base(id, ...)` previo. Pertenencia por FECHAS,
 * no por el sub_estado actual del concurso.
 */
export function sqlConcursos(corte: string): Prisma.Sql {
  return Prisma.sql`
conc_rows AS (
  SELECT cc.cargo_id, cc.fecha_autorizacion AS ini,
         least(
           cc.fecha_dispo_desierta,
           (SELECT min(coalesce(o2.desde, (o2.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date))
              FROM ocupaciones o2
             WHERE o2.cargo_id = cc.cargo_id
               AND coalesce(o2.desde, (o2.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)
                   >= cc.fecha_autorizacion),
           (SELECT min((x.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)
              FROM concursos_cph x
             WHERE x.cargo_id = cc.cargo_id AND (x.created_at, x.id) > (cc.created_at, cc.id))
         ) AS fin,
         false AS cierre_sin_fecha
  FROM concursos_cph cc JOIN base b ON b.id = cc.cargo_id
  WHERE cc.fecha_autorizacion IS NOT NULL
     OR cc.fecha_dispo_desierta IS NOT NULL
     OR lower(cc.sub_estado) IN (${Prisma.join([...SUB_ESTADOS_CONCURSO_CPH])},
                                 'n-designado', 'o-alta sial', 'h-tad', 'm-reso a la firma')
  UNION ALL
  SELECT ce.cargo_id, ce.fecha_autorizacion,
         (SELECT min(coalesce(o2.desde, (o2.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date))
            FROM ocupaciones o2
           WHERE o2.cargo_id = ce.cargo_id
             AND coalesce(o2.desde, (o2.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)
                 >= ce.fecha_autorizacion) AS fin,
         ce.estado::text IN ('finalizado', 'desierto')
  FROM concursos_ceetps ce JOIN base b ON b.id = ce.cargo_id
  WHERE ce.estado::text IN ('autorizado', 'en_proceso', 'finalizado', 'desierto')
),
conc AS (
  SELECT cargo_id,
    bool_or(coalesce(ini <= ${corte}::date, false)
            AND NOT (cierre_sin_fecha AND fin IS NULL)
            AND (fin IS NULL OR fin > ${corte}::date))               AS si,
    bool_or(NOT coalesce(fin <= ${corte}::date, false)
            AND (ini IS NULL OR (cierre_sin_fecha AND fin IS NULL AND ini <= ${corte}::date))) AS desconocido
  FROM conc_rows GROUP BY cargo_id
)`
}

const ESTADOS = new Set(['vigente', 'validacion_vacante', 'no_vigente'])

interface FilaSql {
  codigo_registro_id: string | null
  estado: string
  ed_rel: EdRel
  sits: string[] | null
  sit_aprox: boolean
  concurso: 'si' | 'no' | 'desconocido'
  n: number
  total_base: number
}

export function sqlPeriodoVivo(hoy: string, f: Filtros): Prisma.Sql {
  return Prisma.sql`
WITH base AS (
  SELECT c.id, c.codigo_registro_id, c.estado::text AS estado
  FROM cargos c
  WHERE c.deleted_at IS NULL ${filtros('c', f)}
),
occ AS (
  SELECT cargo_id, array_agg(DISTINCT sit ORDER BY sit) AS sits
  FROM (
    SELECT o.cargo_id,
           coalesce(nullif(lower(unaccent(trim(o.situacion_revista))), ''), '(sin dato)') AS sit
    FROM ocupaciones o JOIN base b ON b.id = o.cargo_id
    WHERE o.hasta IS NULL
  ) x GROUP BY cargo_id
),
${sqlConcursos(hoy)}
SELECT b.codigo_registro_id::text AS codigo_registro_id, b.estado, 'le' AS ed_rel,
       occ.sits, false AS sit_aprox,
       CASE WHEN conc.si THEN 'si' WHEN conc.desconocido THEN 'desconocido' ELSE 'no' END AS concurso,
       count(*)::int AS n,
       (SELECT count(*)::int FROM cargos t
         WHERE t.deleted_at IS NULL ${filtros('t', f)}) AS total_base
FROM base b
LEFT JOIN occ  ON occ.cargo_id  = b.id
LEFT JOIN conc ON conc.cargo_id = b.id
GROUP BY 1, 2, 4, 6`
}

export function sqlPeriodoReconstruido(corte: string, override: string | null, f: Filtros): Prisma.Sql {
  return Prisma.sql`
WITH base AS (
  SELECT c.id, c.codigo_registro_id, c.estado::text AS estado,
         CASE WHEN c.estado_desde IS NULL THEN 'null'
              WHEN c.estado_desde <= ${corte}::date THEN 'le' ELSE 'gt' END AS ed_rel
  FROM cargos c
  WHERE ((c.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <= ${corte}::date
         OR (c.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date <= ${override}::date)
    AND (c.deleted_at IS NULL
         OR (c.deleted_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date > ${corte}::date)
    ${filtros('c', f)}
),
occ_rows AS (
  SELECT o.cargo_id,
         coalesce(nullif(lower(unaccent(trim(coalesce(h.situacion_revista, o.situacion_revista)))), ''),
                  '(sin dato)') AS sit,
         (h.situacion_revista IS NULL) AS sit_aprox
  FROM ocupaciones o
  JOIN base b ON b.id = o.cargo_id
  LEFT JOIN LATERAL (
    SELECT ph.situacion_revista FROM padron_historico ph
    WHERE ph.id_sial_rol = o.id_sial_rol AND ph.fecha_asignada <= ${corte}::date
    ORDER BY ph.fecha_asignada DESC LIMIT 1
  ) h ON true
  WHERE coalesce(o.desde, (o.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) <= ${corte}::date
    AND (o.hasta IS NULL OR o.hasta > ${corte}::date)
),
occ AS (
  SELECT cargo_id, array_agg(DISTINCT sit ORDER BY sit) AS sits, bool_or(sit_aprox) AS sit_aprox
  FROM occ_rows GROUP BY cargo_id
),
${sqlConcursos(corte)}
SELECT b.codigo_registro_id::text AS codigo_registro_id, b.estado, b.ed_rel,
       occ.sits, coalesce(occ.sit_aprox, false) AS sit_aprox,
       CASE WHEN conc.si THEN 'si' WHEN conc.desconocido THEN 'desconocido' ELSE 'no' END AS concurso,
       count(*)::int AS n,
       (SELECT count(*)::int FROM base) AS total_base
FROM base b
LEFT JOIN occ  ON occ.cargo_id  = b.id
LEFT JOIN conc ON conc.cargo_id = b.id
GROUP BY 1, 2, 3, 4, 5, 6`
}

function aFilaHecho(r: FilaSql): FilaHecho {
  return {
    carreraId: r.codigo_registro_id,
    estado: r.estado,
    edRel: r.ed_rel,
    sits: r.sits,
    sitAprox: r.sit_aprox,
    concurso: r.concurso,
    n: Number(r.n),
  }
}

async function personasRef(corte: string, codigo: string | null) {
  const filtroCodigo = codigo ? Prisma.sql`AND s.codigo_registro = ${codigo}` : Prisma.empty
  const rows = await prisma.$queryRaw<{ codigo: string; personas: number; fecha: string }[]>(Prisma.sql`
    SELECT s.codigo_registro AS codigo, s.personas::int AS personas, s.fecha::text AS fecha
    FROM kpis_dotacion_snapshot s
    WHERE s.situacion_revista = '(total)'
      AND s.fecha = (SELECT max(fecha) FROM kpis_dotacion_snapshot
                     WHERE situacion_revista = '(total)' AND fecha <= ${corte}::date)
      ${filtroCodigo}`)
  return rows
}

export async function getCargosIndicadoresService(
  query: CargosIndicadoresQuery,
  log: LoggerLike,
  now: Date = new Date(),
): Promise<CargosIndicadores> {
  const hoy = fechaCivilArgentina(now)
  const per = resolverPeriodos(query.mes, hoy) // lanza 400 si el mes es futuro
  const f: Filtros = { hospitalId: query.hospitalId, codigoRegistroId: query.codigoRegistroId }
  const override = CARGA_INICIAL_OVERRIDE

  const hayReconstruido = per.actual.modo === 'reconstruido' || per.anterior.modo === 'reconstruido'
  const [carreras, primerDatos, cargaInicial] = await Promise.all([
    prisma.codigoRegistro.findMany({ select: { id: true, codigo: true, literal: true } }),
    hayReconstruido
      ? prisma
          .$queryRaw<{ d: string | null }[]>(
            Prisma.sql`SELECT min(fecha_asignada)::text AS d FROM padron_snapshots WHERE estado::text = 'aprobado'`,
          )
          .then((r) => r[0]?.d ?? null)
      : Promise.resolve(null),
    hayReconstruido
      ? prisma
          .$queryRaw<{ d: string | null }[]>(
            Prisma.sql`SELECT (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS d
                       FROM cargos GROUP BY 1 ORDER BY count(*) DESC, 1 ASC LIMIT 1`,
          )
          .then((r) => r[0]?.d ?? null)
      : Promise.resolve(null),
  ])
  const codigoFiltrado = f.codigoRegistroId
    ? (carreras.find((c) => c.id === f.codigoRegistroId)?.codigo ?? null)
    : null

  const cargarPeriodo = async (p: PeriodoResuelto) => {
    let disponible = true
    let motivo: string | null = null
    if (p.modo === 'reconstruido') {
      const d = evaluarDisponibilidad(p.fechaCorte, { primerDatos, cargaInicial, override })
      disponible = d.disponible
      motivo = d.motivo
    }
    let filas: FilaSql[] = []
    if (disponible) {
      const sql =
        p.modo === 'vivo'
          ? sqlPeriodoVivo(p.fechaCorte, f)
          : sqlPeriodoReconstruido(p.fechaCorte, override, f)
      filas = await prisma.$queryRaw<FilaSql[]>(sql)
      if (p.modo === 'reconstruido' && filas.length === 0) {
        disponible = false
        motivo = 'sin cargos existentes a esa fecha'
      }
    }
    const periodo: CargosIndicadoresPeriodo = {
      mes: p.mes,
      fechaCorte: p.fechaCorte,
      modo: p.modo,
      disponible,
      motivoNoDisponible: motivo,
    }
    let personas: DatosPeriodo['personas'] = null
    let personasFecha: string | null = null
    if (disponible && !f.hospitalId) {
      const rows = await personasRef(p.fechaCorte, codigoFiltrado)
      if (rows.length > 0) {
        personas = rows.map((r) => ({ codigo: r.codigo, personas: Number(r.personas) }))
        personasFecha = rows[0]?.fecha ?? null
      }
    }
    const hechos = filas.map(aFilaHecho)
    const estadosRaros = hechos.some((h) => !ESTADOS.has(h.estado))
    const hojas = disponible ? clasificarFilas(hechos, p.modo === 'vivo' ? 'vivo' : 'corte') : null
    const totalBase = disponible ? Number(filas[0]?.total_base ?? 0) : null
    return { periodo, hojas, personas, personasFecha, totalBase, estadosRaros }
  }

  const [a, p] = await Promise.all([cargarPeriodo(per.actual), cargarPeriodo(per.anterior)])

  const concil = (x: typeof a) => (x.hojas && x.totalBase !== null ? verificarConciliacion(x.hojas, x.totalBase) : null)
  const cA = concil(a)
  const cP = concil(p)
  const ok = (cA?.ok ?? true) && (cP?.ok ?? true)
  if (!ok) {
    log.error(
      { totalBaseActual: a.totalBase, totalBaseAnterior: p.totalBase, derivadoActual: cA?.total, derivadoAnterior: cP?.total },
      'cargos-indicadores: la suma de hojas no coincide con el total de cargos',
    )
  }
  if ([a, p].some((x) => x.estadosRaros)) {
    log.warn({}, 'cargos-indicadores: hay cargos con estado fuera del enum (se cuentan como indeterminado)')
  }

  return construirRespuesta({
    actual: { periodo: a.periodo, filas: a.hojas, personas: a.personas, personasFecha: a.personasFecha },
    anterior: { periodo: p.periodo, filas: p.hojas, personas: p.personas, personasFecha: p.personasFecha },
    carreras,
    carreraFiltrada: Boolean(f.codigoRegistroId),
    hospitalFiltrado: Boolean(f.hospitalId),
    conciliacion: {
      ok,
      totalActual: cA ? cA.total : null,
      totalAnterior: cP ? cP.total : null,
    },
  })
}
