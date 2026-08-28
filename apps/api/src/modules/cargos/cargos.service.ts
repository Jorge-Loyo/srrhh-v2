import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { CargosQuery, CreateCargoBody } from './cargos.schema.js'
import { prefijoDeCargo, siguienteCodigoCargo } from '../../shared/codigoCargo.js'

// ─── S3-4 + S3-3: listado paginado con filtros ──────────────────────────────
export async function listPuestosCargosService(escalafonId?: string, hospitalId?: string) {
  const rows = await prisma.cargo.findMany({
    where: {
      literalPuesto: { not: null },
      ...(escalafonId && { escalafonId }),
      ...(hospitalId && { hospitalId }),
    },
    select: { literalPuesto: true },
    distinct: ['literalPuesto'],
    orderBy: { literalPuesto: 'asc' },
  })
  return rows.map((r) => r.literalPuesto as string)
}

export async function listCargosService(query: CargosQuery) {
  const { page, limit, search, hospitalId, escalafonId, puesto, estado, ocupado, personaSearch } = query

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

  // Filtro personaSearch: busca por nombre o CUIL en personas con ocupación vigente
  let personaIds: string[] | undefined
  if (personaSearch) {
    const like = `%${personaSearch}%`
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT DISTINCT o.cargo_id AS id
      FROM ocupaciones o
      JOIN personas p ON p.id = o.persona_id
      WHERE o.hasta IS NULL
        AND (unaccent(p.apellido_nombre) ILIKE unaccent(${like})
          OR p.cuil ILIKE ${like})
    `)
    personaIds = rows.map((r) => r.id)
  }

  // Intersectar todos los filtros de id con AND
  const idFilters: Prisma.CargoWhereInput[] = [
    ...(searchIds  !== undefined ? [{ id: { in: searchIds  } }] : []),
    ...(ocupadoIds !== undefined ? [{ id: { in: ocupadoIds } }] : []),
    ...(personaIds !== undefined ? [{ id: { in: personaIds } }] : []),
  ]

  const where: Prisma.CargoWhereInput = {
    ...(hospitalId  && { hospitalId }),
    ...(escalafonId && { escalafonId }),
    ...(puesto      && { literalPuesto: puesto }),
    ...(estado      && { estado }),
    ...(idFilters.length === 1 && { id: idFilters[0].id }),
    ...(idFilters.length  > 1 && { AND: idFilters }),
  }

  const [total, cargos] = await Promise.all([
    prisma.cargo.count({ where }),
    prisma.cargo.findMany({
      where,
      include: {
        hospital: true,
        escalafon: true,
        ocupaciones: {
          where: { hasta: null },
          include: { persona: { select: { id: true, apellidoNombre: true, cuil: true } } },
          take: 1,
        },
      },
      orderBy: { idSial: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return {
    data: cargos.map(({ ocupaciones, ...c }) => ({
      ...c,
      ocupado: ocupaciones.length > 0,
      personaOcupante: ocupaciones[0]?.persona ?? null,
    })),
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

  // Si la persona retiene el cargo, buscar dónde está activa actualmente
  let cargoActivo: Awaited<ReturnType<typeof prisma.ocupacion.findFirst>> | null = null
  if (ocupacionActual?.situacionRevista === 'Retencion de Cargo') {
    cargoActivo = await prisma.ocupacion.findFirst({
      where: {
        personaId: ocupacionActual.personaId,
        cargoId: { not: id },
        hasta: null,
        situacionRevista: 'Activo',
      },
      include: {
        cargo: {
          include: { hospital: true, escalafon: true },
        },
      },
    })
  }

  return { ...rest, ocupacionActual, historial, cargoActivo }
}

// ─── S5-10: Alta de Cargo manual ─────────────────────────────────────────────
export async function createCargoService(body: CreateCargoBody) {
  const hospital = await prisma.hospital.findUnique({ where: { id: body.hospitalId } })
  if (!hospital) throw AppError.notFound('Hospital no encontrado')

  const escalafon = await prisma.escalafon.findUnique({ where: { id: body.escalafonId } })
  if (!escalafon) throw AppError.notFound('Escalafon no encontrado')

  if (body.codigoRegistroId) {
    const cr = await prisma.codigoRegistro.findUnique({ where: { id: body.codigoRegistroId } })
    if (!cr) throw AppError.notFound('Codigo de registro no encontrado')
  }

  const prefijo = prefijoDeCargo({
    escalafon: escalafon.nombre,
    unificadorPuesto: body.unificadorPuesto ?? null,
    agrupador: body.agrupador ?? null,
  })

  // Crear `cantidad` cargos en una sola transacción. El secuencial se
  // incrementa dentro del loop — siguienteCodigoCargo lee el MAX en cada
  // llamada, así que el segundo cargo ve el primero ya insertado y toma el
  // siguiente número correctamente.
  return prisma.$transaction(async (tx) => {
    const creados = []
    for (let i = 0; i < body.cantidad; i++) {
      const codigo = await siguienteCodigoCargo(prefijo, tx)
      // idSial sintético para cargos manuales: prefijo del código + timestamp
      // + índice para garantizar unicidad incluso en lotes.
      const idSial = `MANUAL-${codigo}`

      const cargo = await tx.cargo.create({
        data: {
          idSial,
          codigo,
          hospitalId: body.hospitalId,
          escalafonId: body.escalafonId,
          codigoRegistroId: body.codigoRegistroId ?? null,
          literalPuesto: body.literalPuesto,
          especialidad: body.especialidad ?? null,
          agrupador: body.agrupador ?? null,
          unificadorPuesto: body.unificadorPuesto ?? null,
          regimen: body.regimen ?? null,
          estado: 'vigente',
        },
        include: { hospital: true, escalafon: true },
      })
      creados.push(cargo)
    }
    return creados
  })
}
