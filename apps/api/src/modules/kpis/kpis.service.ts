import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { SUB_ESTADO_3_SQL_PG } from '../concursos-cph/concursosCph.calc.js'
import type {
  KpisConcursosCeetpsQuery,
  KpisConcursosQuery,
  KpisDotacionQuery,
  KpisAlertasQuery,
  KpisDotacionHistoricaQuery,
} from './kpis.schema.js'

// ─── S4-11: KPIs de concursos CPH para el tablero ───────────────────────────
//
// porSubEstado usa el valor persistido (fresco desde el último write, ver
// concursosCph.calc.ts) y porSubEstado3 se recalcula en vivo en SQL — mismo
// motivo que el filtro homónimo de listConcursosCphService: dos de sus ramas
// comparan contra la fecha de hoy y se desactualizan solas con el tiempo.
export async function getKpisConcursosCphService(hospitalId?: string) {
  const where: Prisma.ConcursoCphWhereInput = hospitalId ? { hospitalId } : {}
  const hospitalFilterSql = hospitalId ? Prisma.sql`WHERE hospital_id = ${hospitalId}::uuid` : Prisma.empty
  const hospitalFilterSqlAlias = hospitalId ? Prisma.sql`WHERE cc.hospital_id = ${hospitalId}::uuid` : Prisma.empty

  const [total, porEstado, porSubEstado, subEstado3Rows, hospitalRows] = await Promise.all([
    prisma.concursoCph.count({ where }),
    prisma.concursoCph.groupBy({ by: ['estado'], where, _count: { _all: true } }),
    prisma.concursoCph.groupBy({ by: ['subEstado'], where, _count: { _all: true } }),
    prisma.$queryRaw<{ subEstado3: string; total: bigint }[]>(Prisma.sql`
      SELECT (${Prisma.raw(SUB_ESTADO_3_SQL_PG)}) AS "subEstado3", count(*)::bigint AS total
      FROM concursos_cph
      ${hospitalFilterSql}
      GROUP BY 1
      ORDER BY 1
    `),
    prisma.$queryRaw<{ hospitalId: string; sigla: string; nombre: string; total: bigint }[]>(Prisma.sql`
      SELECT cc.hospital_id AS "hospitalId", h.sigla, h.nombre, count(*)::bigint AS total
      FROM concursos_cph cc
      JOIN hospitales h ON h.id = cc.hospital_id
      ${hospitalFilterSqlAlias}
      GROUP BY cc.hospital_id, h.sigla, h.nombre
      ORDER BY total DESC
    `),
  ])

  return {
    total,
    porEstado: porEstado.map((r) => ({ estado: r.estado, total: r._count._all })),
    porSubEstado: porSubEstado
      .filter((r): r is typeof r & { subEstado: string } => r.subEstado !== null)
      .map((r) => ({ subEstado: r.subEstado, total: r._count._all }))
      .sort((a, b) => a.subEstado.localeCompare(b.subEstado)),
    porSubEstado3: subEstado3Rows.map((r) => ({ subEstado3: r.subEstado3, total: Number(r.total) })),
    porHospital: hospitalRows.map((r) => ({
      hospitalId: r.hospitalId,
      sigla: r.sigla,
      nombre: r.nombre,
      total: Number(r.total),
    })),
  }
}

