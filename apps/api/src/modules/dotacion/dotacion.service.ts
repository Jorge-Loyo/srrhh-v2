import { Prisma } from '@prisma/client'
import { createRequire } from 'node:module'
import { prisma } from '../../shared/prisma.js'
import type { DotacionQuery, DotacionKpisQuery } from './dotacion.schema.js'

// xlsx es CJS — mismo patrón que kpis.service (createRequire en ESM).
const requireXlsx = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const XLSX = requireXlsx('xlsx') as any

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
// Exportado para reutilizar desde reportes.service.ts (mismo criterio de
// "vigente" que /dotacion, sin fecha de corte histórica — los reportes son
// sobre la foto actual).
export const BASE_FROM = Prisma.sql`
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

// FROM alternativo para la FOTO HISTÓRICA a una fecha de corte (mes 'YYYY-MM').
// Reconstruye el estado activo acumulado al cierre del mes desde padron_historico
// (mismo criterio canónico que kpis_dotacion_snapshot): corte = snapshot aprobado
// de fecha más tardía del mes; por cada id_sial_rol su última fila <= corte;
// excluye bajas (padron_diff 'eliminado') sin re-alta posterior. La subconsulta
// se expone con alias `o` y las MISMAS columnas que ocupaciones usa el resto del
// SQL (situacion_revista, id_sial_rol, persona_id, cargo_id, codigo_jefaturas)
// para reutilizar DOTACION_SELECT / condicionesDimensiones / SORT_EXPR sin
// cambios. codigo_jefaturas no está versionado en el histórico → NULL (el dedup
// de espejo de jefatura no aplica a la foto histórica, se usa DISTINCT por rol).
// Caveat: regimen/tipo_origen/descripcion_repa (del cargo) y sexo/provincia/
// localidad/edad (de la persona) reflejan el valor ACTUAL, no el del mes — no
// están versionados en padron_historico.
function baseFromHistorico(mesCorte: string) {
  return Prisma.sql`
  FROM (
    WITH corte AS (
      SELECT max(fecha_asignada) AS fecha
      FROM padron_snapshots
      WHERE estado = 'aprobado'
        AND date_trunc('month', fecha_asignada) = to_date(${mesCorte}, 'YYYY-MM')
    ),
    -- Última fila conocida de cada rol <= corte (su foto vigente ese mes).
    -- id_sial = las 2 primeras partes de id_sial_rol ('{idSial}-{cuil}-{seq}'),
    -- que es el formato que usa padron_diff para las bajas (ver ultima_baja).
    vigente AS (
      SELECT DISTINCT ON (ph.id_sial_rol)
        ph.id_sial_rol,
        split_part(ph.id_sial_rol, '-', 1) || '-' || split_part(ph.id_sial_rol, '-', 2) AS id_sial,
        ph.persona_id, ph.cargo_id, ph.situacion_revista,
        ph.fecha_asignada AS ultima_alta
      FROM padron_historico ph, corte
      WHERE corte.fecha IS NOT NULL AND ph.fecha_asignada <= corte.fecha
      ORDER BY ph.id_sial_rol, ph.fecha_asignada DESC
    ),
    -- Última baja (padron_diff 'eliminado') de cada id SIAL <= corte, AGREGADA
    -- (una sola pasada, sin subconsulta correlacionada → rápido). El rol está
    -- dado de baja si su última baja es POSTERIOR a su última alta <= corte.
    -- OJO: padron_diff.id_sial_rol es el id SIAL corto ('001810581-1'), no el
    -- compuesto de padron_historico — por eso se joinea contra v.id_sial.
    ultima_baja AS (
      SELECT d.id_sial_rol, max(ps.fecha_asignada) AS fecha_baja
      FROM padron_diff d
      JOIN padron_snapshots ps ON ps.id = d.snapshot_id, corte
      WHERE d.tipo = 'eliminado' AND ps.fecha_asignada <= corte.fecha
      GROUP BY d.id_sial_rol
    )
    SELECT v.id_sial_rol, v.persona_id, v.cargo_id, v.situacion_revista,
           NULL::text AS codigo_jefaturas
    FROM vigente v
    LEFT JOIN ultima_baja b ON b.id_sial_rol = v.id_sial
    WHERE b.fecha_baja IS NULL OR b.fecha_baja <= v.ultima_alta
  ) o
  JOIN personas p    ON p.id = o.persona_id
  JOIN cargos c      ON c.id = o.cargo_id
  JOIN hospitales h  ON h.id = c.hospital_id
  JOIN escalafones e ON e.id = c.escalafon_id
  JOIN puestos_cargo pcd        ON pcd.id = c.puesto_cargo_id
  LEFT JOIN especialidades_puesto epd ON epd.id = c.especialidad_puesto_id
  LEFT JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
  WHERE true
