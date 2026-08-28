import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { SUB_ESTADO_3_SQL_PG } from '../concursos-cph/concursosCph.calc.js'
import type { KpisConcursosCeetpsQuery } from './kpis.schema.js'

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
