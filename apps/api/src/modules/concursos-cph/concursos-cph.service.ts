import { Prisma, type ConcursoCph } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { ConcursosCphQuery, PatchConcursoCphBody, SuspenderConcursoCphBody } from './concursos-cph.schema.js'
import { calcConcursoCph, SUB_ESTADO_3_SQL_PG, type ConcursoCphCalcInput } from './concursosCph.calc.js'
import { crearNotificacion } from '../notificaciones/notificaciones.service.js'
import { crearAutorizacion } from '../autorizaciones/autorizaciones.service.js'

const include = {
  concurso: { include: { cargo: { include: { hospital: true, codigoRegistro: true } }, persona: true, baja: true } },
  hospital: true,
  personaDesignada: true,
  codigoRegistroSolicitado: true,
} satisfies Prisma.ConcursoCphInclude

// Extrae los campos que usa calcConcursoCph() de una fila completa —
// reutilizado por patch/suspender (ambos parten de la fila existente y
// pisan solo lo que cambió) para no repetir la lista de campos dos veces.
function toCalcInput(row: ConcursoCph): ConcursoCphCalcInput {
  return {
    suspendido: row.suspendido,
    eeBaja: row.eeBaja,
    fechaBaja: row.fechaBaja,
    eeConcurso: row.eeConcurso,
    fechaEeConcurso: row.fechaEeConcurso,
    fechaAutorizacion: row.fechaAutorizacion,
    sorteoJurado: row.sorteoJurado,
    disposicion: row.disposicion,
    fechaInscHasta: row.fechaInscHasta,
    fechaExamen: row.fechaExamen,
    fechaOrdenMerito: row.fechaOrdenMerito,
    fechaIfacs: row.fechaIfacs,
    fechaInsal: row.fechaInsal,
    eeDesignacion: row.eeDesignacion,
    cargaDocumentacion: row.cargaDocumentacion,
    fechaAptoMedico: row.fechaAptoMedico,
    fechaIte: row.fechaIte,
    proyectoResolucion: row.proyectoResolucion,
    resoALaFirma: row.resoALaFirma,
    resolucionDesignacion: row.resolucionDesignacion,
    fechaResolucion: row.fechaResolucion,
    cargoSial: row.cargoSial,
    dispoDesierta: row.dispoDesierta,
    fechaDispoDesierta: row.fechaDispoDesierta,
  }
}

