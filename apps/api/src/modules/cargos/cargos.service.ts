import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { CargosQuery, CreateCargoBody, AltasQuery } from './cargos.schema.js'
import { prefijoDeCargo, siguienteCodigoCargo } from '../../shared/codigoCargo.js'

// ─── S3-4 + S3-3: listado paginado con filtros ──────────────────────────────
interface PuestoCargoRow {
  puesto: string
  especialidades: string[]
}

// Filtro puesto + especialidad en cascada de CargosPage (mismo patrón que
// GET /api/v1/puestos para PersonasPage, ver puestos.routes.ts): cada puesto
// trae las especialidades reales (`especialidad_legacy`, no la vieja columna
// `especialidad` que ya no existe — ver migración especialidades_fk) que
// aparecen en cargos con ese puesto, acotado por escalafón y/u hospital.
// `literal_puesto` es texto libre (ver comentario en puestos.routes.ts) y
// puede repetirse con distinto casing/espacios ("Enfermero" / "ENFERMERO"),
// así que se agrupa por LOWER(TRIM(...)) y se muestra un label Title Case.
// El filtro `puesto` de listCargosService (abajo) normaliza igual para
// seguir matcheando cualquiera de esas variantes. `especialidad_legacy`
// tiene el mismo problema de texto libre, así que se dedupea/normaliza
// igual dentro del array_agg.
export async function listPuestosCargosService(escalafonId?: string, hospitalId?: string) {
  return prisma.$queryRaw<PuestoCargoRow[]>(Prisma.sql`
    SELECT
      MIN(INITCAP(TRIM(literal_puesto))) AS puesto,
      array_remove(array_agg(DISTINCT NULLIF(INITCAP(TRIM(especialidad_legacy)), '')), NULL) AS especialidades
    FROM cargos
    WHERE literal_puesto IS NOT NULL
    ${escalafonId ? Prisma.sql`AND escalafon_id = ${escalafonId}::uuid` : Prisma.empty}
    ${hospitalId ? Prisma.sql`AND hospital_id = ${hospitalId}::uuid` : Prisma.empty}
    GROUP BY LOWER(TRIM(literal_puesto))
    ORDER BY puesto ASC
  `)
}