// ─── S5-8: KPIs de concursos CEETPS para el tablero ─────────────────────────
export async function getKpisConcursosCeetpsService(query: KpisConcursosCeetpsQuery) {
  const { hospitalId, escalafonId } = query
  const where: Prisma.ConcursoCeetpsWhereInput = {
    ...(hospitalId && { hospitalId }),
    ...(escalafonId && { escalafonId }),
  }

  const hospitalFilter = hospitalId
    ? Prisma.sql`AND cc.hospital_id = ${hospitalId}::uuid`
    : Prisma.empty
  const escalafonFilter = escalafonId
    ? Prisma.sql`AND cc.escalafon_id = ${escalafonId}::uuid`
    : Prisma.empty

  const [total, porEstado, porEscalafon, porHospital] = await Promise.all([
    prisma.concursoCeetps.count({ where }),

    prisma.concursoCeetps.groupBy({
      by: ['estado'],
      where,
      _count: { _all: true },
    }),

    prisma.$queryRaw<{ escalafonId: string; codigo: string; nombre: string; total: bigint }[]>(
      Prisma.sql`
        SELECT cc.escalafon_id AS "escalafonId", e.codigo, e.nombre, count(*)::bigint AS total
        FROM concursos_ceetps cc
        JOIN escalafones e ON e.id = cc.escalafon_id
        WHERE true ${hospitalFilter} ${escalafonFilter}
        GROUP BY cc.escalafon_id, e.codigo, e.nombre
        ORDER BY total DESC
      `
    ),

    prisma.$queryRaw<{ hospitalId: string; sigla: string; nombre: string; total: bigint }[]>(
      Prisma.sql`
        SELECT cc.hospital_id AS "hospitalId", h.sigla, h.nombre, count(*)::bigint AS total
        FROM concursos_ceetps cc
        JOIN hospitales h ON h.id = cc.hospital_id
        WHERE true ${hospitalFilter} ${escalafonFilter}
        GROUP BY cc.hospital_id, h.sigla, h.nombre
        ORDER BY total DESC
      `
    ),
  ])

  return {
    total,
    porEstado: porEstado.map((r) => ({ estado: r.estado, total: r._count._all })),
    porEscalafon: porEscalafon.map((r) => ({
      escalafonId: r.escalafonId,
      codigo: r.codigo,
      nombre: r.nombre,
      total: Number(r.total),
    })),
    porHospital: porHospital.map((r) => ({
      hospitalId: r.hospitalId,
      sigla: r.sigla,
      nombre: r.nombre,
      total: Number(r.total),
    })),
  }
}

// ─── S6-1: KPIs de dotación para el tablero ─────────────────────────────────
//
// "vigente" = Cargo.estado = 'vigente' (dotación autorizada, sin importar si
// hoy tiene a alguien asignado). "vacante" = de esos, el subconjunto sin una
// Ocupacion con hasta IS NULL (nadie ocupándolo en este momento). "carrera" =
// Escalafon, "efector" = Hospital — terminología del padrón GCBA.
//
// cargos_vigentes es una CTE repetida en las tres queries (en vez de un JOIN
// gigante con GROUP BY GROUPING SETS) para que cada resultado sea una lista
// plana simple de consumir en el frontend, igual que porHospital/porEstado
// en getKpisConcursosCphService/getKpisConcursosCeetpsService.
export async function getKpisDotacionService(query: KpisDotacionQuery) {
  const { hospitalId } = query
  const hospitalFilter = hospitalId ? Prisma.sql`AND c.hospital_id = ${hospitalId}::uuid` : Prisma.empty

  const cargosVigentesCte = Prisma.sql`
    WITH cargos_vigentes AS (
      SELECT
        c.id,
        c.hospital_id,
        c.escalafon_id,
        EXISTS (
          SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL
        ) AS ocupado
      FROM cargos c
      WHERE c.estado = 'vigente' ${hospitalFilter}
    )
  `

  const [totalRows, porCarrera, porEfector] = await Promise.all([
    prisma.$queryRaw<{ total: bigint; vacantes: bigint }[]>(Prisma.sql`
      ${cargosVigentesCte}
      SELECT count(*)::bigint AS total, count(*) FILTER (WHERE NOT ocupado)::bigint AS vacantes
      FROM cargos_vigentes
    `),

    prisma.$queryRaw<{ escalafonId: string; codigo: string; nombre: string; vigentes: bigint; vacantes: bigint }[]>(
      Prisma.sql`
        ${cargosVigentesCte}
        SELECT
          cv.escalafon_id AS "escalafonId", e.codigo, e.nombre,
          count(*)::bigint AS vigentes,
          count(*) FILTER (WHERE NOT cv.ocupado)::bigint AS vacantes
        FROM cargos_vigentes cv
        JOIN escalafones e ON e.id = cv.escalafon_id
        GROUP BY cv.escalafon_id, e.codigo, e.nombre
        ORDER BY vigentes DESC
      `
    ),

    prisma.$queryRaw<{ hospitalId: string; sigla: string; nombre: string; vigentes: bigint; vacantes: bigint }[]>(
      Prisma.sql`
        ${cargosVigentesCte}
        SELECT
          cv.hospital_id AS "hospitalId", h.sigla, h.nombre,
          count(*)::bigint AS vigentes,
          count(*) FILTER (WHERE NOT cv.ocupado)::bigint AS vacantes
        FROM cargos_vigentes cv
        JOIN hospitales h ON h.id = cv.hospital_id
        GROUP BY cv.hospital_id, h.sigla, h.nombre
        ORDER BY vigentes DESC
      `
    ),
  ])

  const { total, vacantes } = totalRows[0] ?? { total: 0n, vacantes: 0n }

  return {
    totalVigentes: Number(total),
    vacantes: Number(vacantes),
    porCarrera: porCarrera.map((r) => ({
      escalafonId: r.escalafonId,
      codigo: r.codigo,
      nombre: r.nombre,
      vigentes: Number(r.vigentes),
      vacantes: Number(r.vacantes),
    })),
    porEfector: porEfector.map((r) => ({
      hospitalId: r.hospitalId,
      sigla: r.sigla,
      nombre: r.nombre,
      vigentes: Number(r.vigentes),
      vacantes: Number(r.vacantes),
    })),
  }
}

