import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { PersonasQuery } from './personas.schema.js'

// Fila cruda del SELECT — columnas aliasadas a camelCase a mano porque viene
// de $queryRaw, no del query builder de Prisma (que sí lo hace solo).
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
}

// ─── S3-1 + S3-3: listado paginado con full-text search + filtros ──────────
//
// Se usa $queryRaw (no el query builder de Prisma) porque el criterio de
// éxito del sprint pide full-text search real de Postgres (`to_tsvector` +
// `plainto_tsquery`, apoyado en el índice GIN de S3-11), no un `contains`
// (ILIKE) disfrazado. El filtro por hospital/escalafón necesita cruzar por
// la ocupación VIGENTE de la persona (`ocupaciones.hasta IS NULL` →
// `cargos.hospital_id`/`escalafon_id`), que sí se arma con un EXISTS.
export async function listPersonasService(query: PersonasQuery) {
  const { page, limit, search, activo, hospitalId, escalafonId } = query
  const offset = (page - 1) * limit

  const conditions: Prisma.Sql[] = []

  if (search) {
    const like = `%${search}%`
    conditions.push(Prisma.sql`(
      to_tsvector('spanish', p.apellido_nombre) @@ plainto_tsquery('spanish', ${search})
      OR p.cuil ILIKE ${like}
      OR p.numero_doc ILIKE ${like}
    )`)
  }
  if (activo !== undefined) {
    conditions.push(Prisma.sql`p.activo = ${activo}`)
  }
  if (hospitalId || escalafonId) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM ocupaciones o
      JOIN cargos c ON c.id = o.cargo_id
      WHERE o.persona_id = p.id AND o.hasta IS NULL
      ${hospitalId ? Prisma.sql`AND c.hospital_id = ${hospitalId}::uuid` : Prisma.empty}
      ${escalafonId ? Prisma.sql`AND c.escalafon_id = ${escalafonId}::uuid` : Prisma.empty}
    )`)
  }

  const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty

  const [rows, totalRows] = await Promise.all([
    prisma.$queryRaw<PersonaRow[]>(Prisma.sql`
      SELECT
        p.id, p.cuil,
        p.numero_doc AS "numeroDoc", p.tipo_doc AS "tipoDoc",
        p.apellido_nombre AS "apellidoNombre",
        p.fecha_nacimiento AS "fechaNacimiento",
        p.sexo, p.especialidad_principal AS "especialidadPrincipal",
        p.activo, p.created_at AS "createdAt", p.updated_at AS "updatedAt"
      FROM personas p
      ${where}
      ORDER BY p.apellido_nombre ASC
      LIMIT ${limit} OFFSET ${offset}
    `),
    prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS count FROM personas p ${where}
    `),
  ])

  const total = Number(totalRows[0]?.count ?? 0)
  return { data: rows, meta: { total, page, limit, pages: Math.ceil(total / limit) } }
}

// ─── S3-2: detalle con ocupaciones (activas e históricas) ───────────────────
export async function getPersonaByIdService(id: string) {
  const persona = await prisma.persona.findUnique({
    where: { id },
    include: {
      ocupaciones: {
        orderBy: [{ hasta: 'asc' }, { desde: 'desc' }], // vigentes (hasta null) primero
        include: { cargo: { include: { hospital: true, escalafon: true } } },
      },
    },
  })
  if (!persona) throw AppError.notFound('Persona no encontrada')
  return persona
}
