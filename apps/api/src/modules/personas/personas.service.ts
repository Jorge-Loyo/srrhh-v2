import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { PersonasQuery, GrupoCatalogo } from './personas.schema.js'

// S21: compila un grupo de la cascada de catálogo a un AND de condiciones SQL
// sobre el cargo vigente (alias `c`). Devuelve null si el grupo no aporta nada.
// Varios grupos se combinan con OR (uniones) — ver listPersonasService.
function condicionesCatalogo(g: GrupoCatalogo): Prisma.Sql | null {
  const conds: Prisma.Sql[] = []
  if (g.hospitalId) conds.push(Prisma.sql`c.hospital_id = ${g.hospitalId}::uuid`)
  if (g.escalafonId) conds.push(Prisma.sql`c.escalafon_id = ${g.escalafonId}::uuid`)
  if (g.modalidad)
    conds.push(Prisma.sql`EXISTS (
      SELECT 1 FROM puestos_cargo pcm
      WHERE pcm.id = c.puesto_cargo_id AND pcm.modalidad = ${g.modalidad}::"ModalidadPuesto"
    )`)
  if (g.puestoCargoId) conds.push(Prisma.sql`c.puesto_cargo_id = ${g.puestoCargoId}::uuid`)
  if (g.especialidadPuestoId)
    conds.push(Prisma.sql`c.especialidad_puesto_id = ${g.especialidadPuestoId}::uuid`)
  if (conds.length === 0) return null
  return Prisma.sql`(${Prisma.join(conds, ' AND ')})`
}

interface PersonaRow {
  id: string
  cuil: string
  numeroDoc: string | null
  tipoDoc: string | null
  apellidoNombre: string
  fechaNacimiento: Date | null
  sexo: string | null
  especialidadPrincipal: string | null
  especialidadCph: string | null
  activo: boolean
  createdAt: Date
  updatedAt: Date
  puesto: string | null
  idSial: string | null
}

