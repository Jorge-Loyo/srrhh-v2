import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { CargosQuery } from './cargos.schema.js'

// ─── S3-4 + S3-3: listado paginado con filtros ──────────────────────────────
export async function listCargosService(query: CargosQuery) {
  const { page, limit, search, hospitalId, escalafonId, estado, ocupado } = query

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

  // Filtro ocupado: subquery EXISTS sobre ocupaciones con hasta IS NULL
  let ocupadoIds: string[] | undefined
  if (ocupado !== undefined) {
    const rows = await prisma.$queryRaw<{ id: string }[]>(
      ocupado
        ? Prisma.sql`SELECT DISTINCT cargo_id AS id FROM ocupaciones WHERE hasta IS NULL`
        : Prisma.sql`SELECT id FROM cargos WHERE NOT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = cargos.id AND o.hasta IS NULL)`
    )
    ocupadoIds = rows.map((r) => r.id)
  }

  const where: Prisma.CargoWhereInput = {
    ...(hospitalId && { hospitalId }),
    ...(escalafonId && { escalafonId }),
    ...(estado && { estado }),
    ...(searchIds !== undefined && { id: { in: searchIds } }),
    ...(ocupadoIds !== undefined && { id: { in: ocupadoIds } }),
  }

  const [total, cargos] = await Promise.all([
    prisma.cargo.count({ where }),
    prisma.cargo.findMany({
      where,
      include: {
        hospital: true,
        escalafon: true,
        ocupaciones: { where: { hasta: null }, select: { id: true }, take: 1 },
      },
      orderBy: { idSial: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return {
    data: cargos.map(({ ocupaciones, ...c }) => ({ ...c, ocupado: ocupaciones.length > 0 })),
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  }
}

// ─── S3-5: detalle con ocupación actual e historial ────────────────────────
export async function getCargoByIdService(id: string) {
  const cargo = await prisma.cargo.findUnique({
    where: { id },
    include: {
      hospital: true,
      escalafon: true,
      codigoRegistro: true,
      ocupaciones: {
        include: { persona: true },
        orderBy: { hasta: 'desc' }, // vigente (null) primero, luego más reciente
      },
    },
  })
  if (!cargo) throw AppError.notFound('Cargo no encontrado')

  const { ocupaciones, ...rest } = cargo
  const ocupacionActual = ocupaciones.find((o) => o.hasta === null) ?? null
  const historial = ocupaciones.filter((o) => o.hasta !== null)
  return { ...rest, ocupacionActual, historial }
}