`
}

// Devuelve el FROM apropiado: histórico si hay mesCorte, actual si no.
function baseFrom(mesCorte?: string) {
  return mesCorte ? baseFromHistorico(mesCorte) : BASE_FROM
}

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
  codigoRol:        Prisma.sql`split_part(o.id_sial_rol, '-', 1) || '-' || split_part(o.id_sial_rol, '-', 2)`,
  edad:             Prisma.sql`p.fecha_nacimiento`,
  antiguedad:       Prisma.sql`p.antiguedad_desde`,
}

// Columnas del listado de dotación — compartidas por el listado paginado y el
// export a Excel para que ambos devuelvan exactamente los mismos campos.
const DOTACION_SELECT = Prisma.sql`
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
  -- id_sial_rol viene como '{idSial}-{cuil}-{seq}' (el idSial ya tiene un guion
  -- interno, ej. '001810581-1'). Se muestran solo las 2 primeras partes = el id
  -- SIAL del rol, sin el CUIL.
  split_part(o.id_sial_rol, '-', 1) || '-' || split_part(o.id_sial_rol, '-', 2) AS "codigoRol",
  p.mail_laboral AS "mailLaboral",
  p.telefono,
  p.provincia,
  p.localidad,
  date_part('year', age(p.fecha_nacimiento))::int AS "edad",
  date_part('year', age(p.antiguedad_desde))::int AS "antiguedad"