export async function listPersonasService(query: PersonasQuery) {
  const {
    page,
    limit,
    search,
    activo,
    hospitalId,
    escalafonId,
    modalidad,
    puestoCargoId,
    especialidadPuestoId,
    idSial,
    soloJefes,
    grupos,
  } = query
  const offset = (page - 1) * limit

  const conditions: Prisma.Sql[] = []

  if (search) {
    const like = `%${search}%`
    const tsQuery = search
      .trim()
      .split(/\s+/)
      .map((t) => `${t}:*`)
      .join(' & ')
    conditions.push(Prisma.sql`(
      to_tsvector('spanish_unaccent', p.apellido_nombre) @@ to_tsquery('spanish_unaccent', ${tsQuery})
      OR p.cuil ILIKE ${like}
      OR p.numero_doc ILIKE ${like}
    )`)
  }
  if (activo !== undefined) conditions.push(Prisma.sql`p.activo = ${activo}`)

  // S21: cascada de catálogo con UNIONES (OR). Los campos sueltos forman el
  // "grupo en edición"; se combinan con los `grupos` recibidos. Cada grupo es
  // un AND de sus campos (repartición · escalafón → modalidad → puesto →
  // especialidad); entre grupos hay OR. Los filtros globales (search, activo,
  // idSial, soloJefes) se aplican con AND sobre la unión.
  const gruposCatalogo: GrupoCatalogo[] = [
    ...(grupos ?? []),
    { hospitalId, escalafonId, modalidad, puestoCargoId, especialidadPuestoId },
  ]
  const orClauses = gruposCatalogo
    .map(condicionesCatalogo)
    .filter((c): c is Prisma.Sql => c !== null)
  if (orClauses.length > 0) {
    conditions.push(Prisma.sql`(${Prisma.join(orClauses, ' OR ')})`)
  }

  if (idSial)
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM ocupaciones o2
      JOIN cargos c2 ON c2.id = o2.cargo_id
      WHERE o2.persona_id = p.id
        AND (TRIM(c2.id_sial) = TRIM(${idSial}) OR TRIM(c2.id_sial) LIKE ${idSial + '-%'})
    )`)
  // Solo jefes: tiene una ocupación VIGENTE de jefatura (codigo_jefaturas no
  // vacío y distinto de '0').
  if (soloJefes)
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM ocupaciones oj
      WHERE oj.persona_id = p.id
        AND oj.hasta IS NULL
        AND oj.codigo_jefaturas IS NOT NULL
        AND TRIM(oj.codigo_jefaturas) NOT IN ('', '0')
    )`)

  const where = conditions.length
    ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
    : Prisma.empty

  // S21-5: la "especialidad principal" es la del CARGO vigente de la persona
  // (semántica real de la columna). Se deriva en runtime desde el cargo vigente
  // (fuente de verdad: especialidad_puesto del catálogo, con fallback al snapshot
  // especialidad_legacy) en vez de leer p.especialidad_principal, que era
  // write-once y quedaba stale. Ver S21-5 / DECISIONES.
  const joinCargoVigente = Prisma.sql`
    LEFT JOIN LATERAL (
      SELECT o.cargo_id FROM ocupaciones o
      WHERE o.persona_id = p.id
      ORDER BY (o.hasta IS NULL) DESC, o.hasta DESC
      LIMIT 1
    ) oc ON true
    LEFT JOIN cargos c ON c.id = oc.cargo_id
    LEFT JOIN especialidades_puesto ep ON ep.id = c.especialidad_puesto_id
  `

  const [rows, totalRows] = await Promise.all([
    prisma.$queryRaw<PersonaRow[]>(Prisma.sql`
      SELECT
        p.id, p.cuil,
        p.numero_doc AS "numeroDoc", p.tipo_doc AS "tipoDoc",
        p.apellido_nombre AS "apellidoNombre",
        p.fecha_nacimiento AS "fechaNacimiento",
        p.sexo,
        COALESCE(ep.nombre, c.especialidad_legacy) AS "especialidadPrincipal",
        p.especialidad_cph AS "especialidadCph",
        p.activo, p.created_at AS "createdAt", p.updated_at AS "updatedAt",
        c.literal_puesto AS "puesto",
        REGEXP_REPLACE(c.id_sial, '-[^-]+$', '') AS "idSial"
      FROM personas p
      ${joinCargoVigente}
      ${where}
      ORDER BY p.apellido_nombre ASC
      LIMIT ${limit} OFFSET ${offset}
    `),
    prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS count FROM personas p ${joinCargoVigente} ${where}
    `),
  ])

  const total = Number(totalRows[0]?.count ?? 0)
  return { data: rows, meta: { total, page, limit, pages: Math.ceil(total / limit) } }
}

export async function getPersonaByIdService(id: string) {
  const persona = await prisma.persona.findUnique({
    where: { id },
    include: {
      ocupaciones: {
        orderBy: [{ hasta: 'asc' }, { desde: 'desc' }],
        include: { cargo: { include: { hospital: true, escalafon: true, codigoRegistro: true, especialidadPuesto: { select: { id: true, nombre: true } } } } },
      },
      padronHistorico: {
        include: { snapshot: { select: { id: true, fechaAsignada: true, filename: true } } },
        orderBy: { fechaAsignada: 'desc' },
      },
      // Concursos donde fue persona designada
      concursosCphDesignado: {
        orderBy: { createdAt: 'desc' },
        include: {
          cargo: { select: { id: true, codigo: true, literalPuesto: true } },
          hospital: { select: { id: true, sigla: true, nombre: true } },
          concurso: { select: { id: true, fechaVacante: true } },
        },
      },
    },
  })
  if (!persona) throw AppError.notFound('Persona no encontrada')
  return persona
}

export async function getPersonaSialRolesService(id: string) {
  const persona = await prisma.persona.findUnique({ where: { id }, select: { id: true } })
  if (!persona) throw AppError.notFound('Persona no encontrada')

  return prisma.$queryRaw<
    {
      idSialRol: string
      cargoId: string
      codigoCargo: string | null
      literalPuesto: string | null
      hospitalSigla: string
      desde: Date | null
    }[]
  >`
    SELECT
      o.id_sial_rol AS "idSialRol",
      o.cargo_id    AS "cargoId",
      c.codigo      AS "codigoCargo",
      c.literal_puesto AS "literalPuesto",
      h.sigla       AS "hospitalSigla",
      o.desde
    FROM ocupaciones o
    JOIN cargos c    ON c.id = o.cargo_id
    JOIN hospitales h ON h.id = c.hospital_id
    WHERE o.persona_id = ${id}::uuid
      AND o.hasta IS NULL
    ORDER BY o.desde DESC NULLS LAST
  `
}

export async function getPersonaBajasSialService(id: string) {
  const persona = await prisma.persona.findUnique({ where: { id }, select: { cuil: true } })
  if (!persona) throw AppError.notFound('Persona no encontrada')

  // cuil en personas sin guiones (20351565064), en bajas con guiones (20-35156506-4)
  const cuil = persona.cuil
  const cuilConGuiones = `${cuil.slice(0, 2)}-${cuil.slice(2, 10)}-${cuil.slice(10)}`

  return prisma.$queryRaw<
    {
      cargo: string
      lit_puesto: string | null
      escalafon: string | null
      cargo_desde: Date | null
      cargo_hasta: Date | null
      mot_baja: string | null
      doc_resp_baja: string | null
      desc_rep: string | null
      car_codigo: string | null
      codigo_cargo: string | null
    }[]
  >`
    SELECT r.cargo, r.lit_puesto, r.escalafon, r.cargo_desde, r.cargo_hasta,
           r.mot_baja, r.doc_resp_baja, r.desc_rep, r.car_codigo,
           c.codigo as codigo_cargo
    FROM baja_sial_registros r
    LEFT JOIN cargos c ON c.id_sial = r.cargo
    WHERE r.cuil = ${cuilConGuiones}
      AND r.snapshot_id = (SELECT id FROM baja_sial_snapshots WHERE estado = 'aprobado' ORDER BY fecha_archivo DESC LIMIT 1)
    ORDER BY r.cargo
  `
}