// ─── S4-1: listado paginado con filtros ─────────────────────────────────────
export async function listConcursosCphService(query: ConcursosCphQuery) {
  const { page, limit, hospitalId, cargoId, estado, subEstado, subEstado3, suspendido, pendienteAutorizacion, search } = query
  const offset = (page - 1) * limit

  // subEstado3 depende de la fecha de hoy (ver concursosCph.calc.ts) — el
  // valor guardado puede haberse desactualizado solo con el paso del tiempo,
  // así que se recalcula en SQL al filtrar, mismo patrón que
  // cargos.service.ts usa para resolver ids vía $queryRaw antes del where
  // tipado de Prisma.
  let subEstado3Ids: string[] | undefined
  if (subEstado3) {
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM concursos_cph WHERE (${Prisma.raw(SUB_ESTADO_3_SQL_PG)}) = ${subEstado3}
    `)
    subEstado3Ids = rows.map((r) => r.id)
  }

  const where: Prisma.ConcursoCphWhereInput = {
    ...(hospitalId && { hospitalId }),
    ...(cargoId && { cargoId }),
    ...(estado && { estado }),
    ...(subEstado && { subEstado }),
    ...(suspendido !== undefined && { suspendido }),
    ...(pendienteAutorizacion !== undefined && { pendienteAutorizacion }),
    ...(subEstado3Ids && { id: { in: subEstado3Ids } }),
    ...(search && {
      OR: [
        { eeBaja: { contains: search, mode: 'insensitive' } },
        { eeConcurso: { contains: search, mode: 'insensitive' } },
        { especialidadSolicitada: { contains: search, mode: 'insensitive' } },
        { resolucionDesignacion: { contains: search, mode: 'insensitive' } },
        { observaciones: { contains: search, mode: 'insensitive' } },
      ],
    }),
  }

  const [total, data] = await Promise.all([
    prisma.concursoCph.count({ where }),
    prisma.concursoCph.findMany({
      where,
      include,
      orderBy: { updatedAt: 'desc' },
      skip: offset,
      take: limit,
    }),
  ])

  return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } }
}

// ─── S4-2: detalle completo ──────────────────────────────────────────────────
export async function getConcursoCphByIdService(id: string) {
  const concursoCph = await prisma.concursoCph.findUnique({ where: { id }, include })
  if (!concursoCph) throw AppError.notFound('Concurso CPH no encontrado')
  return concursoCph
}

// Campos de tipo fecha del PATCH — explícito en vez de heurística por nombre
// (`key.startsWith('fecha')` se probó y falla para `sorteoJurado`, que es
// fecha pero no arranca con ese prefijo: la columna quedaba con el string
// "YYYY-MM-DD" crudo en vez de un Date, y Prisma lo rechazaba en runtime con
// "premature end of input. Expected ISO-8601 DateTime" — tsc no lo detecta
// porque PatchConcursoCphBody tipa las fechas como `string`, igual que
// cualquier otro campo de texto).
const CAMPOS_FECHA = new Set<keyof PatchConcursoCphBody>([
  'fechaBaja',
  'fechaEeConcurso',
  'fechaAutorizacion',
  'sorteoJurado',
  'fechaInscDesde',
  'fechaInscHasta',
  'fechaExamen',
  'fechaOrdenMerito',
  'fechaIfacs',
  'fechaInsal',
  'fechaAptoMedico',
  'fechaIte',
  'fechaResolucion',
  'fechaDispoDesierta',
])

// ─── S4-3: actualizar campos por fase — estado/subEstado se recalculan ──────
export async function patchConcursoCphService(id: string, body: PatchConcursoCphBody) {
  const existing = await prisma.concursoCph.findUnique({ where: { id }, include })
  if (!existing) throw AppError.notFound('Concurso CPH no encontrado')

  // Detectar cambio de sigla o código de registro (campos que requieren autorización)
  const cargo = (existing.concurso as unknown as { cargo?: { hospital?: { sigla?: string }; codigoRegistro?: { id?: string } } })?.cargo
  const siglaActual = cargo?.hospital?.sigla ?? ''
  const crIdActual  = cargo?.codigoRegistro?.id ?? ''
  const cambiaSigla = body.sigla !== undefined && body.sigla !== siglaActual
  const cambiaCr    = body.codigoRegistroId !== undefined && body.codigoRegistroId !== crIdActual
  const requiereAutorizacion = (cambiaSigla || cambiaCr) && !body.pendienteAutorizacion

  const patch: Prisma.ConcursoCphUpdateInput = {}
  for (const [key, value] of Object.entries(body) as [keyof PatchConcursoCphBody, unknown][]) {
    if (value === undefined) continue
    if (key === 'sigla' || key === 'codigoRegistroId') continue // se manejan aparte
    const isFecha = CAMPOS_FECHA.has(key)
    ;(patch as Record<string, unknown>)[key] = isFecha && typeof value === 'string' ? new Date(value) : value
  }

  if (requiereAutorizacion) {
    patch.pendienteAutorizacion = true
    patch.siglaSolicitada = body.sigla ?? null
    if (body.codigoRegistroId !== undefined) {
      patch.codigoRegistroSolicitado = body.codigoRegistroId
        ? { connect: { id: body.codigoRegistroId } }
        : { disconnect: true }
    }
  }

  const merged = toCalcInput({ ...existing, ...(patch as Partial<ConcursoCph>) } as ConcursoCph)
  const calc = calcConcursoCph(merged)

  const updated = await prisma.concursoCph.update({
    where: { id },
    data: {
      ...patch,
      estado: calc.estado,
      subEstado: calc.subEstado,
      subEstado3: calc.subEstado3,
    },
    include,
  })

  // S13-7: crear Autorizacion genérica si hay cambio estructural
  // crearAutorizacion también crea la Notificacion al director internamente
  if (requiereAutorizacion) {
    await crearAutorizacion(prisma, {
      tipo:               'concurso_cph',
      referenciaId:       id,
      referenciaTipo:     'concurso_cph',
      solicitadoPorId:    undefined, // patchConcursoCphService no recibe usuarioId — se agrega en S13-7b si hace falta
      resolverPorRolSlug: 'director',
    })
  }

  return updated
}

// ─── Aprobar autorización (flujo dos pasos: director → sgrasv) ──────────────
export async function aprobarAutorizacionCphService(id: string, rolSlug: string, aprobado: boolean, observaciones?: string) {
  const existing = await prisma.concursoCph.findUnique({ where: { id }, include })
  if (!existing) throw AppError.notFound('Concurso CPH no encontrado')
  if (!existing.pendienteAutorizacion) throw AppError.conflict('Este concurso no tiene una autorización pendiente')

  const cargoCodigo = (existing.concurso as unknown as { cargo?: { codigo?: string } })?.cargo?.codigo ?? id.slice(0, 8)

  // Paso 1: director aprueba → notifica a sgrasv para segunda firma
  if (rolSlug === 'director') {
    if (!aprobado) {
      // Director rechaza → limpia todo y notifica a concursales_cph
      await prisma.concursoCph.update({
        where: { id },
        data: { pendienteAutorizacion: false, aprobadoDirector: false, siglaSolicitada: null, codigoRegistroSolicitadoId: null, ...(observaciones !== undefined && { observaciones }) },
        include,
      })
      await crearNotificacion({
        tipo: 'autorizacion_resuelta',
        rolSlug: 'concursales_cph',
        titulo: `Autorización rechazada — ${cargoCodigo}`,
        mensaje: `La modificación del concurso ${cargoCodigo} fue rechazada por el Director.${observaciones ? ` Observación: ${observaciones}` : ''}`,
        origenTipo: 'concurso_cph',
        origenId: id,
        origenKey: `autorizacion_resuelta:cph:${id}:${Date.now()}`,
      })
      return prisma.concursoCph.findUnique({ where: { id }, include })
    }
    // Director aprueba → marca aprobadoDirector y notifica a sgrasv
    const updated = await prisma.concursoCph.update({
      where: { id },
      data: { aprobadoDirector: true, ...(observaciones !== undefined && { observaciones }) },
      include,
    })
    await crearNotificacion({
      tipo: 'autorizacion_pendiente',
      rolSlug: 'sgrasv',
      titulo: `Autorización aprobada por Director — ${cargoCodigo}`,
      mensaje: `El Director aprobó la modificación del concurso ${cargoCodigo}. Requiere segunda firma de SGRASV.`,
      origenTipo: 'concurso_cph',
      origenId: id,
      origenKey: `autorizacion_sgrasv:cph:${id}`,
    })
    return updated
  }

  // Paso 2: sgrasv resuelve definitivamente
  if (rolSlug === 'sgrasv') {
    const requiereDirector = !!(existing.siglaSolicitada || existing.codigoRegistroSolicitadoId)
    if (requiereDirector && !existing.aprobadoDirector) {
      throw AppError.conflict('El Director debe autorizar el cambio de sigla o código de registro antes de que SGRASV pueda resolver')
    }

    return prisma.$transaction(async (tx) => {
      // Si aprueba y hay cambios estructurales pendientes, aplicarlos al cargo
      if (aprobado && requiereDirector) {
        const cargo = (existing.concurso as unknown as { cargo?: { id?: string } })?.cargo
        if (cargo?.id) {
          const cargoUpdate: Record<string, unknown> = {}
          if (existing.siglaSolicitada) {
            const hospital = await tx.hospital.findFirst({ where: { sigla: existing.siglaSolicitada } })
            if (hospital) cargoUpdate.hospitalId = hospital.id
          }
          if (existing.codigoRegistroSolicitadoId) {
            cargoUpdate.codigoRegistroId = existing.codigoRegistroSolicitadoId
          }
          if (Object.keys(cargoUpdate).length > 0) {
            await tx.cargo.update({ where: { id: cargo.id }, data: cargoUpdate })
          }
        }
      }

      const updated = await tx.concursoCph.update({
        where: { id },
        data: { pendienteAutorizacion: false, aprobadoDirector: false, siglaSolicitada: null, codigoRegistroSolicitadoId: null, ...(observaciones !== undefined && { observaciones }) },
        include,
      })

      await crearNotificacion({
        tipo: 'autorizacion_resuelta',
        rolSlug: 'concursales_cph',
        titulo: `Autorización ${aprobado ? 'aprobada' : 'rechazada'} — ${cargoCodigo}`,
        mensaje: `La modificación del concurso ${cargoCodigo} fue ${aprobado ? 'aprobada' : 'rechazada'} por SGRASV.${observaciones ? ` Observación: ${observaciones}` : ''}`,
        origenTipo: 'concurso_cph',
        origenId: id,
        origenKey: `autorizacion_resuelta:cph:${id}:${Date.now()}`,
      })

      return updated
    })
  }

  throw AppError.forbidden('No tenés permiso para resolver esta autorización')
}

// ─── S4-5: suspender / reanudar ──────────────────────────────────────────────
export async function suspenderConcursoCphService(id: string, body: SuspenderConcursoCphBody) {
  const existing = await prisma.concursoCph.findUnique({ where: { id } })
  if (!existing) throw AppError.notFound('Concurso CPH no encontrado')
  // Un concurso finalizado o desierto no se puede suspender ni reanudar —
  // suspender solo tiene sentido sobre un concurso activo o no_iniciado.
  if (existing.estado === 'finalizado' || existing.estado === 'desierto') {
    throw AppError.conflict(`No se puede modificar el estado de un concurso ${existing.estado}`)
  }
  if (existing.suspendido === body.suspendido) {
    throw AppError.conflict(
      body.suspendido ? 'El concurso ya está suspendido' : 'El concurso no está suspendido'
    )
  }

  const merged = toCalcInput({ ...existing, suspendido: body.suspendido })
  const calc = calcConcursoCph(merged)

  return prisma.concursoCph.update({
    where: { id },
    data: {
      suspendido: body.suspendido,
      ...(body.observaciones !== undefined && { observaciones: body.observaciones }),
      estado: calc.estado,
      subEstado: calc.subEstado,
      subEstado3: calc.subEstado3,
    },
    include,
  })
}