`

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

// Dimensiones combinables tanto por los filtros sueltos como por cada grupo de
// la unión. Es el subconjunto de DotacionQuery que participa de las UNIONES.
interface DimensionesDotacion {
  sigla?: string[]
  universoTotalizador?: string[]
  tipoHospital?: string[]
  monovalencia?: string[]
  sexo?: string[]
  especialidadCph?: string[]
  provincia?: string[]
  localidad?: string[]
  situacionRevista?: string[]
  reparticion?: string[]
  regimen?: string[]
  tipoOrigen?: string[]
  escalafonId?: string[]
  codigoRegistroId?: string[]
  modalidad?: 'pof' | 'pou' | 'ambos'
  puestoNombre?: string[]
  especialidadNombre?: string[]
  // S23-6: catálogo de Áreas Programáticas/CeSACs/estructura fija (S23-2/S23-3).
  areaProgramaticaId?: string[]
  cesacId?: string[]
  unidadFijaId?: string[]
}

// Compila un conjunto de dimensiones a un array de condiciones SQL (todas con
// semántica AND entre sí; cada dimensión multi-valor es un OR interno vía IN).
// Reutilizable por el grupo "global" (filtros sueltos) y por cada grupo de la
// unión OR — misma idea que condicionesCatalogo en personas.service.ts, pero
// con las dimensiones por nombre/sigla propias de /dotacion.
function condicionesDimensiones(f: DimensionesDotacion): Prisma.Sql[] {
  const conds: Prisma.Sql[] = []
  const inList = (col: Prisma.Sql, values?: string[]) => {
    if (values?.length) conds.push(Prisma.sql`${col} IN (${Prisma.join(values)})`)
  }
  const inUuid = (col: Prisma.Sql, values?: string[]) => {
    if (values?.length) conds.push(Prisma.sql`${col} IN (${Prisma.join(values.map((v) => Prisma.sql`${v}::uuid`))})`)
  }

  // ── Segmentación de hospital ──
  inList(Prisma.sql`h.sigla`, f.sigla)
  inList(Prisma.sql`h.universo_totalizador`, f.universoTotalizador)
  inList(Prisma.sql`h.tipo`, f.tipoHospital)
  inList(Prisma.sql`h.monovalencia`, f.monovalencia)

  // ── Persona ──
  inList(Prisma.sql`p.sexo`, f.sexo)
  inList(Prisma.sql`p.especialidad_cph`, f.especialidadCph)
  inList(Prisma.sql`p.provincia`, f.provincia)
  inList(Prisma.sql`p.localidad`, f.localidad)

  // ── Ocupación ──
  inList(Prisma.sql`o.situacion_revista`, f.situacionRevista)

  // ── Cargo ──
  inList(Prisma.sql`c.descripcion_repa`, f.reparticion)
  inList(Prisma.sql`c.regimen`, f.regimen)
  inList(Prisma.sql`c.tipo_origen`, f.tipoOrigen)
  inUuid(Prisma.sql`c.escalafon_id`, f.escalafonId)
  inUuid(Prisma.sql`c.codigo_registro_id`, f.codigoRegistroId)

  // ── Catálogo del cargo (S21): NO cascada — cada filtro es independiente y
  // combinable. Puesto/especialidad por NOMBRE del catálogo (join a
  // puestos_cargo / especialidades_puesto por la FK del cargo), para poder
  // buscar sobre todo el catálogo sin fijar escalafón/puesto. Multi-select ⇒
  // IN (OR interno). ──
  if (f.modalidad) {
    conds.push(Prisma.sql`EXISTS (
      SELECT 1 FROM puestos_cargo pcm
      WHERE pcm.id = c.puesto_cargo_id AND pcm.modalidad = ${f.modalidad}::"ModalidadPuesto"
    )`)
  }
  if (f.puestoNombre?.length) {
    conds.push(Prisma.sql`EXISTS (
      SELECT 1 FROM puestos_cargo pcn
      WHERE pcn.id = c.puesto_cargo_id AND pcn.nombre IN (${Prisma.join(f.puestoNombre)})
    )`)
  }
  if (f.especialidadNombre?.length) {
    conds.push(Prisma.sql`EXISTS (
      SELECT 1 FROM especialidades_puesto epn
      WHERE epn.id = c.especialidad_puesto_id AND epn.nombre IN (${Prisma.join(f.especialidadNombre)})
    )`)
  }

  // ── S23-6: Área Programática / CeSAC / unidad fija (S23-2/S23-3/S23-4) —
  // FK directa en el cargo (cesac_id/unidad_fija_id), salvo areaProgramaticaId
  // que no está desnormalizado en cargos: se resuelve vía el CeSAC. ──
  inUuid(Prisma.sql`c.cesac_id`, f.cesacId)
  inUuid(Prisma.sql`c.unidad_fija_id`, f.unidadFijaId)
  if (f.areaProgramaticaId?.length) {
    conds.push(Prisma.sql`EXISTS (
      SELECT 1 FROM cesacs csap
      WHERE csap.id = c.cesac_id AND csap.area_programatica_id IN (${Prisma.join(f.areaProgramaticaId.map((v) => Prisma.sql`${v}::uuid`))})
    )`)
  }

  return conds
}

// `omitir`: dimensión a excluir del "grupo en edición" (filtros sueltos). Lo usa
// el facetado de opciones (getDistinctValues) para que cada desplegable calcule
// sus opciones aplicando todos los filtros MENOS el suyo propio — así se pueden
// tildar varias opciones de una misma dimensión sin que las demás desaparezcan.
// Subconjunto de DotacionQuery que efectivamente participa del filtrado (todo
// menos paginación/orden/fecha de corte) — tipo del parámetro de
// buildConditions para poder reutilizarla desde reportes.service.ts, que no
// maneja esos campos. DotacionQuery sigue siendo asignable acá sin cambios.
export type DotacionFiltersQuery = Omit<DotacionQuery, 'page' | 'limit' | 'sortBy' | 'sortDir' | 'skipDistinct' | 'mesCorte'>

export function buildConditions(query: DotacionFiltersQuery, omitir?: keyof DimensionesDotacion): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = []

  // ── UNIONES (OR) ──────────────────────────────────────────────────────────
  // El "grupo en edición" = las dimensiones sueltas de la query. Se combina con
  // los `grupos` recibidos: cada grupo compila a un AND de sus dimensiones y
  // entre grupos hay OR. Los filtros globales (búsqueda rápida, edad,
  // antigüedad, soloJefes, estado) se aplican con AND sobre toda la unión.
  const grupoEnEdicion: DimensionesDotacion = {
    sigla: query.sigla,
    universoTotalizador: query.universoTotalizador,
    tipoHospital: query.tipoHospital,
    monovalencia: query.monovalencia,
    sexo: query.sexo,
    especialidadCph: query.especialidadCph,
    provincia: query.provincia,
    localidad: query.localidad,
    situacionRevista: query.situacionRevista,
    reparticion: query.reparticion,
    regimen: query.regimen,
    tipoOrigen: query.tipoOrigen,
    escalafonId: query.escalafonId,
    codigoRegistroId: query.codigoRegistroId,
    modalidad: query.modalidad,
    puestoNombre: query.puestoNombre,
    especialidadNombre: query.especialidadNombre,
    areaProgramaticaId: query.areaProgramaticaId,
    cesacId: query.cesacId,
    unidadFijaId: query.unidadFijaId,
  }
  // Facetado: quita la dimensión propia del grupo en edición para no auto-filtrarse.
  if (omitir) (grupoEnEdicion as Record<string, unknown>)[omitir] = undefined
  const gruposDimensiones: DimensionesDotacion[] = [
    ...(query.grupos ?? []),
    grupoEnEdicion,
  ]
  const orClauses = gruposDimensiones
    .map((g) => {
      const conds = condicionesDimensiones(g)
      return conds.length ? Prisma.sql`(${Prisma.join(conds, ' AND ')})` : null
    })
    .filter((c): c is Prisma.Sql => c !== null)
  if (orClauses.length > 0) {
    conditions.push(Prisma.sql`(${Prisma.join(orClauses, ' OR ')})`)
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

async function getDistinctValues(query: DotacionQuery) {
  // Facetado por dimensión: las opciones de cada desplegable se calculan con
  // TODOS los filtros aplicados MENOS el de esa misma dimensión. Así, al tener
  // ya seleccionada una opción de (p.ej.) Puesto, el desplegable de Puesto
  // sigue mostrando las demás opciones para poder sumarlas (multi-select real).
  const andWherePara = (dim?: keyof DimensionesDotacion) => {
    const conds = buildConditions(query, dim)
    return conds.length ? Prisma.sql`AND ${Prisma.join(conds, ' AND ')}` : Prisma.empty
  }

  const from = baseFrom(query.mesCorte)
  const distinctCol = async (col: Prisma.Sql, dim?: keyof DimensionesDotacion) =>
    (
      await prisma.$queryRaw<{ value: string | null }[]>(Prisma.sql`
        SELECT DISTINCT ${col} AS value ${from} ${andWherePara(dim)}
        ORDER BY 1
      `)
    )
      .map((r) => r.value)
      .filter((v): v is string => v !== null)

  // Cada dimensión excluye su propio filtro (2º arg) para el facetado.
  const [
    sexo, situacionRevista, reparticion, regimen, tipoOrigen,
    especialidadCph, provincia, localidad, puesto, especialidad,
  ] = await Promise.all([
    distinctCol(Prisma.sql`p.sexo`, 'sexo'),
    distinctCol(Prisma.sql`o.situacion_revista`, 'situacionRevista'),
    distinctCol(Prisma.sql`c.descripcion_repa`, 'reparticion'),
    distinctCol(Prisma.sql`c.regimen`, 'regimen'),
    distinctCol(Prisma.sql`c.tipo_origen`, 'tipoOrigen'),
    distinctCol(Prisma.sql`p.especialidad_cph`, 'especialidadCph'),
    distinctCol(Prisma.sql`p.provincia`, 'provincia'),
    distinctCol(Prisma.sql`p.localidad`, 'localidad'),
    distinctCol(Prisma.sql`pcd.nombre`, 'puestoNombre'),
    distinctCol(Prisma.sql`epd.nombre`, 'especialidadNombre'),
  ])

  // Universo / Tipo / Monovalencia salen del CATÁLOGO completo de hospitales
  // (no del dataset filtrado): la clasificación de universo/monovalencia hoy
  // solo está cargada en reparticiones administrativas que NO tienen dotación,
  // así que facetar sobre la dotación los dejaba vacíos. Mostrar todas las
  // opciones del catálogo permite elegirlas aunque devuelvan 0 (ej. "Nivel
  // Central"). `sigla` sigue facetada sobre la dotación (es el selector real de
  // reparticiones con personal). Ver análisis: 61/76 hospitales con dotación
  // tienen universo/monovalencia vacíos.
  const distinctHospital = async (col: Prisma.Sql) =>
    (
      await prisma.$queryRaw<{ value: string | null }[]>(Prisma.sql`
        SELECT DISTINCT ${col} AS value FROM hospitales
        WHERE activo = true AND ${col} IS NOT NULL AND trim(${col}) <> ''
        ORDER BY 1
      `)
    )
      .map((r) => r.value)
      .filter((v): v is string => v !== null)

  const [sigla, universoTotalizador, tipoHospital, monovalencia] = await Promise.all([
    distinctCol(Prisma.sql`h.sigla`),
    distinctHospital(Prisma.sql`universo_totalizador`),
    distinctHospital(Prisma.sql`tipo`),
    distinctHospital(Prisma.sql`monovalencia`),
  ])

  // Código de registro con {id, codigo, nombre} — el filtro va por id (FK).
  // `codigo` es el código real (24, 37, 85...) y `nombre` su literal/escalafón.
  // El front muestra "codigo — nombre" porque hay literales repetidos entre
  // códigos distintos (ej. 22 y 37 = "Nueva Carrera Profesional Hospitalaria"),
  // así que el código es lo que los desambigua. Orden numérico por código.
  const codigoRegistro = (
    await prisma.$queryRaw<{ id: string; codigo: string; nombre: string }[]>(Prisma.sql`
      SELECT id, codigo, nombre FROM (
        SELECT DISTINCT cr.id, cr.codigo, cr.literal AS nombre ${from} ${andWherePara('codigoRegistroId')}
        AND cr.id IS NOT NULL
      ) q
      ORDER BY
        NULLIF(regexp_replace(codigo, '[^0-9]', '', 'g'), '')::int NULLS LAST,
        codigo
    `)
  ).map((r) => ({ id: r.id, codigo: r.codigo, nombre: r.nombre }))

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

  const from = baseFrom(query.mesCorte)
  const [rows, totalRows, distinct] = await Promise.all([
    prisma.$queryRaw<DotacionRow[]>(Prisma.sql`
      SELECT ${DOTACION_SELECT}
      ${from} ${where}
      ${orderBy}
      LIMIT ${limit} OFFSET ${offset}
    `),
    prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS count ${from} ${where}
    `),
    skipDistinct ? Promise.resolve(null) : getDistinctValues(query),
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
        -- S22-2/S22-3 (Dotaneitor): normalización total a minúscula sin tilde
        -- — literales viejos (pre-S22) ya no matchean, hoy son lowercase.
        count(*) FILTER (WHERE situacion_revista = 'activo')::bigint AS activos,
        count(*) FILTER (WHERE situacion_revista = 'retencion de cargo')::bigint AS retencion,
        count(*) FILTER (WHERE situacion_revista = 'comision')::bigint AS comision,
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

