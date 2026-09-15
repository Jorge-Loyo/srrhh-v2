import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import type { DotacionQuery, DotacionKpisQuery } from './dotacion.schema.js'

// "Vigente" replicado del criterio ya usado en todo el proyecto (ver
// personas.service.ts, kpis.service.ts, padron.service.ts): la ocupación no
// tiene fecha de fin y el cargo que ocupa está vigente.
const BASE_FROM = Prisma.sql`
  FROM ocupaciones o
  JOIN personas p    ON p.id = o.persona_id
  JOIN cargos c      ON c.id = o.cargo_id
  JOIN hospitales h  ON h.id = c.hospital_id
  JOIN escalafones e ON e.id = c.escalafon_id
  WHERE o.hasta IS NULL AND c.estado = 'vigente'
`

// Expresión SQL de cada columna ordenable — whitelist validada ya en el
// schema (DOTACION_SORT_COLUMNS), acá solo se mapea a la expresión real.
const SORT_EXPR: Record<string, Prisma.Sql> = {
  nombreApellido:   Prisma.sql`p.apellido_nombre`,
  cuil:             Prisma.sql`p.cuil`,
  sexo:             Prisma.sql`p.sexo`,
  literalPuesto:    Prisma.sql`c.literal_puesto`,
  especialidad:     Prisma.sql`c.especialidad_legacy`,
  unificadorPuesto: Prisma.sql`c.unificador_puesto`,
  agrupador:        Prisma.sql`c.agrupador`,
  escalafon:        Prisma.sql`e.nombre`,
  situacionRevista: Prisma.sql`o.situacion_revista`,
  reparticion:      Prisma.sql`c.descripcion_repa`,
  sigla:            Prisma.sql`h.sigla`,
  codigoCargo:      Prisma.sql`c.codigo`,
  codigoRol:        Prisma.sql`o.id_sial_rol`,
  edad:             Prisma.sql`p.fecha_nacimiento`,
  antiguedad:       Prisma.sql`p.antiguedad_desde`,
}

interface DotacionRow {
  codigoCargo: string | null
  nombreApellido: string
  cuil: string
  sexo: string | null
  literalPuesto: string | null
  especialidad: string | null
  unificadorPuesto: string | null
  agrupador: string | null
  escalafon: string
  situacionRevista: string | null
  reparticion: string | null
  sigla: string
  codigoRol: string
  mailLaboral: string | null
  telefono: string | null
  edad: number | null
  antiguedad: number | null
}

function buildConditions(query: DotacionQuery): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = []
  const inList = (col: Prisma.Sql, values?: string[]) => {
    if (values?.length) conditions.push(Prisma.sql`${col} IN (${Prisma.join(values)})`)
  }

  inList(Prisma.sql`h.sigla`, query.sigla)
  inList(Prisma.sql`h.universo_totalizador`, query.universoTotalizador)
  inList(Prisma.sql`h.tipo`, query.tipoHospital)
  inList(Prisma.sql`h.monovalencia`, query.monovalencia)
  inList(Prisma.sql`c.unificador_puesto`, query.unificadorPuesto)
  inList(Prisma.sql`c.especialidad_legacy`, query.especialidad)
  inList(Prisma.sql`c.agrupador`, query.agrupador)
  inList(Prisma.sql`c.literal_puesto`, query.literalPuesto)
  inList(Prisma.sql`p.sexo`, query.sexo)
  inList(Prisma.sql`o.situacion_revista`, query.situacionRevista)
  inList(Prisma.sql`c.descripcion_repa`, query.reparticion)

  if (query.escalafonId?.length) {
    conditions.push(Prisma.sql`c.escalafon_id IN (${Prisma.join(query.escalafonId.map((id) => Prisma.sql`${id}::uuid`))})`)
  }
  if (query.codigoCargo) conditions.push(Prisma.sql`c.codigo ILIKE ${`%${query.codigoCargo}%`}`)
  if (query.nombreApellido) conditions.push(Prisma.sql`p.apellido_nombre ILIKE ${`%${query.nombreApellido}%`}`)
  if (query.cuil) conditions.push(Prisma.sql`p.cuil ILIKE ${`%${query.cuil}%`}`)
  if (query.codigoRol) conditions.push(Prisma.sql`o.id_sial_rol ILIKE ${`%${query.codigoRol}%`}`)
  if (query.edadMin !== undefined) conditions.push(Prisma.sql`date_part('year', age(p.fecha_nacimiento)) >= ${query.edadMin}`)
  if (query.edadMax !== undefined) conditions.push(Prisma.sql`date_part('year', age(p.fecha_nacimiento)) <= ${query.edadMax}`)
  if (query.antiguedadMin !== undefined) conditions.push(Prisma.sql`date_part('year', age(p.antiguedad_desde)) >= ${query.antiguedadMin}`)
  if (query.antiguedadMax !== undefined) conditions.push(Prisma.sql`date_part('year', age(p.antiguedad_desde)) <= ${query.antiguedadMax}`)
  // Disparado desde el click en las KPI cards del panel — los valores posibles
  // son los mismos literales de o.situacion_revista (Activo / Retención de
  // Cargo / Comisión), ver getDotacionKpisService más abajo.
  if (query.estado) conditions.push(Prisma.sql`o.situacion_revista = ${query.estado}`)

  return conditions
}

