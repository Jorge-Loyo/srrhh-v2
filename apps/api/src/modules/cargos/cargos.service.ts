import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { CargosQuery, CreateCargoBody, AltasQuery } from './cargos.schema.js'
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
    const term = search.toLowerCase()
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT c.id FROM cargos c
      LEFT JOIN especialidades e ON e.id = c.especialidad_id
      WHERE unaccent(c.id_sial) ILIKE unaccent(${like})
         OR unaccent(c.codigo) ILIKE unaccent(${like})
         OR unaccent(c.literal_puesto) ILIKE unaccent(${like})
         OR unaccent(coalesce(c.especialidad_legacy, '')) ILIKE unaccent(${like})
         OR unaccent(coalesce(e.nombre, '')) ILIKE unaccent(${like})
         OR unaccent(coalesce(c.agrupador, '')) ILIKE unaccent(${like})
         OR unaccent(coalesce(c.unificador_puesto, '')) ILIKE unaccent(${like})
         OR similarity(unaccent(lower(coalesce(c.especialidad_legacy, ''))), unaccent(${term})) > 0.4
         OR similarity(unaccent(lower(coalesce(e.nombre, ''))), unaccent(${term})) > 0.4
         OR similarity(unaccent(lower(coalesce(c.literal_puesto, ''))), unaccent(${term})) > 0.4
    `)
    searchIds = rows.map((r) => r.id)
  }

  // Filtro ocupado: subquery EXISTS sobre ocupaciones con hasta IS NULL
  let ocupadoIds: string[] | undefined
  if (ocupado !== undefined) {
    const escFilter = escalafonId ? Prisma.sql`AND c.escalafon_id = ${escalafonId}::uuid` : Prisma.sql``
    const puestoFilter = puesto ? Prisma.sql`AND c.literal_puesto = ${puesto}` : Prisma.sql``
    const rows = await prisma.$queryRaw<{ id: string }[]>(
      ocupado
        ? Prisma.sql`SELECT DISTINCT o.cargo_id AS id FROM ocupaciones o JOIN cargos c ON c.id = o.cargo_id WHERE o.hasta IS NULL ${escFilter} ${puestoFilter}`
        : Prisma.sql`SELECT c.id FROM cargos c WHERE NOT EXISTS (SELECT 1 FROM ocupaciones o WHERE o.cargo_id = c.id AND o.hasta IS NULL) ${escFilter} ${puestoFilter}`
    )
    ocupadoIds = rows.map((r) => r.id)
  }

  // Filtro personaSearch: busca por nombre, CUIL o ID SIAL en personas con ocupación vigente
  let personaIds: string[] | undefined
  if (personaSearch) {
    const like = `%${personaSearch}%`
    // Normalizar: quitar guiones para buscar CUIL sin formato (27-12345678-9 -> 27123456789)
    const likeNorm = `%${personaSearch.replace(/-/g, '')}%`
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT DISTINCT o.cargo_id AS id
      FROM ocupaciones o
      JOIN personas p ON p.id = o.persona_id
      WHERE o.hasta IS NULL
        AND (unaccent(p.apellido_nombre) ILIKE unaccent(${like})
          OR p.cuil ILIKE ${likeNorm}
          OR o.id_sial_rol ILIKE ${like}
          OR o.cuil_y_rol  ILIKE ${like})
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
    ...(idFilters.length === 1 && { id: idFilters[0]!.id }),
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
      personaOcupante: ocupaciones[0]?.persona
        ? { ...ocupaciones[0].persona, idSialRol: ocupaciones[0].idSialRol }
        : null,
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

  // S8C-1: concursos asociados al cargo
  const [concursosCph, concursosCeetps] = await Promise.all([
    prisma.concursoCph.findMany({
      where: { cargoId: id },
      include: { concurso: true, personaDesignada: { select: { id: true, apellidoNombre: true, cuil: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.concursoCeetps.findMany({
      where: { cargoId: id },
      include: { concurso: true, escalafon: true, personaDesignada: { select: { id: true, apellidoNombre: true, cuil: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return { ...rest, ocupacionActual, historial, cargoActivo, concursosCph, concursosCeetps }
}

// ─── S5-10 + S7-2 + S7-5: Alta de Cargo manual ─────────────────────────────────
export async function createCargoService(body: CreateCargoBody, createdById?: string) {
  const hospital = await prisma.hospital.findUnique({ where: { id: body.hospitalId } })
  if (!hospital) throw AppError.notFound('Hospital no encontrado')

  const escalafon = await prisma.escalafon.findUnique({ where: { id: body.escalafonId } })
  if (!escalafon) throw AppError.notFound('Escalafon no encontrado')

  if (body.codigoRegistroId) {
    const cr = await prisma.codigoRegistro.findUnique({ where: { id: body.codigoRegistroId } })
    if (!cr) throw AppError.notFound('Codigo de registro no encontrado')
  }

  // S7-5: advertencia de duplicado estructural (409 + override)
  // El cliente puede forzar la creación mandando `forzar: true` en el body.
  if (!body.forzar) {
    const duplicado = await prisma.cargo.findFirst({
      where: {
        hospitalId:   body.hospitalId,
        escalafonId:  body.escalafonId,
        literalPuesto: body.literalPuesto,
        estado: 'vigente',
      },
      include: { hospital: { select: { sigla: true } }, escalafon: { select: { nombre: true } } },
    })
    if (duplicado) {
      throw AppError.conflict('Ya existe un cargo vigente con la misma estructura', {
        codigo:       duplicado.codigo,
        literalPuesto: duplicado.literalPuesto,
        hospital:     duplicado.hospital.sigla,
        escalafon:    duplicado.escalafon.nombre,
        id:           duplicado.id,
      })
    }
  }

  const prefijo = prefijoDeCargo({
    escalafon: escalafon.nombre,
    unificadorPuesto: body.unificadorPuesto ?? null,
    agrupador: body.agrupador ?? null,
  })

  return prisma.$transaction(async (tx) => {
    const creados = []
    for (let i = 0; i < body.cantidad; i++) {
      const codigo = await siguienteCodigoCargo(prefijo, tx)
      const idSial = `MANUAL-${codigo}`

      const cargo = await tx.cargo.create({
        data: {
          idSial,
          codigo,
          hospitalId:       body.hospitalId,
          escalafonId:      body.escalafonId,
          codigoRegistroId: body.codigoRegistroId ?? null,
          literalPuesto:    body.literalPuesto,
          especialidadLegacy: body.especialidad ?? null,
          agrupador:        body.agrupador ?? null,
          unificadorPuesto: body.unificadorPuesto ?? null,
          regimen:          body.regimen ?? null,
          // S7-2: persistir acto administrativo y trazabilidad
          expediente:       body.expediente ?? null,
          fechaDesde:       body.desde ? new Date(body.desde) : null,
          createdById:      createdById ?? null,
          estado: 'vigente',
        },
        include: { hospital: true, escalafon: true },
      })
      creados.push(cargo)
    }
    return creados
  })
}

// ─── S7-4: Historial persistente de altas manuales ───────────────────────────
export async function listAltasService(query: AltasQuery) {
  const { page, limit, expediente, desde, hasta } = query

  const where: Prisma.CargoWhereInput = {
    idSial: { startsWith: 'MANUAL-' },
    ...(expediente && { expediente: { contains: expediente, mode: 'insensitive' } }),
    ...(desde && { createdAt: { gte: new Date(desde) } }),
    ...(hasta && { createdAt: { lte: new Date(hasta + 'T23:59:59') } }),
  }

  const [total, cargos] = await Promise.all([
    prisma.cargo.count({ where }),
    prisma.cargo.findMany({
      where,
      include: {
        hospital:  { select: { sigla: true, nombre: true } },
        escalafon: { select: { nombre: true } },
        createdBy: { select: { username: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return {
    data: cargos,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  }
}
