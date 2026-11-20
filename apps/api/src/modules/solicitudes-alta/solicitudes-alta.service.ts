import { TX_OPTS_LARGA } from '../../shared/txOpts.js'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { resolverCrPorCarrera, elegirCrPorCarrera, codigoCrDeEscalafon } from '../../shared/crPorCarrera.js'
import { crearAutorizacion } from '../autorizaciones/autorizaciones.service.js'
import { violaReglaEnfermeria, MENSAJE_REGLA_ENFERMERIA } from '../../shared/especialidadesEnfermeria.js'
import type {
  CreateSolicitudAltaBody,
  CreateSolicitudesAltaBatchBody,
  SolicitudesAltaQuery,
} from './solicitudes-alta.schema.js'

// Timeout holgado para transacciones de creación de solicitudes de alta.
//
// El default de Prisma para transacciones interactivas es 5000 ms. Contra Neon
// (Postgres remoto, cada query es un round-trip de red) el flujo de alta hace
// varios round-trips (create solicitud + etiqueta opcional + crearAutorizacion
// -que a su vez crea la autorización- + readback), y con N requests compitiendo
// por el pool alguna se pasaba del límite (P2028: "5169 ms passed, timeout 5000").
//
// Para el batch, UNA transacción crea los N items secuencialmente, así que el
// trabajo crece con N: usa las opciones compartidas TX_OPTS_LARGA (shared/txOpts.ts),
// las mismas que la aprobación de altas (timeout 90 s, maxWait 15 s).
const SOLICITUDES_ALTA_TX_OPTS = TX_OPTS_LARGA

const include = {
  hospital:       { select: { id: true, sigla: true, nombre: true } },
  escalafon:      { select: { id: true, nombre: true } },
  codigoRegistro: { select: { id: true, literal: true } },
  solicitadoPor:  { select: { id: true, username: true, email: true } },
  // S16-8: baja origen vinculada
  bajaOrigen:     { select: { id: true, fechaBaja: true, motivo: true, cargo: { select: { codigo: true, literalPuesto: true } } } },
  // S21: etiquetas asignadas (mismo catálogo que Concursos CPH).
  etiquetas:      { include: { etiqueta: true } },
} as const