async function getDistinctValues(baseConditions: Prisma.Sql[]) {
  const andWhere = baseConditions.length ? Prisma.sql`AND ${Prisma.join(baseConditions, ' AND ')}` : Prisma.empty

  const distinctCol = async (col: Prisma.Sql) =>
    (
      await prisma.$queryRaw<{ value: string | null }[]>(Prisma.sql`
        SELECT DISTINCT ${col} AS value ${BASE_FROM} ${andWhere}
        ORDER BY 1
      `)
    )
      .map((r) => r.value)
      .filter((v): v is string => v !== null)

  const [
    unificadorPuesto, especialidad, agrupador, literalPuesto,
    sexo, situacionRevista, reparticion,
  ] = await Promise.all([
    distinctCol(Prisma.sql`c.unificador_puesto`),
    distinctCol(Prisma.sql`c.especialidad_legacy`),
    distinctCol(Prisma.sql`c.agrupador`),
    distinctCol(Prisma.sql`c.literal_puesto`),
    distinctCol(Prisma.sql`p.sexo`),
    distinctCol(Prisma.sql`o.situacion_revista`),
    distinctCol(Prisma.sql`c.descripcion_repa`),
  ])

  const [sigla, universoTotalizador, tipoHospital, monovalencia] = await Promise.all([
    distinctCol(Prisma.sql`h.sigla`),
    distinctCol(Prisma.sql`h.universo_totalizador`),
    distinctCol(Prisma.sql`h.tipo`),
    distinctCol(Prisma.sql`h.monovalencia`),
  ])

  return {
    distinctValues: { unificadorPuesto, especialidad, agrupador, literalPuesto, sexo, situacionRevista, reparticion },
    siglasDistinctValues: { sigla, universoTotalizador, tipoHospital, monovalencia },
  }
}

export async function listDotacionService(query: DotacionQuery) {
  const { page, limit, sortBy, sortDir, skipDistinct } = query
  const offset = (page - 1) * limit

  const conditions = buildConditions(query)
  const where = conditions.length ? Prisma.sql`AND ${Prisma.join(conditions, ' AND ')}` : Prisma.empty
  const orderBy = sortBy ? Prisma.sql`ORDER BY ${SORT_EXPR[sortBy]} ${sortDir === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`}`
    : Prisma.sql`ORDER BY p.apellido_nombre ASC`

  const [rows, totalRows, distinct] = await Promise.all([
    prisma.$queryRaw<DotacionRow[]>(Prisma.sql`
      SELECT
        c.codigo AS "codigoCargo",
        p.apellido_nombre AS "nombreApellido",
        p.cuil,
        p.sexo,
        c.literal_puesto AS "literalPuesto",
        c.especialidad_legacy AS "especialidad",
        c.unificador_puesto AS "unificadorPuesto",
        c.agrupador,
        e.nombre AS "escalafon",
        o.situacion_revista AS "situacionRevista",
        c.descripcion_repa AS "reparticion",
        h.sigla,
        o.id_sial_rol AS "codigoRol",
        p.mail_laboral AS "mailLaboral",
        p.telefono,
        date_part('year', age(p.fecha_nacimiento))::int AS "edad",
        date_part('year', age(p.antiguedad_desde))::int AS "antiguedad"
      ${BASE_FROM} ${where}
      ${orderBy}
      LIMIT ${limit} OFFSET ${offset}
    `),
    prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS count ${BASE_FROM} ${where}
    `),
    skipDistinct ? Promise.resolve(null) : getDistinctValues(conditions),
  ])

  const total = Number(totalRows[0]?.count ?? 0)
  return {
    rows,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    ...(distinct ?? {}),
  }
}