// ─── S6-3: KPIs concursales para el tablero general ─────────────────────────
//
// Vista consolidada CPH + CEETPS (total por tipo) más el detalle de
// sub-estado y "tiempo promedio por etapa" — este último solo tiene sentido
// para CPH: es el único de los dos tipos con una escalera de sub-estados
// (18 niveles, calcConcursoCph()) donde cada nivel tiene su propia fecha de
// hito. CEETPS solo tiene un EstadoConcursoCeetps plano (sin_autorizar →
// autorizado → en_proceso → finalizado), no hay una secuencia de fechas
// intermedias que promediar.
//
// ETAPAS_CPH son los pares consecutivos de fecha-hito con fecha real en el
// modelo (se salta niveles que solo tienen un campo de texto/boolean sin
// fecha propia, como C-DISPO DE LLAMADO → disposicion o H-TAD → eeDesignacion,
// ver calcSubEstado() en concursosCph.calc.ts). El promedio de cada etapa
// solo cuenta concursos con ambas fechas cargadas y en orden cronológico
// correcto (columna_hasta >= columna_desde) — evita que datos cargados fuera
// de orden (común en carga manual) distorsionen el promedio.
const ETAPAS_CPH: { etapa: string; desde: string; hasta: string }[] = [
  { etapa: 'Carátula → Autorización', desde: 'fecha_ee_concurso', hasta: 'fecha_autorizacion' },
  { etapa: 'Autorización → Sorteo de jurado', desde: 'fecha_autorizacion', hasta: 'sorteo_jurado' },
  { etapa: 'Sorteo de jurado → Examen', desde: 'sorteo_jurado', hasta: 'fecha_examen' },
  { etapa: 'Examen → Orden de mérito', desde: 'fecha_examen', hasta: 'fecha_orden_merito' },
  { etapa: 'Orden de mérito → IFACS', desde: 'fecha_orden_merito', hasta: 'fecha_ifacs' },
  { etapa: 'IFACS → INSAL', desde: 'fecha_ifacs', hasta: 'fecha_insal' },
  { etapa: 'INSAL → Apto médico', desde: 'fecha_insal', hasta: 'fecha_apto_medico' },
  { etapa: 'Apto médico → ITE', desde: 'fecha_apto_medico', hasta: 'fecha_ite' },
  { etapa: 'ITE → Resolución de designación', desde: 'fecha_ite', hasta: 'fecha_resolucion' },
]

