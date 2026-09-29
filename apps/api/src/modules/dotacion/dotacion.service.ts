import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import type { DotacionQuery, DotacionKpisQuery } from './dotacion.schema.js'

// Dedup del cargo espejo de jefatura: al jefe se le crea un cargo copia (mismo
// puesto + repartición) SIN código de jefatura para colgarle más dotación
// (límite del sistema). Es el MISMO cargo real → se descarta el espejo (sin
// jefatura) cuando existe la ocupación hermana CON jefatura para la misma
// persona+repa+puesto. `o`/`c` son los alias de la ocupación/cargo de la query.
const EXCLUIR_ESPEJO_JEFATURA = Prisma.sql`
  AND NOT (
    (o.codigo_jefaturas IS NULL OR TRIM(o.codigo_jefaturas) IN ('', '0'))
    AND EXISTS (
      SELECT 1
      FROM ocupaciones oej
      JOIN cargos cej ON cej.id = oej.cargo_id
      WHERE oej.persona_id = o.persona_id
        AND oej.hasta IS NULL
        AND cej.estado = 'vigente'
        AND coalesce(cej.codigo_repa, '')    = coalesce(c.codigo_repa, '')
        AND coalesce(cej.literal_puesto, '') = coalesce(c.literal_puesto, '')
        AND oej.codigo_jefaturas IS NOT NULL
        AND TRIM(oej.codigo_jefaturas) NOT IN ('', '0')
    )
  )
`

// "Vigente" replicado del criterio ya usado en todo el proyecto (ver
// personas.service.ts, kpis.service.ts, padron.service.ts): la ocupación no
// tiene fecha de fin y el cargo que ocupa está vigente.
const BASE_FROM = Prisma.sql`
  FROM ocupaciones o
  JOIN personas p    ON p.id = o.persona_id
  JOIN cargos c      ON c.id = o.cargo_id
  JOIN hospitales h  ON h.id = c.hospital_id
  JOIN escalafones e ON e.id = c.escalafon_id
  -- S21: catálogo del cargo (puesto/especialidad curados) + código de registro,
  -- para mostrar el nombre canónico y poblar los filtros por nombre. LEFT JOIN:
  -- especialidad y código de registro son opcionales en el cargo.
  JOIN puestos_cargo pcd        ON pcd.id = c.puesto_cargo_id
  LEFT JOIN especialidades_puesto epd ON epd.id = c.especialidad_puesto_id
  LEFT JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
  WHERE o.hasta IS NULL AND c.estado = 'vigente'
  ${EXCLUIR_ESPEJO_JEFATURA}
`

// Expresión SQL de cada columna ordenable — whitelist validada ya en el
// schema (DOTACION_SORT_COLUMNS), acá solo se mapea a la expresión real.
const SORT_EXPR: Record<string, Prisma.Sql> = {
  nombreApellido:   Prisma.sql`p.apellido_nombre`,
  cuil:             Prisma.sql`p.cuil`,
  sexo:             Prisma.sql`p.sexo`,
  literalPuesto:    Prisma.sql`pcd.nombre`,
  especialidad:     Prisma.sql`epd.nombre`,
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
  escalafon: string
  codigoRegistro: string | null
  regimen: string | null
  situacionRevista: string | null
  reparticion: string | null
  sigla: string
  codigoRol: string
  mailLaboral: string | null
  telefono: string | null
  provincia: string | null
  localidad: string | null
  edad: number | null
  antiguedad: number | null
}