export async function getDotacionKpisService(query: DotacionKpisQuery) {
  const { hospitalId } = query
  const hospitalFilter = hospitalId ? Prisma.sql`AND c.hospital_id = ${hospitalId}::uuid` : Prisma.empty

  const vigentesCte = Prisma.sql`
    WITH ocupaciones_vigentes AS (
      SELECT o.id, o.situacion_revista, p.sexo, c.hospital_id, c.escalafon_id
      FROM ocupaciones o
      JOIN cargos c   ON c.id = o.cargo_id
      JOIN personas p ON p.id = o.persona_id
      WHERE o.hasta IS NULL AND c.estado = 'vigente' ${hospitalFilter}
    )
  `

  const [totalRow, porSitRevista, porEscalafon, porEfector] = await Promise.all([
    prisma.$queryRaw<{ total: bigint; activos: bigint; retencion: bigint; comision: bigint; mujeres: bigint; varones: bigint }[]>(Prisma.sql`
      ${vigentesCte}
      SELECT
        count(*)::bigint AS total,
        count(*) FILTER (WHERE situacion_revista = 'Activo')::bigint AS activos,
        count(*) FILTER (WHERE situacion_revista = 'Retencion de Cargo')::bigint AS retencion,
        count(*) FILTER (WHERE situacion_revista = 'Comisión')::bigint AS comision,
        count(*) FILTER (WHERE sexo = 'F')::bigint AS mujeres,
        count(*) FILTER (WHERE sexo = 'M')::bigint AS varones
      FROM ocupaciones_vigentes
    `),
    prisma.$queryRaw<{ situacion: string | null; total: bigint }[]>(Prisma.sql`
      ${vigentesCte}
      SELECT situacion_revista AS situacion, count(*)::bigint AS total
      FROM ocupaciones_vigentes
      GROUP BY situacion_revista
      ORDER BY total DESC
    `),
    prisma.$queryRaw<{ escalafonId: string; nombre: string; total: bigint }[]>(Prisma.sql`
      ${vigentesCte}
      SELECT ov.escalafon_id AS "escalafonId", e.nombre, count(*)::bigint AS total
      FROM ocupaciones_vigentes ov
      JOIN escalafones e ON e.id = ov.escalafon_id
      GROUP BY ov.escalafon_id, e.nombre
      ORDER BY total DESC
    `),
    prisma.$queryRaw<{ hospitalId: string; sigla: string; total: bigint }[]>(Prisma.sql`
      ${vigentesCte}
      SELECT ov.hospital_id AS "hospitalId", h.sigla, count(*)::bigint AS total
      FROM ocupaciones_vigentes ov
      JOIN hospitales h ON h.id = ov.hospital_id
      GROUP BY ov.hospital_id, h.sigla
      ORDER BY total DESC
    `),
  ])

  const t = totalRow[0] ?? { total: 0n, activos: 0n, retencion: 0n, comision: 0n, mujeres: 0n, varones: 0n }

  return {
    globales: {
      total: Number(t.total),
      activos: Number(t.activos),
      retencion: Number(t.retencion),
      comision: Number(t.comision),
      mujeres: Number(t.mujeres),
      varones: Number(t.varones),
    },
    porSitRevista: porSitRevista.map((r) => ({ situacion: r.situacion ?? 'Sin dato', total: Number(r.total) })),
    porEscalafon: porEscalafon.map((r) => ({ escalafonId: r.escalafonId, escalafon: r.nombre, total: Number(r.total) })),
    porEfector: porEfector.map((r) => ({ hospitalId: r.hospitalId, sigla: r.sigla, total: Number(r.total) })),
  }
}