export async function getKpisConcursosService(query: KpisConcursosQuery) {
  const { hospitalId } = query
  const whereCph: Prisma.ConcursoCphWhereInput = hospitalId ? { hospitalId } : {}
  const whereCeetps: Prisma.ConcursoCeetpsWhereInput = hospitalId ? { hospitalId } : {}
  const hospitalFilterSql = hospitalId ? Prisma.sql`AND hospital_id = ${hospitalId}::uuid` : Prisma.empty

  const etapaSelect = Prisma.join(
    ETAPAS_CPH.map(
      (e, i) => Prisma.sql`
        AVG(${Prisma.raw(e.hasta)} - ${Prisma.raw(e.desde)}) FILTER (
          WHERE ${Prisma.raw(e.hasta)} IS NOT NULL AND ${Prisma.raw(e.desde)} IS NOT NULL
            AND ${Prisma.raw(e.hasta)} >= ${Prisma.raw(e.desde)}
        ) AS "d${i}",
        COUNT(*) FILTER (
          WHERE ${Prisma.raw(e.hasta)} IS NOT NULL AND ${Prisma.raw(e.desde)} IS NOT NULL
            AND ${Prisma.raw(e.hasta)} >= ${Prisma.raw(e.desde)}
        ) AS "n${i}"
      `
    ),
    ',\n'
  )

  const [totalCph, totalCeetps, porSubEstadoCph, etapaRows] = await Promise.all([
    prisma.concursoCph.count({ where: whereCph }),
    prisma.concursoCeetps.count({ where: whereCeetps }),
    prisma.concursoCph.groupBy({ by: ['subEstado'], where: whereCph, _count: { _all: true } }),
    prisma.$queryRaw<Record<string, number | bigint | null>[]>(Prisma.sql`
      SELECT ${etapaSelect}
      FROM concursos_cph
      WHERE true ${hospitalFilterSql}
    `),
  ])

  const etapaRow = etapaRows[0] ?? {}
  const tiempoPromedioPorEtapa = ETAPAS_CPH.map((e, i) => ({
    etapa: e.etapa,
    diasPromedio: etapaRow[`d${i}`] !== null && etapaRow[`d${i}`] !== undefined ? Number(etapaRow[`d${i}`]) : null,
    muestras: Number(etapaRow[`n${i}`] ?? 0),
  }))

  return {
    totalCph,
    totalCeetps,
    total: totalCph + totalCeetps,
    porSubEstadoCph: porSubEstadoCph
      .filter((r): r is typeof r & { subEstado: string } => r.subEstado !== null)
      .map((r) => ({ subEstado: r.subEstado, total: r._count._all }))
      .sort((a, b) => a.subEstado.localeCompare(b.subEstado)),
    tiempoPromedioPorEtapa,
  }
}

// ─── S6-6: Alertas activas para el tablero ──────────────────────────────────
//
// Dos alertas, ninguna cubierta por AlertasSinMovimiento(Ceetps) (S4-10/S5-9,
// que son "sin movimiento hace N días" calculadas en el frontend):
//
// - "concursos vencidos" (CPH): venció el plazo de inscripción
//   (fecha_insc_hasta < hoy) y todavía no se programó examen. Es un
//   vencimiento de fecha dura, no una simple falta de movimiento — puede
//   pasar recién abierto el concurso si alguien no actualizó a tiempo.
// - "bajas sin concurso": baja con generaConcurso=false (si fuera true,
//   createBajaService (S5-5) ya crea el concurso en la misma transacción —
//   no puede quedar huérfana) y sin ningún Concurso enganchado todavía. Son
//   vacantes que quedaron abiertas sin ningún proceso de cobertura iniciado.
const DIA_MS = 24 * 60 * 60 * 1000
function diasDesde(fecha: Date, hoy: Date): number {
  return Math.floor((hoy.getTime() - fecha.getTime()) / DIA_MS)
}