export async function listCargosService(query: CargosQuery) {
  const { page, limit, search, hospitalId, escalafonId, puesto, especialidad, estado, ocupado, soloJefes, personaSearch } = query

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
      WHERE unaccent(c.id_sial) ILIKE unaccent(${like})
         OR unaccent(c.codigo) ILIKE unaccent(${like})
         OR unaccent(c.literal_puesto) ILIKE unaccent(${like})
         OR unaccent(coalesce(c.especialidad_legacy, '')) ILIKE unaccent(${like})
         OR unaccent(coalesce(c.agrupador, '')) ILIKE unaccent(${like})
         OR unaccent(coalesce(c.unificador_puesto, '')) ILIKE unaccent(${like})
         OR similarity(unaccent(lower(coalesce(c.especialidad_legacy, ''))), unaccent(${term})) > 0.4
         OR similarity(unaccent(lower(coalesce(c.literal_puesto, ''))), unaccent(${term})) > 0.4
    `)
    searchIds = rows.map((r) => r.id)
  }

  // Filtro personaSearch: busca por nombre, CUIL o ID SIAL en personas con ocupación vigente O histórica
  // (incluye cargos vacantes donde la persona fue la última ocupante)
  let personaIds: string[] | undefined
  if (personaSearch) {
    const like = `%${personaSearch}%`
    // Normalizar: quitar guiones para buscar CUIL sin formato (27-12345678-9 -> 27123456789)
    const likeNorm = `%${personaSearch.replace(/-/g, '')}%`
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT DISTINCT o.cargo_id AS id
      FROM ocupaciones o
      JOIN personas p ON p.id = o.persona_id
      WHERE (unaccent(p.apellido_nombre) ILIKE unaccent(${like})
          OR p.cuil ILIKE ${likeNorm}
          OR o.id_sial_rol ILIKE ${like}
          OR o.cuil_y_rol  ILIKE ${like})
    `)
    personaIds = rows.map((r) => r.id)
  }

  // Intersectar todos los filtros de id con AND
  const idFilters: Prisma.CargoWhereInput[] = [
    ...(searchIds  !== undefined ? [{ id: { in: searchIds  } }] : []),
    ...(personaIds !== undefined ? [{ id: { in: personaIds } }] : []),
  ]

  const where: Prisma.CargoWhereInput = {
    ...(hospitalId  && { hospitalId }),
    ...(escalafonId && { escalafonId }),
    // literalPuesto es texto libre y puede repetirse con distinto casing
    // (ver comentario de listPuestosCargosService más arriba); el dropdown
    // de CargosPage manda una versión Title Case normalizada, así que acá
    // se compara sin distinguir mayúsculas/minúsculas para seguir
    // matcheando el valor crudo real guardado en cargos.
    ...(puesto      && { literalPuesto: { equals: puesto, mode: 'insensitive' as const } }),
    ...(especialidad && { especialidadLegacy: { equals: especialidad, mode: 'insensitive' as const } }),
    ...(estado      && { estado }),
    // Filtro ocupado: relación nativa de Prisma (EXISTS/NOT EXISTS), no una
    // lista de ids armada a mano — con `ocupado=true` esa lista incluía TODOS
    // los cargos ocupados de toda la base (sin acotar por los demás filtros)
    // y podía superar el máximo de bind variables de Postgres (32767),
    // tirando abajo el listado entero con cualquier combinación de filtros.
    ...(ocupado === true  && { ocupaciones: { some: { hasta: null } } }),
    ...(ocupado === false && { ocupaciones: { none: { hasta: null } } }),
    // Solo jefes: ocupación vigente con codigoJefaturas no vacío/no '0'.
    ...(soloJefes === true && {
      ocupaciones: {
        some: { hasta: null, codigoJefaturas: { not: null, notIn: ['', '0'] } },
      },
    }),
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
          orderBy: { cargoDesdeFecha: 'desc' },
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
      ocupadoDesde: ocupaciones[0]?.cargoDesdeFecha
        ? (ocupaciones[0].cargoDesdeFecha instanceof Date
            ? ocupaciones[0].cargoDesdeFecha.toISOString().slice(0, 10)
            : String(ocupaciones[0].cargoDesdeFecha).slice(0, 10))
        : null,
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
      // S18-1: cargos remplazantes (R/TTR) vigentes generados sobre este
      // cargo — filtrado por estado para que un R viejo (después de un
      // titular-cesa) no deje el panel de cadena mostrándose para siempre
      remplazantes: {
        where: { estado: 'vigente' },
        select: { id: true, codigo: true, literalPuesto: true, tipoOrigen: true, estado: true },
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

// ─── S5-10 + S7-2 + S7-5 + S14-3: Alta de Cargo manual ─────────────────────────────────
export async function createCargoService(body: CreateCargoBody, createdById?: string) {
  const hospital = await prisma.hospital.findUnique({ where: { id: body.hospitalId } })
  if (!hospital) throw AppError.notFound('Hospital no encontrado')

  const escalafon = await prisma.escalafon.findUnique({ where: { id: body.escalafonId } })
  if (!escalafon) throw AppError.notFound('Escalafon no encontrado')

  if (body.codigoRegistroId) {
    const cr = await prisma.codigoRegistro.findUnique({ where: { id: body.codigoRegistroId } })
    if (!cr) throw AppError.notFound('Codigo de registro no encontrado')
  }

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

  const cargos = await prisma.$transaction(async (tx) => {
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

  // S14-3: determinar si el cargo puede iniciar concurso y qué tipo
  // CPH = escalafones con código 22 o 37 (Carrera Profesional Hospitalaria)
  // CEETPS = escalafones con código 83 (ENF), 85 (TEC), 87 (EG-CEETPS)
  const CPH_CODIGOS = new Set(['22', '37'])
  const CEETPS_CODIGOS = new Set(['83', '85', '87'])
  const codigoEscalafon = escalafon.codigo
  let tipoConcursoSugerido: 'cph' | 'ceetps' | null = null
  if (CPH_CODIGOS.has(codigoEscalafon)) tipoConcursoSugerido = 'cph'
  else if (CEETPS_CODIGOS.has(codigoEscalafon)) tipoConcursoSugerido = 'ceetps'

  const primero = cargos[0]!
  const puedeIniciarConcurso = tipoConcursoSugerido !== null

  return {
    cargos,
    puedeIniciarConcurso,
    ...(puedeIniciarConcurso && {
      concursoInfo: {
        cargoId:              primero.id,
        hospitalId:           primero.hospitalId,
        codigo:               primero.codigo,
        literalPuesto:        primero.literalPuesto,
        hospitalSigla:        hospital.sigla,
        tipoConcursoSugerido: tipoConcursoSugerido as 'cph' | 'ceetps',
        escalafonId:          primero.escalafonId,
      },
    }),
  }
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
