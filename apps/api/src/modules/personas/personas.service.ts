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
  puesto: string | null
}

// ─── S3-1 + S3-3: listado paginado con full-text search + filtros ──────────
//
// Se usa $queryRaw (no el query builder de Prisma) porque el criterio de
// éxito del sprint pide full-text search real de Postgres (`to_tsvector` +
// `plainto_tsquery`, apoyado en el índice GIN de S3-11), no un `contains`
// (ILIKE) disfrazado. Filtros de hospital/escalafón/puesto/especialidad
// cruzan por la ocupación VIGENTE de la persona (`hasta IS NULL`) — un
// LEFT JOIN LATERAL en vez del EXISTS que había antes: ahora hace falta
// igual para poder devolver `c.literal_puesto` como columna de la tabla
// (pedido junto con el filtro de puesto), así que se reusa el mismo join
// para filtrar en vez de mantener dos formas distintas de llegar al cargo
// vigente. LATERAL + LIMIT 1 (no un JOIN plano) por las dudas de que algún
// día una persona tenga más de una ocupación vigente a la vez — no debería
// pasar por diseño, pero un JOIN plano duplicaría la fila si pasa.
export async function listPersonasService(query: PersonasQuery) {
  const { page, limit, search, activo, hospitalId, escalafonId, puesto, especialidad } = query
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