export async function getKpisAlertasService(query: KpisAlertasQuery) {
  const { hospitalId } = query
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const [concursosVencidos, bajasSinConcurso] = await Promise.all([
    prisma.concursoCph.findMany({
      where: {
        estado: { notIn: ['finalizado', 'desierto', 'suspendido'] },
        fechaInscHasta: { lt: hoy },
        fechaExamen: null,
        ...(hospitalId && { hospitalId }),
      },
      include: { hospital: { select: { sigla: true } }, cargo: { select: { codigo: true, idSial: true } } },
      orderBy: { fechaInscHasta: 'asc' },
    }),

    prisma.baja.findMany({
      where: {
        generaConcurso: false,
        estado: 'pendiente',
        concursos: { none: {} },
        ...(hospitalId && { hospitalId }),
      },
      include: { hospital: { select: { sigla: true } }, cargo: { select: { codigo: true, idSial: true } } },
      orderBy: { fechaBaja: 'asc' },
    }),
  ])

  return {
    concursosVencidos: concursosVencidos.map((c) => ({
      id: c.id,
      cargoCodigo: c.cargo.codigo ?? c.cargo.idSial,
      hospitalSigla: c.hospital.sigla,
      subEstado: c.subEstado,
      fechaInscHasta: c.fechaInscHasta,
      diasVencido: c.fechaInscHasta ? diasDesde(c.fechaInscHasta, hoy) : 0,
    })),
    bajasSinConcurso: bajasSinConcurso.map((b) => ({
      id: b.id,
      cargoCodigo: b.cargo.codigo ?? b.cargo.idSial,
      hospitalSigla: b.hospital.sigla,
      fechaBaja: b.fechaBaja,
      diasSinConcurso: diasDesde(b.fechaBaja, hoy),
    })),
  }
}

// ─── S6-5: evolución de dotación histórica (PadronHistorico) ───────────────
//
// Desbloqueado por S6-0 (2026-08-31): antes de esa migración, PadronHistorico
// no tenía `cuil` desnormalizado, así que "personas únicas por período" solo
// se podía sacar con un JOIN a personas — acá se cuenta directo sobre la
// columna ya poblada. Un snapshot aprobado inserta una fila de
// PadronHistorico por cada ocupación vigente en ese momento (padron.service.ts,
// aprobarSnapshotService) — agrupar por fechaAsignada da un punto por semana
// de padrón procesada, no por día calendario.
//
// El filtro por hospital pasa por cargoId → cargos.hospital_id (join) en vez
// de por hospitalSigla (que sí está denormalizada en la fila) para que el
// query param sea el mismo hospitalId (uuid) que usan el resto de los
// endpoints de /kpis — aprovecha el @@index([cargoId]) agregado en S6-0.
export async function getKpisDotacionHistoricaService(query: KpisDotacionHistoricaQuery) {
  const { hospitalId } = query
  const hospitalFilter = hospitalId ? Prisma.sql`AND c.hospital_id = ${hospitalId}::uuid` : Prisma.empty

  const rows = await prisma.$queryRaw<{ fechaAsignada: Date; personas: bigint; cargos: bigint }[]>(Prisma.sql`
    SELECT
      ph.fecha_asignada AS "fechaAsignada",
      count(DISTINCT ph.cuil)::bigint AS personas,
      count(*)::bigint AS cargos
    FROM padron_historico ph
    JOIN cargos c ON c.id = ph.cargo_id
    WHERE true ${hospitalFilter}
    GROUP BY ph.fecha_asignada
    ORDER BY ph.fecha_asignada
  `)

  return {
    puntos: rows.map((r) => ({
      fecha: r.fechaAsignada,
      personas: Number(r.personas),
      cargos: Number(r.cargos),
    })),
  }
}