// --- POST / --- crear solicitud + autorizacion pendiente --------------------
export async function createSolicitudAltaService(
  body: CreateSolicitudAltaBody,
  solicitadoPorId: string,
) {
  const hospital = await prisma.hospital.findUnique({ where: { id: body.hospitalId } })
  if (!hospital) throw AppError.notFound('Hospital no encontrado')

  const escalafon = await prisma.escalafon.findUnique({ where: { id: body.escalafonId } })
  if (!escalafon) throw AppError.notFound('Escalafon no encontrado')

  if (body.codigoRegistroId) {
    const cr = await prisma.codigoRegistro.findUnique({ where: { id: body.codigoRegistroId } })
    if (!cr) throw AppError.notFound('Codigo de registro no encontrado')
  }

  const puestoCargo = await prisma.puestoCargo.findUnique({ where: { id: body.puestoCargoId } })
  if (!puestoCargo || puestoCargo.escalafonId !== body.escalafonId) {
    throw AppError.notFound('Puesto no encontrado en el catálogo para ese escalafón')
  }
  let especialidadPuesto: { id: string; nombre: string; puestoCargId: string } | null = null
  if (body.especialidadPuestoId) {
    especialidadPuesto = await prisma.especialidadPuesto.findUnique({ where: { id: body.especialidadPuestoId } })
    if (!especialidadPuesto || especialidadPuesto.puestoCargId !== body.puestoCargoId) {
      throw AppError.notFound('Especialidad no encontrada en el catálogo para ese puesto')
    }
    if (violaReglaEnfermeria(puestoCargo.nombre, especialidadPuesto.nombre)) {
      throw AppError.badRequest(MENSAJE_REGLA_ENFERMERIA)
    }
  }

  // CR explícito tiene prioridad; si viene vacío se deduce de la carrera elegida
  // (null si la carrera no mapea a CPH/CEETPS => sin concurso, como hasta ahora).
  const codigoRegistroId =
    body.codigoRegistroId ?? (await resolverCrPorCarrera(prisma, body.escalafonId, puestoCargo.nombre))?.id ?? null

  return prisma.$transaction(async (tx) => {
    const solicitud = await tx.solicitudAlta.create({
      data: {
        hospitalId:       body.hospitalId,
        escalafonId:      body.escalafonId,
        codigoRegistroId,
        puestoCargoId:      body.puestoCargoId,
        especialidadPuestoId: body.especialidadPuestoId ?? null,
        // Snapshot de auditoría — nombre canónico del catálogo al momento de la solicitud.
        literalPuesto:    puestoCargo.nombre,
        especialidad:     especialidadPuesto?.nombre ?? null,
        regimen:          body.regimen ?? null,
        expediente:       body.expediente ?? null,
        desde:            body.desde ? new Date(body.desde) : null,
        cantidad:         body.cantidad,
        bajaOrigenId:     body.bajaOrigenId ?? null,
        esTransferencia:  body.esTransferencia ?? false,
        observaciones:    body.observaciones ?? null,
        solicitadoPorId,
      },
      include,
    })

    // S21: etiqueta (opcional) — mismo catálogo reutilizable que Concursos CPH.
    // Se crea si no existe (por nombre, único) y se vincula a la solicitud vía
    // la relación N:M EtiquetaSolicitudAlta. Reemplaza el viejo campo string
    // libre `etiqueta` que el service ignoraba.
    if (body.etiqueta?.trim()) {
      const nombre = body.etiqueta.trim()
      const etiqueta =
        (await tx.etiqueta.findUnique({ where: { nombre } })) ??
        (await tx.etiqueta.create({ data: { nombre } }))
      await tx.etiquetaSolicitudAlta.create({
        data: { etiquetaId: etiqueta.id, solicitudAltaId: solicitud.id },
      })
    }

    // Transferencias se aprueban directamente — no requieren autorización
    if (!body.esTransferencia) {
      await crearAutorizacion(tx as typeof prisma, {
        tipo:               'alta_cargo',
        referenciaId:       solicitud.id,
        referenciaTipo:     'solicitud_alta',
        solicitadoPorId,
        resolverPorRolSlug: 'director',
      })
    } else {
      await tx.solicitudAlta.update({
        where: { id: solicitud.id },
        data: { estado: 'aprobada' },
      })
    }

    return tx.solicitudAlta.findUnique({ where: { id: solicitud.id }, include })
  }, SOLICITUDES_ALTA_TX_OPTS)
}

