import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import type { DimDotacionQuery, DimDotacionKpisQuery } from './dim-dotacion.schema.js'

// ─── Catálogos ───────────────────────────────────────────────────────────────

export async function listDimEfectoresService() {
  return prisma.dimEfectores.findMany({
    where: { activo: true },
    select: { sigla: true, nombre: true, nombreCompleto: true, tipo: true },
    orderBy: { sigla: 'asc' },
  })
}

export async function listDimCarrerasService() {
  return prisma.dimCarreras.findMany({
    where: { activo: true },
    select: { codigoRegistro: true, litCodReg: true, escalafon: true },
    orderBy: { codigoRegistro: 'asc' },
  })
}

// Catálogo de puestos únicos desde dim_puestos.
// Devuelve pares (literalPuesto, especialidad) distintos, opcionalmente
// filtrados por efector o codigoRegistro. Reemplaza GET /puestos-cargo
// para el contexto MSGC.
export async function listDimPuestosService(opts: {
  efector?: string
  codigoRegistro?: string
}) {
  const conds: Prisma.Sql[] = [Prisma.sql`pue_hasta IS NULL`]
  if (opts.efector)
    conds.push(Prisma.sql`efector = ${opts.efector}`)
  if (opts.codigoRegistro)
    conds.push(Prisma.sql`codigo_registro = ${opts.codigoRegistro}`)

  const where = Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}`

  return prisma.$queryRaw<{ literalPuesto: string; especialidad: string | null; codigoRegistro: string | null }[]>(Prisma.sql`
    SELECT DISTINCT
      literal_puesto   AS "literalPuesto",
      especialidad,
      codigo_registro  AS "codigoRegistro"
    FROM dim_puestos
    ${where}
    ORDER BY literal_puesto, especialidad NULLS LAST
  `)
}

// ─── Listado paginado de actividad actual ────────────────────────────────────
//
// Lee desde dim_actividad_hechos (es_actual = true) cruzando con dim_puestos
// y dim_personas. Es el reemplazo de listDotacionService para el contexto MSGC.
//
// Diferencias clave respecto al módulo legacy:
//   - No depende de ocupaciones/cargos/personas/hospitales
//   - La "persona" es dim_personas (cuil como PK)
//   - El "puesto" es dim_puestos (id_sial_rol como PK)
//   - El "efector" es dim_efectores (sigla como PK)
//   - La "carrera" es dim_carreras (codigo_registro como PK)

const SORT_EXPR: Record<string, Prisma.Sql> = {
  apellidoNombre:   Prisma.sql`per.apellido_nombre`,
  cuil:             Prisma.sql`dah.cuil`,
  efector:          Prisma.sql`pue.efector`,
  carrera:          Prisma.sql`pue.codigo_registro`,
  situacionRevista: Prisma.sql`dah.situacion_revista`,
  literalPuesto:    Prisma.sql`pue.literal_puesto`,
}

function buildWhere(q: DimDotacionQuery): Prisma.Sql {
  const conds: Prisma.Sql[] = [Prisma.sql`dah.fecha_hasta IS NULL`]

  if (q.efector?.length)
    conds.push(Prisma.sql`pue.efector IN (${Prisma.join(q.efector)})`)
  if (q.codigoRegistro?.length)
    conds.push(Prisma.sql`pue.codigo_registro IN (${Prisma.join(q.codigoRegistro)})`)
  if (q.situacionRevista?.length)
    conds.push(Prisma.sql`dah.situacion_revista IN (${Prisma.join(q.situacionRevista)})`)
  if (q.literalPuesto?.length)
    conds.push(Prisma.sql`pue.literal_puesto IN (${Prisma.join(q.literalPuesto)})`)
  if (q.especialidad?.length)
    conds.push(Prisma.sql`pue.especialidad IN (${Prisma.join(q.especialidad)})`)
  if (q.idSialRol)
    conds.push(Prisma.sql`dah.id_sial_rol ILIKE ${`%${q.idSialRol}%`}`)
  if (q.cuil)
    conds.push(Prisma.sql`dah.cuil ILIKE ${`%${q.cuil}%`}`)
  if (q.apellidoNombre)
    conds.push(Prisma.sql`per.apellido_nombre ILIKE ${`%${q.apellidoNombre}%`}`)

  return Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}`
}

const SELECT = Prisma.sql`
  dah.id            AS "id",
  dah.id_sial_rol   AS "idSialRol",
  dah.cuil,
  dah.situacion_revista AS "situacionRevista",
  dah.fecha_desde   AS "fechaDesde",
  dah.codigo_cargo  AS "codigoCargo",
  -- Puesto
  pue.literal_puesto    AS "literalPuesto",
  pue.especialidad,
  pue.codigo_registro   AS "codigoRegistro",
  pue.efector,
  pue.cod_rep           AS "codRep",
  pue.desc_rep          AS "descRep",
  pue.situacion_revista AS "situacionRevistaPuesto",
  -- Carrera
  car.lit_cod_reg   AS "litCodReg",
  car.escalafon,
  -- Persona
  per.apellido_nombre   AS "apellidoNombre",
  per.sexo,
  per.mail_laboral      AS "mailLaboral",
  per.telefono,
  per.fecha_nacimiento  AS "fechaNacimiento",
  -- Efector
  efe.nombre            AS "efectorNombre"
`

const FROM = Prisma.sql`
  FROM dim_actividad_hechos dah
  LEFT JOIN dim_puestos  pue ON pue.id_sial_rol      = dah.id_sial_rol
  LEFT JOIN dim_personas per ON per.cuil              = dah.cuil
  LEFT JOIN dim_carreras car ON car.codigo_registro   = pue.codigo_registro
  LEFT JOIN dim_efectores efe ON efe.sigla            = pue.efector
`

