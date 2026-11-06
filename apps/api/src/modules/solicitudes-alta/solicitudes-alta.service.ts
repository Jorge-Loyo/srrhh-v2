import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { crearAutorizacion } from '../autorizaciones/autorizaciones.service.js'
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
// trabajo crece con N. 30 s con maxWait de 10 s cubre con holgura un lote de
// ~11 items (y bastante más) sin acercarse al límite; es el mismo criterio que
// padron.service.ts (TRANSACTION_OPTS) y bajas.service.ts (timeout: 20000), que
// ya subieron el default por la misma latencia de Neon. No se usa el timeout de
// 10 min de padron porque ese cubre cargas masivas de padrón; un lote de altas
// manuales es mucho más chico.
const SOLICITUDES_ALTA_TX_OPTS = { timeout: 30_000, maxWait: 10_000 } as const

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
  }

  return prisma.$transaction(async (tx) => {
    const solicitud = await tx.solicitudAlta.create({
      data: {
        hospitalId:       body.hospitalId,
        escalafonId:      body.escalafonId,
        codigoRegistroId: body.codigoRegistroId ?? null,
        puestoCargoId:      body.puestoCargoId,
        especialidadPuestoId: body.especialidadPuestoId ?? null,
        // Snapshot de auditoría — nombre canónico del catálogo al momento de la solicitud.
        literalPuesto:    puestoCargo.nombre,
        especialidad:     especialidadPuesto?.nombre ?? null,
        agrupador:        body.agrupador ?? null,
        unificadorPuesto: body.unificadorPuesto ?? null,
        regimen:          body.regimen ?? null,
        expediente:       body.expediente ?? null,
        desde:            body.desde ? new Date(body.desde) : null,
        cantidad:         body.cantidad,
        bajaOrigenId:     body.bajaOrigenId ?? null,
        esTransferencia:  body.esTransferencia ?? false,
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

  const [hospitales, escalafones, puestos, codigosRegistro, especialidades] = await Promise.all([
    prisma.hospital.findMany({ where: { id: { in: hospitalIds } }, select: { id: true } }),
    prisma.escalafon.findMany({ where: { id: { in: escalafonIds } }, select: { id: true } }),
    prisma.puestoCargo.findMany({ where: { id: { in: puestoCargoIds } }, select: { id: true, nombre: true, escalafonId: true } }),
    codigoRegistroIds.length
      ? prisma.codigoRegistro.findMany({ where: { id: { in: codigoRegistroIds } }, select: { id: true } })
      : Promise.resolve([] as { id: string }[]),
    especialidadIds.length
      ? prisma.especialidadPuesto.findMany({ where: { id: { in: especialidadIds } }, select: { id: true, nombre: true, puestoCargId: true } })
      : Promise.resolve([] as { id: string; nombre: string; puestoCargId: string }[]),
  ])

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
    }
    return { item, literalPuesto: puesto.nombre, especialidadNombre: especialidad?.nombre ?? null }
  })

  // ── UNA transacción: crea las N solicitudes + N autorizaciones ─────────────
  return prisma.$transaction(async (tx) => {
    const creadas: unknown[] = []

    for (const { item, literalPuesto, especialidadNombre } of preparados) {
      const solicitud = await tx.solicitudAlta.create({
        data: {
          hospitalId:       item.hospitalId,
          escalafonId:      item.escalafonId,
          codigoRegistroId: item.codigoRegistroId ?? null,
          puestoCargoId:      item.puestoCargoId,
          especialidadPuestoId: item.especialidadPuestoId ?? null,
          literalPuesto,
          especialidad:     especialidadNombre,
          agrupador:        item.agrupador ?? null,
          unificadorPuesto: item.unificadorPuesto ?? null,
          regimen:          item.regimen ?? null,
          expediente:       item.expediente ?? null,
          desde:            item.desde ? new Date(item.desde) : null,
          cantidad:         item.cantidad,
          bajaOrigenId:     item.bajaOrigenId ?? null,
          esTransferencia:  item.esTransferencia ?? false,
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

// --- GET / --- listado paginado ---------------------------------------------
export async function listSolicitudesAltaService(query: SolicitudesAltaQuery) {
  const { page, limit, hospitalId, estado, esTransferencia } = query
  const offset = (page - 1) * limit

  const where = {
    ...(hospitalId       && { hospitalId }),
    ...(estado           && { estado }),
    ...(esTransferencia !== undefined && { esTransferencia }),
  }

  const [total, data] = await Promise.all([
    prisma.solicitudAlta.count({ where }),
    prisma.solicitudAlta.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
      skip:    offset,
      take:    limit,
    }),
  ])

  return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } }
}

// --- GET /:id --- detalle ---------------------------------------------------
export async function getSolicitudAltaService(id: string) {
  const solicitud = await prisma.solicitudAlta.findUnique({ where: { id }, include })
  if (!solicitud) throw AppError.notFound('Solicitud de alta no encontrada')
  return solicitud
}