// --- POST /batch --- crear N solicitudes + N autorizaciones en UNA tx --------
// Los "Cargos pendientes" de la pestaña "Nueva alta" son un LOTE que se envía a
// concursar junto (comparten el expediente del bloque). En vez de N requests
// —cada una con su propia transacción, compitiendo por el pool y pasándose del
// timeout de 5 s contra Neon— se reciben todos los items en UNA request y se
// crean en UNA sola transacción con timeout holgado.
//
// Validación: se resuelven en batch (findMany de ids únicos) ANTES de abrir la
// transacción, igual que el service individual valida fuera de la tx. Si algún
// item referencia un catálogo inexistente/incoherente, se lanza y NO se abre la
// tx → el lote no se crea a medias (atómico).
export async function createSolicitudesAltaBatchService(
  body: CreateSolicitudesAltaBatchBody,
  solicitadoPorId: string,
) {
  const { items } = body

  // ── Validación en batch (fuera de la tx) ──────────────────────────────────
  // Se piden los ids únicos de cada catálogo de una vez (findMany) para no hacer
  // N*K round-trips. Luego se valida cada item contra los mapas cargados.
  const hospitalIds       = [...new Set(items.map((i) => i.hospitalId))]
  const escalafonIds      = [...new Set(items.map((i) => i.escalafonId))]
  const puestoCargoIds    = [...new Set(items.map((i) => i.puestoCargoId))]
  const codigoRegistroIds = [...new Set(items.map((i) => i.codigoRegistroId).filter((v): v is string => !!v))]
  const especialidadIds   = [...new Set(items.map((i) => i.especialidadPuestoId).filter((v): v is string => !!v))]

  const [hospitales, escalafones, puestos, codigosRegistro, especialidades, crsDeCarreras] = await Promise.all([
    prisma.hospital.findMany({ where: { id: { in: hospitalIds } }, select: { id: true } }),
    prisma.escalafon.findMany({ where: { id: { in: escalafonIds } }, select: { id: true, codigo: true } }),
    prisma.puestoCargo.findMany({ where: { id: { in: puestoCargoIds } }, select: { id: true, nombre: true, escalafonId: true } }),
    codigoRegistroIds.length
      ? prisma.codigoRegistro.findMany({ where: { id: { in: codigoRegistroIds } }, select: { id: true } })
      : Promise.resolve([] as { id: string }[]),
    especialidadIds.length
      ? prisma.especialidadPuesto.findMany({ where: { id: { in: especialidadIds } }, select: { id: true, nombre: true, puestoCargId: true } })
      : Promise.resolve([] as { id: string; nombre: string; puestoCargId: string }[]),
    // CR de cada carrera (una sola consulta) para deducir el tipo de los items sin CR explícito.
    prisma.codigoRegistro.findMany({
      where: { escalafonId: { in: escalafonIds } },
      select: { id: true, codigo: true, escalafonId: true },
    }),
  ])

  // Fallback por código de escalafón: carreras gestionadas sin CR cargado o sin ninguno clasificable (ej. ENF/TEC del seed)
  // usan el CR de su código (85/87/...). Una consulta extra solo si hace falta.
  const escalafonesSinCr = (escalafones as { id: string; codigo?: string }[]).filter(
    (e) => !!codigoCrDeEscalafon(e.codigo),
  )
  const crFallbackPorEscalafon = new Map<string, { id: string; codigo: string }>()
  if (escalafonesSinCr.length) {
    const codigos = [...new Set(escalafonesSinCr.map((e) => codigoCrDeEscalafon(e.codigo)!))]
    const crs = await prisma.codigoRegistro.findMany({ where: { codigo: { in: codigos } }, select: { id: true, codigo: true } })
    for (const e of escalafonesSinCr) {
      const cr = crs.find((c) => c.codigo === codigoCrDeEscalafon(e.codigo))
      if (cr) crFallbackPorEscalafon.set(e.id, cr)
    }
  }

  const hospitalSet   = new Set(hospitales.map((h) => h.id))
  const escalafonSet  = new Set(escalafones.map((e) => e.id))
  const crSet         = new Set(codigosRegistro.map((c) => c.id))
  const puestoMap     = new Map(puestos.map((p) => [p.id, p]))
  const especialidadMap = new Map(especialidades.map((e) => [e.id, e]))

  // Snapshot (literalPuesto/especialidad) resuelto por item, igual que el individual.
  const preparados = items.map((item, idx) => {
    if (!hospitalSet.has(item.hospitalId))   throw AppError.notFound(`Hospital no encontrado (item ${idx + 1})`)
    if (!escalafonSet.has(item.escalafonId)) throw AppError.notFound(`Escalafon no encontrado (item ${idx + 1})`)
    if (item.codigoRegistroId && !crSet.has(item.codigoRegistroId)) {
      throw AppError.notFound(`Codigo de registro no encontrado (item ${idx + 1})`)
    }
    const puesto = puestoMap.get(item.puestoCargoId)
    if (!puesto || puesto.escalafonId !== item.escalafonId) {
      throw AppError.notFound(`Puesto no encontrado en el catálogo para ese escalafón (item ${idx + 1})`)
    }
    let especialidad: { id: string; nombre: string; puestoCargId: string } | undefined
    if (item.especialidadPuestoId) {
      especialidad = especialidadMap.get(item.especialidadPuestoId)
      if (!especialidad || especialidad.puestoCargId !== item.puestoCargoId) {
        throw AppError.notFound(`Especialidad no encontrada en el catálogo para ese puesto (item ${idx + 1})`)
      }
      if (violaReglaEnfermeria(puesto.nombre, especialidad.nombre)) {
        throw AppError.badRequest(`${MENSAJE_REGLA_ENFERMERIA} (item ${idx + 1})`)
      }
    }
    // CR explícito tiene prioridad; si no, se deduce por item de su carrera (un lote puede mezclar carreras).
    const codigoRegistroId =
      item.codigoRegistroId ??
      elegirCrPorCarrera(
        (crsDeCarreras ?? []).filter((c) => c.escalafonId === item.escalafonId),
        puesto.nombre,
        crFallbackPorEscalafon.get(item.escalafonId),
      )?.id ??
      null
    return { item, literalPuesto: puesto.nombre, especialidadNombre: especialidad?.nombre ?? null, codigoRegistroId }
  })

  // ── UNA transacción: crea las N solicitudes + N autorizaciones ─────────────
  return prisma.$transaction(async (tx) => {
    const creadas: unknown[] = []

    for (const { item, literalPuesto, especialidadNombre, codigoRegistroId } of preparados) {
      const solicitud = await tx.solicitudAlta.create({
        data: {
          hospitalId:       item.hospitalId,
          escalafonId:      item.escalafonId,
          codigoRegistroId,
          puestoCargoId:      item.puestoCargoId,
          especialidadPuestoId: item.especialidadPuestoId ?? null,
          literalPuesto,
          especialidad:     especialidadNombre,
          regimen:          item.regimen ?? null,
          expediente:       item.expediente ?? null,
          desde:            item.desde ? new Date(item.desde) : null,
          cantidad:         item.cantidad,
          bajaOrigenId:     item.bajaOrigenId ?? null,
          esTransferencia:  item.esTransferencia ?? false,
          observaciones:    item.observaciones ?? null,
          solicitadoPorId,
        },
        include,
      })

      if (item.etiqueta?.trim()) {
        const nombre = item.etiqueta.trim()
        const etiqueta =
          (await tx.etiqueta.findUnique({ where: { nombre } })) ??
          (await tx.etiqueta.create({ data: { nombre } }))
        await tx.etiquetaSolicitudAlta.create({
          data: { etiquetaId: etiqueta.id, solicitudAltaId: solicitud.id },
        })
      }

      // Transferencias se aprueban directamente — no requieren autorización
      if (!item.esTransferencia) {
        await crearAutorizacion(tx as typeof prisma, {
          tipo:               'alta_cargo',
          referenciaId:       solicitud.id,
          referenciaTipo:     'solicitud_alta',
          solicitadoPorId,
          resolverPorRolSlug: 'director',
        })
      } else {
        await tx.solicitudAlta.update({
          where: { id: solicitud.id },
          data: { estado: 'aprobada' },
        })
      }

      creadas.push(await tx.solicitudAlta.findUnique({ where: { id: solicitud.id }, include }))
    }

    return creadas
  }, SOLICITUDES_ALTA_TX_OPTS)
}