export async function listDimDotacionService(q: DimDotacionQuery) {
  const where = buildWhere(q)
  const offset = (q.page - 1) * q.limit
  const orderBy = q.sortBy
    ? Prisma.sql`ORDER BY ${SORT_EXPR[q.sortBy]} ${q.sortDir === 'desc' ? Prisma.sql`DESC NULLS LAST` : Prisma.sql`ASC NULLS LAST`}`
    : Prisma.sql`ORDER BY per.apellido_nombre ASC NULLS LAST`

  const [rows, totalRows] = await Promise.all([
    prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT ${SELECT} ${FROM} ${where} ${orderBy}
      LIMIT ${q.limit} OFFSET ${offset}
    `),
    prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS count ${FROM} ${where}
    `),
  ])

  const total = Number(totalRows[0]?.count ?? 0)
  return { rows, total, page: q.page, limit: q.limit, pages: Math.ceil(total / q.limit) }
}

// ─── KPIs de actividad actual ────────────────────────────────────────────────

export async function getDimDotacionKpisService(q: DimDotacionKpisQuery) {
  const conds: Prisma.Sql[] = [Prisma.sql`dah.fecha_hasta IS NULL`]
  if (q.efector)
    conds.push(Prisma.sql`pue.efector = ${q.efector}`)
  if (q.codigoRegistro)
    conds.push(Prisma.sql`pue.codigo_registro = ${q.codigoRegistro}`)

  const where = Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}`

  const [totales, porSitRevista, porCarrera, porEfector] = await Promise.all([
    prisma.$queryRaw<{ total: bigint; personas: bigint }[]>(Prisma.sql`
      SELECT
        count(*)::bigint AS total,
        count(DISTINCT dah.cuil)::bigint AS personas
      ${FROM} ${where}
    `),

    prisma.$queryRaw<{ situacion: string | null; total: bigint }[]>(Prisma.sql`
      SELECT dah.situacion_revista AS situacion, count(*)::bigint AS total
      ${FROM} ${where}
      GROUP BY dah.situacion_revista
      ORDER BY total DESC
    `),

    prisma.$queryRaw<{ codigoRegistro: string | null; litCodReg: string | null; total: bigint }[]>(Prisma.sql`
      SELECT
        pue.codigo_registro AS "codigoRegistro",
        car.lit_cod_reg     AS "litCodReg",
        count(*)::bigint    AS total
      ${FROM}
      LEFT JOIN dim_carreras car ON car.codigo_registro = pue.codigo_registro
      ${where}
      GROUP BY pue.codigo_registro, car.lit_cod_reg
      ORDER BY total DESC
    `),

    prisma.$queryRaw<{ efector: string | null; nombre: string | null; total: bigint }[]>(Prisma.sql`
      SELECT
        pue.efector      AS efector,
        efe.nombre       AS nombre,
        count(*)::bigint AS total
      ${FROM}
      LEFT JOIN dim_efectores efe ON efe.sigla = pue.efector
      ${where}
      GROUP BY pue.efector, efe.nombre
      ORDER BY total DESC
    `),
  ])

  const t = totales[0] ?? { total: 0n, personas: 0n }
  return {
    totalActivos:   Number(t.total),
    personasUnicas: Number(t.personas),
    porSituacionRevista: porSitRevista.map((r) => ({
      situacion: r.situacion ?? 'sin dato',
      total: Number(r.total),
    })),
    porCarrera: porCarrera.map((r) => ({
      codigoRegistro: r.codigoRegistro ?? 'sin carrera',
      litCodReg:      r.litCodReg ?? r.codigoRegistro ?? 'sin carrera',
      total:          Number(r.total),
    })),
    porEfector: porEfector.map((r) => ({
      efector: r.efector ?? 'sin efector',
      nombre:  r.nombre ?? r.efector ?? 'sin efector',
      total:   Number(r.total),
    })),
  }
}

// ─── Detalle de un id_sial_rol ───────────────────────────────────────────────

export async function getDimActividadDetalleService(idSialRol: string) {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    SELECT
      dah.id, dah.id_sial_rol AS "idSialRol", dah.cuil,
      dah.situacion_revista AS "situacionRevista",
      dah.fecha_desde AS "fechaDesde", dah.fecha_hasta AS "fechaHasta",
      dah.es_actual AS "esActual", dah.codigo_cargo AS "codigoCargo",
      pue.literal_puesto AS "literalPuesto", pue.especialidad,
      pue.codigo_registro AS "codigoRegistro", pue.efector,
      pue.cod_rep AS "codRep", pue.desc_rep AS "descRep",
      pue.jcat, pue.situacion_revista AS "situacionRevistaPuesto",
      pue.puesto_desde AS "puestoDesde", pue.puesto_hasta AS "puestoHasta",
      car.lit_cod_reg AS "litCodReg", car.escalafon,
      per.apellido_nombre AS "apellidoNombre", per.sexo,
      per.mail_laboral AS "mailLaboral", per.telefono,
      per.fecha_nacimiento AS "fechaNacimiento",
      per.salud_1er_cargo AS "saludPrimerCargo",
      efe.nombre AS "efectorNombre"
    FROM dim_actividad_hechos dah
    LEFT JOIN dim_puestos  pue ON pue.id_sial_rol    = dah.id_sial_rol
    LEFT JOIN dim_personas per ON per.cuil            = dah.cuil
    LEFT JOIN dim_carreras car ON car.codigo_registro = pue.codigo_registro
    LEFT JOIN dim_efectores efe ON efe.sigla          = pue.efector
    WHERE dah.id_sial_rol = ${idSialRol}
    ORDER BY dah.fecha_desde DESC
  `)
  return rows
}
