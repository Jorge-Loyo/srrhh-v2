import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { PersonasQuery } from './personas.schema.js'

interface PersonaRow {
  id: string
  cuil: string
  numeroDoc: string | null
  tipoDoc: string | null
  apellidoNombre: string
  fechaNacimiento: Date | null
  sexo: string | null
  especialidadPrincipal: string | null
  activo: boolean
  createdAt: Date
  updatedAt: Date
  puesto: string | null
}

export async function listPersonasService(query: PersonasQuery) {
  const { page, limit, search, activo, hospitalId, escalafonId, puesto, especialidad } = query
  const offset = (page - 1) * limit

  const conditions: Prisma.Sql[] = []

  if (search) {
    const like = `%${search}%`
    const tsQuery = search.trim().split(/\s+/).map((t) => `${t}:*`).join(' & ')
    conditions.push(Prisma.sql`(
      to_tsvector('spanish_unaccent', p.apellido_nombre) @@ to_tsquery('spanish_unaccent', ${tsQuery})
      OR p.cuil ILIKE ${like}
      OR p.numero_doc ILIKE ${like}
    )`)
  }
  if (activo !== undefined) conditions.push(Prisma.sql`p.activo = ${activo}`)
  if (hospitalId) conditions.push(Prisma.sql`c.hospital_id = ${hospitalId}::uuid`)
  if (escalafonId) conditions.push(Prisma.sql`c.escalafon_id = ${escalafonId}::uuid`)
  if (puesto) conditions.push(Prisma.sql`c.literal_puesto = ${puesto}`)
  if (especialidad) conditions.push(Prisma.sql`c.especialidad = ${especialidad}`)

  const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty

  const joinCargoVigente = Prisma.sql`
    LEFT JOIN LATERAL (
      SELECT o.cargo_id FROM ocupaciones o
      WHERE o.persona_id = p.id AND o.hasta IS NULL
      LIMIT 1
    ) oc ON true
    LEFT JOIN cargos c ON c.id = oc.cargo_id
  `

  const [rows, totalRows] = await Promise.all([
    prisma.$queryRaw<PersonaRow[]>(Prisma.sql`
      SELECT
        p.id, p.cuil,
        p.numero_doc AS "numeroDoc", p.tipo_doc AS "tipoDoc",
        p.apellido_nombre AS "apellidoNombre",
        p.fecha_nacimiento AS "fechaNacimiento",
        p.sexo, p.especialidad_principal AS "especialidadPrincipal",
        p.activo, p.created_at AS "createdAt", p.updated_at AS "updatedAt",
        c.literal_puesto AS "puesto"
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
        include: { cargo: { include: { hospital: true, escalafon: true, codigoRegistro: true } } },
      },
      // S8C-2: historial completo en padrón semanal
      padronHistorico: {
        include: { snapshot: { select: { id: true, fechaAsignada: true, filename: true } } },
        orderBy: { fechaAsignada: 'desc' },
      },
    },
  })
  if (!persona) throw AppError.notFound('Persona no encontrada')
  return persona
}

export async function getPersonaBajasSialService(id: string) {
  const persona = await prisma.persona.findUnique({ where: { id }, select: { cuil: true } })
  if (!persona) throw AppError.notFound('Persona no encontrada')

  // cuil en personas sin guiones (20351565064), en bajas con guiones (20-35156506-4)
  const cuil = persona.cuil
  const cuilConGuiones = `${cuil.slice(0, 2)}-${cuil.slice(2, 10)}-${cuil.slice(10)}`

  return prisma.$queryRawUnsafe<{
    cargo: string; lit_puesto: string | null; escalafon: string | null
    cargo_desde: Date | null; cargo_hasta: Date | null; mot_baja: string | null
    doc_resp_baja: string | null; desc_rep: string | null; car_codigo: string | null
    codigo_cargo: string | null
  }[]>(`
    SELECT r.cargo, r.lit_puesto, r.escalafon, r.cargo_desde, r.cargo_hasta,
           r.mot_baja, r.doc_resp_baja, r.desc_rep, r.car_codigo,
           c.codigo as codigo_cargo
    FROM baja_sial_registros r
    LEFT JOIN cargos c ON c.id_sial = r.cargo
    WHERE r.cuil = $1
      AND r.snapshot_id = (SELECT id FROM baja_sial_snapshots WHERE estado = 'aprobado' ORDER BY fecha_archivo DESC LIMIT 1)
    ORDER BY r.cargo
  `, cuilConGuiones)
}