// --- Cargos creados por solicitud -------------------------------------------
// Ampliación retrocompatible de GET / y GET /:id: cada solicitud suma
// `cargosCreados` (datos de los Cargo creados al aprobar, uno por unidad de
// `cantidad`). Se resuelve con UNA sola consulta para todos los ids de la página
// (sin N+1; cada round-trip a Neon cuesta). Los campos existentes no cambian.
const cargoCreadoSelect = {
  id:                 true,
  codigo:             true,
  idSial:             true,
  fechaDesde:         true,
  literalPuesto:      true,
  especialidadLegacy: true,
  hospital:           { select: { id: true, sigla: true } },
  escalafon:          { select: { codigo: true, nombre: true } },
  puestoCargo:        { select: { nombre: true } },
  especialidadPuesto: { select: { nombre: true } },
  codigoRegistro:     { select: { codigo: true } },
  // Concurso más reciente del cargo (en cargos nuevos es el del alta).
  concursos: {
    select: {
      tipoConcurso:   true,
      concursoCph:    { select: { id: true } },
      concursoCeetps: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
} as const

export interface CargoCreadoResumen {
  id: string
  codigo: string | null
  idSial: string | null
  fechaDesde: Date | null
  hospital: { id: string; sigla: string } | null
  carreraCodigo: string | null
  carrera: string | null
  puesto: string | null
  especialidad: string | null
  codigoRegistro: string | null
  concurso: { tipo: 'cph' | 'ceetps'; detalleId: string | null } | null
}

export async function adjuntarCargosCreados<T extends { cargosCreadosIds: string[] }>(
  solicitudes: T[],
): Promise<(T & { cargosCreados: CargoCreadoResumen[] })[]> {
  const ids = [...new Set(solicitudes.flatMap((s) => s.cargosCreadosIds ?? []))]
  const cargos = ids.length
    ? await prisma.cargo.findMany({ where: { id: { in: ids } }, select: cargoCreadoSelect })
    : []
  const porId = new Map<string, CargoCreadoResumen>()
  for (const c of cargos) {
    const co = c.concursos[0]
    porId.set(c.id, {
      id:             c.id,
      codigo:         c.codigo,
      idSial:         c.idSial,
      fechaDesde:     c.fechaDesde,
      hospital:       c.hospital,
      carreraCodigo:  c.escalafon?.codigo ?? null,
      carrera:        c.escalafon?.nombre ?? null,
      puesto:         c.puestoCargo?.nombre ?? c.literalPuesto ?? null,
      especialidad:   c.especialidadPuesto?.nombre ?? c.especialidadLegacy ?? null,
      codigoRegistro: c.codigoRegistro?.codigo ?? null,
      concurso: co
        ? { tipo: co.tipoConcurso, detalleId: co.concursoCph?.id ?? co.concursoCeetps?.id ?? null }
        : null,
    })
  }
  return solicitudes.map((s) => ({
    ...s,
    // Respeta el orden de cargosCreadosIds; un id inexistente se omite.
    cargosCreados: (s.cargosCreadosIds ?? []).flatMap((id) => {
      const c = porId.get(id)
      return c ? [c] : []
    }),
  }))
}

// --- PATCH /:id/validar --- aprobar directamente con doc respaldatorio ------
// El operador carga el número de documento respaldatorio y la solicitud se
// aprueba en el acto (sin pasar por el flujo de autorizaciones del director).
// Busca la autorización alta_cargo pendiente de la solicitud y la aprueba.
export async function validarSolicitudAltaService(
  id: string,
  docRespaldatoria: string,
  resueltoPorId: string,
) {
  const solicitud = await prisma.solicitudAlta.findUnique({ where: { id } })
  if (!solicitud) throw AppError.notFound('Solicitud de alta no encontrada')
  if (solicitud.estado !== 'pendiente') throw AppError.badRequest('La solicitud ya fue resuelta')

  const autorizacion = await prisma.autorizacion.findFirst({
    where: { referenciaId: id, tipo: 'alta_cargo', estado: 'pendiente' },
  })
  if (!autorizacion) throw AppError.notFound('No hay autorización pendiente para esta solicitud')

  // Reutiliza el mismo service de autorizaciones — crea cargos, concursos y notifica
  const { aprobarAutorizacionService } = await import('../autorizaciones/autorizaciones.service.js')
  return aprobarAutorizacionService(
    autorizacion.id,
    resueltoPorId,
    'admin', // bypass de rol: el operador que valida tiene permiso explícito
    `Doc. respaldatorio: ${docRespaldatoria}`,
  )
}

// --- GET / --- listado paginado ---------------------------------------------
export async function listSolicitudesAltaService(query: SolicitudesAltaQuery) {
  const { page, limit, hospitalId, estado, esTransferencia } = query
  const offset = (page - 1) * limit

  const where = {
    ...(hospitalId       && { hospitalId }),
    ...(estado           && { estado }),
    ...(esTransferencia !== undefined && { esTransferencia }),
  }

  const [total, filas] = await Promise.all([
    prisma.solicitudAlta.count({ where }),
    prisma.solicitudAlta.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
      skip:    offset,
      take:    limit,
    }),
  ])
  const data = await adjuntarCargosCreados(filas)

  return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } }
}

// --- GET /:id --- detalle ---------------------------------------------------
export async function getSolicitudAltaService(id: string) {
  const solicitud = await prisma.solicitudAlta.findUnique({ where: { id }, include })
  if (!solicitud) throw AppError.notFound('Solicitud de alta no encontrada')
  const [conCargos] = await adjuntarCargosCreados([solicitud])
  return conCargos!
}