function buildConditions(query: DotacionQuery): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = []
  const inList = (col: Prisma.Sql, values?: string[]) => {
    if (values?.length) conditions.push(Prisma.sql`${col} IN (${Prisma.join(values)})`)
  }
  // IN de UUIDs (castea cada valor a ::uuid).
  const inUuid = (col: Prisma.Sql, values?: string[]) => {
    if (values?.length) conditions.push(Prisma.sql`${col} IN (${Prisma.join(values.map((v) => Prisma.sql`${v}::uuid`))})`)
  }

  // ── Segmentación de hospital ──
  inList(Prisma.sql`h.sigla`, query.sigla)
  inList(Prisma.sql`h.universo_totalizador`, query.universoTotalizador)
  inList(Prisma.sql`h.tipo`, query.tipoHospital)
  inList(Prisma.sql`h.monovalencia`, query.monovalencia)

  // ── Persona ──
  inList(Prisma.sql`p.sexo`, query.sexo)
  inList(Prisma.sql`p.especialidad_cph`, query.especialidadCph)
  inList(Prisma.sql`p.provincia`, query.provincia)
  inList(Prisma.sql`p.localidad`, query.localidad)

  // ── Ocupación ──
  inList(Prisma.sql`o.situacion_revista`, query.situacionRevista)

  // ── Cargo ──
  inList(Prisma.sql`c.descripcion_repa`, query.reparticion)
  inList(Prisma.sql`c.regimen`, query.regimen)
  inList(Prisma.sql`c.tipo_origen`, query.tipoOrigen)
  inUuid(Prisma.sql`c.escalafon_id`, query.escalafonId)
  inUuid(Prisma.sql`c.codigo_registro_id`, query.codigoRegistroId)

  // ── Catálogo del cargo (S21): NO cascada — cada filtro es independiente y
  // combinable. Puesto/especialidad por NOMBRE del catálogo (join a
  // puestos_cargo / especialidades_puesto por la FK del cargo), para poder
  // buscar sobre todo el catálogo sin fijar escalafón/puesto. Multi-select ⇒
  // IN (OR interno). ──
  if (query.modalidad) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM puestos_cargo pcm
      WHERE pcm.id = c.puesto_cargo_id AND pcm.modalidad = ${query.modalidad}::"ModalidadPuesto"
    )`)
  }
  if (query.puestoNombre?.length) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM puestos_cargo pcn
      WHERE pcn.id = c.puesto_cargo_id AND pcn.nombre IN (${Prisma.join(query.puestoNombre)})
    )`)
  }
  if (query.especialidadNombre?.length) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM especialidades_puesto epn
      WHERE epn.id = c.especialidad_puesto_id AND epn.nombre IN (${Prisma.join(query.especialidadNombre)})
    )`)
  }

  // ── Solo jefes: ocupación vigente con codigo_jefaturas no vacío ──
  if (query.soloJefes) {
    conditions.push(Prisma.sql`(o.codigo_jefaturas IS NOT NULL AND TRIM(o.codigo_jefaturas) NOT IN ('', '0'))`)
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

  // S21: agrupador/unificadorPuesto ya no existen en la dotación. Puesto y
  // especialidad se ofrecen por NOMBRE del catálogo (join a puestos_cargo /
  // especialidades_puesto por la FK del cargo), no por texto snapshot.
  const [
    sexo, situacionRevista, reparticion, regimen, tipoOrigen,
    especialidadCph, provincia, localidad, puesto, especialidad,
  ] = await Promise.all([
    distinctCol(Prisma.sql`p.sexo`),
    distinctCol(Prisma.sql`o.situacion_revista`),
    distinctCol(Prisma.sql`c.descripcion_repa`),
    distinctCol(Prisma.sql`c.regimen`),
    distinctCol(Prisma.sql`c.tipo_origen`),
    distinctCol(Prisma.sql`p.especialidad_cph`),
    distinctCol(Prisma.sql`p.provincia`),
    distinctCol(Prisma.sql`p.localidad`),
    distinctCol(Prisma.sql`pcd.nombre`),
    distinctCol(Prisma.sql`epd.nombre`),
  ])

  const [sigla, universoTotalizador, tipoHospital, monovalencia] = await Promise.all([
    distinctCol(Prisma.sql`h.sigla`),
    distinctCol(Prisma.sql`h.universo_totalizador`),
    distinctCol(Prisma.sql`h.tipo`),
    distinctCol(Prisma.sql`h.monovalencia`),
  ])

  // Código de registro con {id, nombre} — el filtro va por id (FK). La columna
  // real es `literal` (no `nombre`); se expone como `nombre` al front.
  const codigoRegistro = (
    await prisma.$queryRaw<{ id: string; nombre: string }[]>(Prisma.sql`
      SELECT DISTINCT cr.id, cr.literal AS nombre ${BASE_FROM} ${andWhere}
      AND cr.id IS NOT NULL
      ORDER BY cr.literal
    `)
  ).map((r) => ({ id: r.id, nombre: r.nombre }))

  return {
    distinctValues: {
      sexo, situacionRevista, reparticion, regimen, tipoOrigen,
      especialidadCph, provincia, localidad, puesto, especialidad,
    },
    codigoRegistro,
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
        pcd.nombre AS "literalPuesto",
        epd.nombre AS "especialidad",
        e.nombre AS "escalafon",
        cr.literal AS "codigoRegistro",
        c.regimen,
        o.situacion_revista AS "situacionRevista",
        c.descripcion_repa AS "reparticion",
        h.sigla,
        o.id_sial_rol AS "codigoRol",
        p.mail_laboral AS "mailLaboral",
        p.telefono,
        p.provincia,
        p.localidad,
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
        -- Dedup del cargo espejo de jefatura: al jefe se le crea un cargo
        -- copia (mismo puesto+repartición) SIN código de jefatura para poder
        -- colgarle más dotación (límite del sistema). Es el MISMO cargo real,
        -- así que se descarta el espejo (sin jefatura) cuando existe la
        -- ocupación hermana CON jefatura para la misma persona+repa+puesto.
        AND NOT (
          (o.codigo_jefaturas IS NULL OR TRIM(o.codigo_jefaturas) IN ('', '0'))
          AND EXISTS (
            SELECT 1
            FROM ocupaciones o2
            JOIN cargos c2 ON c2.id = o2.cargo_id
            WHERE o2.persona_id = o.persona_id
              AND o2.hasta IS NULL
              AND c2.estado = 'vigente'
              AND coalesce(c2.codigo_repa, '')    = coalesce(c.codigo_repa, '')
              AND coalesce(c2.literal_puesto, '') = coalesce(c.literal_puesto, '')
              AND o2.codigo_jefaturas IS NOT NULL
              AND TRIM(o2.codigo_jefaturas) NOT IN ('', '0')
          )
        )
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
