import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { CargosQuery } from './cargos.schema.js'

// ─── S3-4 + S3-3: listado paginado con filtros ──────────────────────────────
export async function listCargosService(query: CargosQuery) {
  const { page, limit, search, hospitalId, escalafonId, estado } = query

  // Reportado por Jorge: buscar "medico" no encontraba "Médico" — el
  // `contains`/`mode: insensitive` de Prisma es case-insensitive pero NO
  // saca acentos (ILIKE de Postgres tampoco, sin ayuda). Prisma no permite
  // llamar unaccent() dentro de un `where` tipado, así que se resuelve en
  // dos pasos: una query raw con unaccent() para sacar los ids que
  // matchean, y esos ids alimentan el `where.id.in` de la query tipada de
  // abajo (que sigue trayendo hospital/escalafon con include, sin tener que
  // reescribir eso a mano en SQL).
  //
  // Pedido de Jorge (2026-08-26): CargosPage ya no muestra `idSial` en la
  // tabla, muestra `codigo` (nomenclatura de la app) — se suma `codigo` acá
  // para que buscar por lo que se ve en pantalla siga funcionando. `id_sial`
  // se deja igual, sigue siendo un identificador real que puede aparecer en
  // planillas/expedientes externos.
  let searchIds: string[] | undefined
  if (search) {
    const like = `%${search}%`
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM cargos
      WHERE unaccent(id_sial) ILIKE unaccent(${like})
         OR unaccent(codigo) ILIKE unaccent(${like})
         OR unaccent(literal_puesto) ILIKE unaccent(${like})
         OR unaccent(especialidad) ILIKE unaccent(${like})
         OR unaccent(agrupador) ILIKE unaccent(${like})
    `)
    searchIds = rows.map((r) => r.id)
  }

  const where: Prisma.CargoWhereInput = {
    ...(hospitalId && { hospitalId }),
    ...(escalafonId && { escalafonId }),
    ...(estado && { estado }),
    ...(searchIds && { id: { in: searchIds } }),
  }

  const [total, cargos] = await Promise.all([
    prisma.cargo.count({ where }),
    prisma.cargo.findMany({
      where,
      include: { hospital: true, escalafon: true },
      orderBy: { idSial: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return { data: cargos, meta: { total, page, limit, pages: Math.ceil(total / limit) } }
}

// ─── S3-5: detalle con ocupación actual ─────────────────────────────────────
export async function getCargoByIdService(id: string) {
  const cargo = await prisma.cargo.findUnique({
    where: { id },
    include: {
      hospital: true,
      escalafon: true,
      // Vigente = hasta IS NULL. En teoría hay una sola a la vez por cargo
      // (invariante del flujo de aprobación de padrón), take:1 es solo margen.
      ocupaciones: { where: { hasta: null }, take: 1, include: { persona: true } },
    },
  })
  if (!cargo) throw AppError.notFound('Cargo no encontrado')

  const { ocupaciones, ...rest } = cargo
  return { ...rest, ocupacionActual: ocupaciones[0] ?? null }
}