// Capitaliza la primera letra (puesto/especialidad vienen en minúscula del
// catálogo). Equivalente al `capitalizar` del front, solo para el Excel.
function capPrimera(s: string | null): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Export a Excel de TODO el resultado del filtro actual (sin paginar). Usa los
// mismos filtros + uniones (buildConditions) y las mismas columnas que el
// listado (DOTACION_SELECT). Se genera en el servidor de una sola vez para no
// chocar con el límite de paginación (max 200) del endpoint de listado.
export async function exportDotacionService(query: DotacionQuery) {
  const conditions = buildConditions(query)
  const where = conditions.length ? Prisma.sql`AND ${Prisma.join(conditions, ' AND ')}` : Prisma.empty
  const orderBy = query.sortBy
    ? Prisma.sql`ORDER BY ${SORT_EXPR[query.sortBy]} ${query.sortDir === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`}`
    : Prisma.sql`ORDER BY p.apellido_nombre ASC`

  const rows = await prisma.$queryRaw<DotacionRow[]>(Prisma.sql`
    SELECT ${DOTACION_SELECT}
    ${baseFrom(query.mesCorte)} ${where}
    ${orderBy}
  `)

  // Mismas columnas/orden que el export del front (hoja "Dotación").
  const data = rows.map((r) => ({
    'Cód. SIAL': r.codigoRol,
    CUIL: r.cuil,
    'Apellido y Nombre': r.nombreApellido,
    Repartición: r.sigla,
    Escalafón: r.escalafon,
    'Cód. Registro': r.codigoRegistro ?? '',
    'Cód. Cargo': r.codigoCargo ?? '',
    Puesto: capPrimera(r.literalPuesto),
    Especialidad: capPrimera(r.especialidad),
    Régimen: r.regimen ?? '',
    'Situación de Revista': r.situacionRevista ?? '',
    'Repartición (SIAL)': r.reparticion ?? '',
    Sexo: r.sexo ?? '',
    Provincia: r.provincia ?? '',
    Localidad: r.localidad ?? '',
    Edad: r.edad ?? '',
    Antigüedad: r.antiguedad ?? '',
    'Mail Laboral': r.mailLaboral ?? '',
    Teléfono: r.telefono ?? '',
  }))

  const sheet = XLSX.utils.json_to_sheet(data)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Dotación')
  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return { buffer, total: rows.length }
}

// Meses disponibles para el selector de "Fecha de corte": un corte por mes =
// la fecha del padrón aprobado más tardío de cada mes. Es la misma noción de
// cierre mensual que usa el KPI histórico (padron_snapshots estado='aprobado').
export async function getDotacionCortesService() {
  const rows = await prisma.$queryRaw<{ mes: string; corte: Date }[]>(Prisma.sql`
    SELECT to_char(date_trunc('month', fecha_asignada), 'YYYY-MM') AS mes,
           max(fecha_asignada) AS corte
    FROM padron_snapshots
    WHERE estado = 'aprobado'
    GROUP BY 1
    ORDER BY 1 DESC
  `)
  return rows.map((r) => ({ mes: r.mes, corte: r.corte }))
}
