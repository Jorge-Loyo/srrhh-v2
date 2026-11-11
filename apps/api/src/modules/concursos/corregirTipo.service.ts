// Paso 5a — corrección del tipo de concurso (CPH <-> CEETPS) por quien autoriza.
//
// Solo aplica a concursos de cargo nuevo (motivo_concurso='nuevo_cargo') que
// todavía NO fueron autorizados (autorizado_at NULL). Es atómica (una
// transacción con TX_OPTS_LARGA): crea el concurso del tipo destino con
// createConcursoTx (no se duplica la creación), copia los datos de la Etapa 1,
// mueve la autorización pendiente, borra el concurso origen y deja una entrada
// de auditoría. Los avisos van DESPUÉS del commit y su falla no revierte.
import pino from 'pino'
import type { Prisma } from '@prisma/client'
import { TipoConcurso } from '@srrhh/types'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { TX_OPTS_LARGA } from '../../shared/txOpts.js'
import { resolverCrPorCarrera, type CrPorCarreraDb } from '../../shared/crPorCarrera.js'
import { tipoConcursoDeCargo } from '../incidencias/incidencias.gestionable.js'
import { createConcursoTx } from './concursos.service.js'
import {
  resolverSlugPorPermiso,
  usuarioPuedeResolverSgrasv,
} from '../autorizaciones/autorizaciones.service.js'
import { recalcularCalcCph } from '../concursos-cph/recalcularCph.js'
import { recalcularCalcCeetps } from '../concursos-ceetps/recalcularCeetps.js'
import { recalcularSubEstadoCargo } from '../cargos/subEstado.repo.js'
import { crearNotificacion } from '../notificaciones/notificaciones.service.js'
import { notificarSgrasvYHijos } from '../notificaciones/notificarSgrasv.js'
import type { CorregirTipoBody } from './corregirTipo.schema.js'

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })

export type TipoConcursoCorregible = 'cph' | 'ceetps'

/** Entidad/acción de AuditLog de la corrección (el historial del wizard la lee de ahí). */
export const AUDIT_ENTIDAD_CORRECCION_TIPO = 'concurso_tipo'
export const AUDIT_ACCION_CORRECCION_TIPO = 'corregir_tipo'

/** CR por defecto del tipo destino cuando el cargo/carrera no aporta uno que clasifique. */
export const CR_DEFECTO_POR_TIPO: Record<TipoConcursoCorregible, string> = { cph: '37', ceetps: '85' }

export const MSG_YA_AUTORIZADO =
  'El concurso ya fue autorizado: el tipo ya no se puede corregir'
export const MSG_NO_NUEVO_CARGO =
  'Solo se puede corregir el tipo de concursos de cargo nuevo'

const LABEL_TIPO: Record<TipoConcursoCorregible, string> = { cph: 'CPH', ceetps: 'CEETPS' }

// ─── Mapeo de campos (puro) ───────────────────────────────────────────────────
// `datos` se copia al concurso destino; `sinEquivalente` son los valores del
// origen que NO tienen campo en el destino (quedan archivados en la auditoría).
export interface MapeoCampos {
  datos: Record<string, unknown>
  sinEquivalente: Record<string, unknown>
}

function soloConValor(o: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined || v === '' || v === false) continue
    r[k] = v instanceof Date ? v.toISOString() : v
  }
  return r
}

export function mapearCphACeetps(c: Record<string, any>): MapeoCampos {
  return {
    datos: {
      expedienteConcurso: c.eeConcurso ?? null,
      fechaCaratulacion: c.fechaEeConcurso ?? null,
      ifAutorizacion: c.ifAutorizacion ?? null,
      fechaAutorizacion: c.fechaAutorizacion ?? null,
      fechaIfacs: c.fechaIfacs ?? null,
      fechaInsal: c.fechaInsal ?? null,
      puestoSolicitado: c.puestoSolicitado ?? null,
      puestoCargoSolicitadoId: c.puestoCargoSolicitadoId ?? null,
      observaciones: c.observaciones ?? null,
      cambioEspecialidad: c.cambioEspecialidad ?? false,
      docCambioEspecialidad: c.motivoCambioEspecialidad ? String(c.motivoCambioEspecialidad).slice(0, 500) : null,
    },
    sinEquivalente: soloConValor({
      especialidadSolicitada: c.especialidadSolicitada,
      especialidadPuestoSolicitadaId: c.especialidadPuestoSolicitadaId,
      eeBaja: c.eeBaja,
      fechaBaja: c.fechaBaja,
      siglaSolicitada: c.siglaSolicitada,
      codigoRegistroSolicitadoId: c.codigoRegistroSolicitadoId,
    }),
  }
}

export function mapearCeetpsACph(c: Record<string, any>): MapeoCampos {
  return {
    datos: {
      eeConcurso: c.expedienteConcurso ?? null,
      fechaEeConcurso: c.fechaCaratulacion ?? null,
      ifAutorizacion: c.ifAutorizacion ?? null,
      fechaAutorizacion: c.fechaAutorizacion ?? null,
      fechaIfacs: c.fechaIfacs ?? null,
      fechaInsal: c.fechaInsal ?? null,
      puestoSolicitado: c.puestoSolicitado ?? null,
      puestoCargoSolicitadoId: c.puestoCargoSolicitadoId ?? null,
      observaciones: c.observaciones ?? null,
      cambioEspecialidad: c.cambioEspecialidad ?? false,
      motivoCambioEspecialidad: c.docCambioEspecialidad ?? null,
    },
    sinEquivalente: soloConValor({
      cargaHoraria: c.cargaHoraria,
      apertura2x18: c.apertura2x18,
      informeApertura: c.informeApertura,
      expedienteConcurso2: c.expedienteConcurso2,
      tipificadorOrigen: c.tipificadorOrigen,
      cantidadCargos: c.cantidadCargos !== 1 ? c.cantidadCargos : null,
    }),
  }
}

/** Etapa 1 completa (expediente + IF) en el mapeo ya hecho, sea cual sea el destino. */
function etapa1Completa(tipoOrigen: TipoConcursoCorregible, origen: Record<string, any>): boolean {
  const exp = tipoOrigen === 'cph' ? origen.eeConcurso : origen.expedienteConcurso
  return !!exp && !!origen.ifAutorizacion
}

// ─── CR del cargo coherente con el tipo destino ───────────────────────────────
export interface CargoParaCr {
  id: string
  escalafonId: string
  literalPuesto: string | null
  codigoRegistroId: string | null
  codigoRegistro: { codigo: string } | null
}

export interface CrDestino {
  /** id del CR a dejar en el cargo (null = no se toca). */
  codigoRegistroId: string | null
  cambia: boolean
  escalafonId: string
  codigo: string | null
}

/**
 * 1) Si el CR actual del cargo ya clasifica en el tipo destino, se conserva.
 * 2) Si no, el CR deducido de la carrera (resolverCrPorCarrera), si clasifica en el destino.
 * 3) Si no, el CR por defecto del tipo (CPH 37 / CEETPS 85; ver CR_DEFECTO_POR_TIPO).
 */
export async function resolverCrDestino(
  tx: Prisma.TransactionClient,
  cargo: CargoParaCr,
  destino: TipoConcursoCorregible,
): Promise<CrDestino> {
  const actual = tipoConcursoDeCargo({ codigoRegistro: cargo.codigoRegistro?.codigo ?? null, literalPuesto: cargo.literalPuesto })
  if (actual === destino) {
    return { codigoRegistroId: cargo.codigoRegistroId, cambia: false, escalafonId: cargo.escalafonId, codigo: cargo.codigoRegistro?.codigo ?? null }
  }
  const deCarrera = await resolverCrPorCarrera(tx as unknown as CrPorCarreraDb, cargo.escalafonId, cargo.literalPuesto)
  if (deCarrera && deCarrera.tipo === destino) {
    return { codigoRegistroId: deCarrera.id, cambia: deCarrera.id !== cargo.codigoRegistroId, escalafonId: cargo.escalafonId, codigo: deCarrera.codigo }
  }
  const codigoDefecto = CR_DEFECTO_POR_TIPO[destino]
  const porDefecto = await tx.codigoRegistro.findUnique({
    where: { codigo: codigoDefecto },
    select: { id: true, codigo: true, escalafonId: true },
  })
  if (!porDefecto) {
    throw AppError.conflict(`No existe el código de registro ${codigoDefecto} en el catálogo: no se puede cambiar a ${LABEL_TIPO[destino]}`)
  }
  return { codigoRegistroId: porDefecto.id, cambia: true, escalafonId: porDefecto.escalafonId, codigo: porDefecto.codigo }
}

// ─── Servicio ─────────────────────────────────────────────────────────────────
export interface CorregirTipoResultado {
  tipoOrigen: TipoConcursoCorregible
  tipoDestino: TipoConcursoCorregible
  /** Id del Concurso base nuevo. */
  concursoId: string
  /** Id de la fila ConcursoCph/ConcursoCeetps nueva (el de la ruta del front). */
  detalleId: string
  autorizacionReemitida: boolean
  codigoRegistroActualizado: boolean
}

export async function corregirTipoConcursoService(
  tipoOrigen: TipoConcursoCorregible,
  detalleId: string,
  body: CorregirTipoBody,
  usuarioId: string,
): Promise<CorregirTipoResultado> {
  const motivo = body.motivo.trim()
  if (!motivo) throw AppError.badRequest('El motivo es obligatorio')
  if (body.tipoDestino === tipoOrigen) {
    throw AppError.badRequest(`El concurso ya es de tipo ${LABEL_TIPO[tipoOrigen]}`)
  }
  const tipoDestino = body.tipoDestino
  // Derecho de autorizar: permiso autorizaciones/resolver_sgrasv (o admin).
  if (!(await usuarioPuedeResolverSgrasv(prisma as unknown as Prisma.TransactionClient, usuarioId))) {
    throw AppError.forbidden('Solo quien autoriza concursos puede corregir el tipo')
  }

  const out = await prisma.$transaction(async (tx) => {
    // 1) Existe y se bloquea la fila base: una segunda corrección concurrente
    // espera, y al entrar ya no encuentra el concurso (409 limpio).
    const previo =
      tipoOrigen === 'cph'
        ? await tx.concursoCph.findUnique({ where: { id: detalleId }, select: { concursoId: true } })
        : await tx.concursoCeetps.findUnique({ where: { id: detalleId }, select: { concursoId: true } })
    if (!previo) throw AppError.notFound(`Concurso ${LABEL_TIPO[tipoOrigen]} no encontrado`)
    const bloqueada = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM concursos WHERE id = ${previo.concursoId}::uuid FOR UPDATE`
    if (!bloqueada || bloqueada.length === 0) {
      throw AppError.conflict('El concurso ya fue modificado por otro usuario: recargá la pantalla')
    }
    // 2) Relectura con la fila bloqueada (datos confirmados).
    const cargoSelect = {
      select: {
        id: true,
        codigo: true,
        escalafonId: true,
        literalPuesto: true,
        codigoRegistroId: true,
        codigoRegistro: { select: { codigo: true } },
      },
    } as const
    const origen: Record<string, any> | null =
      tipoOrigen === 'cph'
        ? await tx.concursoCph.findUnique({
            where: { id: detalleId },
            include: {
              concurso: { include: { cargo: cargoSelect } },
              _count: {
                select: {
                  ordenesMerito: true,
                  sorteosJurado: true,
                  inscriptos: true,
                  desiertoHistorial: true,
                  jornadasSorteo: true,
                  integrantesDesignados: true,
                },
              },
            },
          })
        : await tx.concursoCeetps.findUnique({
            where: { id: detalleId },
            include: { concurso: { include: { cargo: cargoSelect } } },
          })
    if (!origen) throw AppError.conflict('El concurso ya fue modificado por otro usuario: recargá la pantalla')
    const base = origen.concurso
    if (base.motivoConcurso !== 'nuevo_cargo') throw AppError.conflict(MSG_NO_NUEVO_CARGO)
    if (base.autorizadoAt != null) throw AppError.conflict(MSG_YA_AUTORIZADO)
    const terminal = tipoOrigen === 'cph' ? origen.estado === 'finalizado' : ['finalizado', 'desierto'].includes(origen.estado)
    if (terminal) throw AppError.conflict(`No se puede corregir el tipo de un concurso ${origen.estado}`)
    if (tipoOrigen === 'cph') {
      const hijos = Object.values(origen._count as Record<string, number>).reduce((a, b) => a + b, 0)
      if (hijos > 0) {
        throw AppError.conflict('El concurso ya tiene jurado, inscriptos u orden de mérito: no se puede cambiar el tipo')
      }
    }
    const cargo = base.cargo as CargoParaCr & { codigo: string | null }

    // 3) Otro concurso abierto del cargo (distinto del origen) => no se crea el destino.
    const [otroCph, otroCeetps] = await Promise.all([
      tx.concursoCph.findFirst({
        where: { cargoId: cargo.id, estado: { not: 'finalizado' }, suspendido: false, ...(tipoOrigen === 'cph' ? { id: { not: detalleId } } : {}) },
        select: { id: true },
      }),
      tx.concursoCeetps.findFirst({
        where: { cargoId: cargo.id, estado: { notIn: ['finalizado', 'desierto'] }, ...(tipoOrigen === 'ceetps' ? { id: { not: detalleId } } : {}) },
        select: { id: true },
      }),
    ])
    if (otroCph || otroCeetps) throw AppError.conflict('El cargo ya tiene otro concurso abierto')

    // 4) Autorizaciones del origen.
    const tipoAutOrigen = tipoOrigen === 'cph' ? 'concurso_cph' : 'concurso_ceetps'
    const tipoAutDestino = tipoDestino === 'cph' ? 'concurso_cph' : 'concurso_ceetps'
    const pendientes = await tx.autorizacion.findMany({
      where: { referenciaId: detalleId, tipo: tipoAutOrigen, estado: 'pendiente' },
      select: { id: true, solicitadoPorId: true },
    })
    const haySolicitudPendiente = pendientes.length > 0
    const reemitir = haySolicitudPendiente && etapa1Completa(tipoOrigen, origen)

    // 5) CR del cargo coherente con el destino.
    const cr = await resolverCrDestino(tx, cargo, tipoDestino)
    if (cr.cambia && cr.codigoRegistroId) {
      await tx.cargo.update({ where: { id: cargo.id }, data: { codigoRegistroId: cr.codigoRegistroId } })
    }

    // 6) Mapeo de datos y baja del origen (las hijas se cuentan arriba; etiquetas CPH caen en cascada).
    const mapeo = tipoOrigen === 'cph' ? mapearCphACeetps(origen) : mapearCeetpsACph(origen)
    if (pendientes.length > 0) {
      await tx.autorizacion.updateMany({
        where: { id: { in: pendientes.map((p) => p.id) } },
        data: {
          estado: 'rechazada',
          resueltoPorId: usuarioId,
          observaciones: `Cambio de tipo de concurso (${LABEL_TIPO[tipoOrigen]} → ${LABEL_TIPO[tipoDestino]}): ${motivo}`,
        },
      })
      await tx.notificacion.updateMany({
        where: { origenTipo: 'autorizacion', origenId: { in: pendientes.map((p) => p.id) }, leida: false },
        data: { leida: true, leidaAt: new Date() },
      })
    }
    if (tipoOrigen === 'cph') {
      await tx.tareaPendiente.updateMany({
        where: { referenciaTipo: 'concurso_cph', referenciaId: detalleId, estado: 'pendiente' },
        data: { estado: 'resuelta', resueltaAt: new Date() },
      })
      await tx.concursoCph.delete({ where: { id: detalleId } })
    } else {
      await tx.concursoCeetps.delete({ where: { id: detalleId } })
    }
    await tx.concurso.delete({ where: { id: base.id } })

    // 7) Alta del destino con createConcursoTx (sin aviso individual ni recálculo: se hace abajo).
    const fechaVacante = new Date(base.fechaVacante).toISOString().slice(0, 10)
    const nuevo = await createConcursoTx(
      tx,
      {
        cargoId: cargo.id,
        hospitalId: base.hospitalId,
        ...(base.personaId && { personaId: base.personaId }),
        origen: base.origen,
        fechaVacante,
        ...(base.motivo && { motivo: base.motivo }),
        motivoConcurso: 'nuevo_cargo',
        ...(base.expediente && { expediente: base.expediente }),
        tipoConcurso: tipoDestino === 'cph' ? TipoConcurso.CPH : TipoConcurso.CEETPS,
        ...(tipoDestino === 'ceetps' && { escalafonId: cr.escalafonId }),
        ...(tipoDestino === 'ceetps' && origen.puestoSolicitado && { puestoSolicitado: origen.puestoSolicitado }),
      },
      base.registradoPorId ?? usuarioId,
      base.bajaId ?? undefined,
      { notificar: false, recalcularSubEstado: false },
    )
    // Se conserva la fecha de alta y quién registró el concurso original.
    await tx.concurso.update({ where: { id: nuevo.concurso.id }, data: { createdAt: base.createdAt } })
    const nuevoDetalleId = (tipoDestino === 'cph' ? nuevo.concursoCph?.id : nuevo.concursoCeetps?.id) as string
    if (tipoDestino === 'cph') {
      await tx.concursoCph.update({ where: { id: nuevoDetalleId }, data: mapeo.datos as Prisma.ConcursoCphUncheckedUpdateInput })
    } else {
      await tx.concursoCeetps.update({ where: { id: nuevoDetalleId }, data: mapeo.datos as Prisma.ConcursoCeetpsUncheckedUpdateInput })
    }

    // 8) Autorizaciones: el rechazo anterior (con su observación) se conserva en el destino;
    // si había una solicitud pendiente con la Etapa 1 completa, se re-emite para el nuevo tipo.
    await tx.autorizacion.updateMany({
      where: { referenciaId: detalleId, tipo: tipoAutOrigen, estado: 'rechazada', id: { notIn: pendientes.map((p) => p.id) } },
      data: { referenciaId: nuevoDetalleId, tipo: tipoAutDestino, referenciaTipo: tipoAutDestino },
    })
    let autReemitidaId: string | null = null
    if (reemitir) {
      const slug = await resolverSlugPorPermiso(tx, 'autorizaciones', 'resolver_sgrasv')
      const aut = await tx.autorizacion.create({
        data: {
          tipo: tipoAutDestino,
          referenciaId: nuevoDetalleId,
          referenciaTipo: tipoAutDestino,
          solicitadoPorId: pendientes[0]!.solicitadoPorId ?? usuarioId,
          resolverPorRolSlug: slug,
        },
      })
      autReemitidaId = aut.id
    }
    // Estado/sub-estado del concurso nuevo (nunca autorizado: autorizado_at sigue NULL).
    const calcAut = reemitir ? 'pendiente' : 'sin_solicitar'
    if (tipoDestino === 'cph') await recalcularCalcCph(tx, nuevoDetalleId, calcAut)
    else await recalcularCalcCeetps(tx, nuevoDetalleId, calcAut)

    // 9) Regla única: un solo concurso abierto para el cargo; sub_estado del cargo.
    const [nCph, nCeetps] = await Promise.all([
      tx.concursoCph.count({ where: { cargoId: cargo.id, estado: { not: 'finalizado' }, suspendido: false } }),
      tx.concursoCeetps.count({ where: { cargoId: cargo.id, estado: { notIn: ['finalizado', 'desierto'] } } }),
    ])
    if (nCph + nCeetps !== 1) throw AppError.conflict('La corrección dejaría al cargo con más de un concurso abierto')
    await recalcularSubEstadoCargo(tx, cargo.id)

    // 10) Auditoría (y encadenado de correcciones previas al id nuevo).
    await tx.auditLog.updateMany({
      where: { entidad: AUDIT_ENTIDAD_CORRECCION_TIPO, entidadId: detalleId },
      data: { entidadId: nuevoDetalleId },
    })
    await tx.auditLog.create({
      data: {
        usuarioId,
        accion: AUDIT_ACCION_CORRECCION_TIPO,
        entidad: AUDIT_ENTIDAD_CORRECCION_TIPO,
        entidadId: nuevoDetalleId,
        cambios: {
          tipoOrigen,
          tipoDestino,
          motivo,
          detalleIdAnterior: detalleId,
          detalleIdNuevo: nuevoDetalleId,
          concursoIdAnterior: base.id,
          concursoIdNuevo: nuevo.concurso.id,
          cargoId: cargo.id,
          codigoRegistroNuevo: cr.cambia ? cr.codigo : null,
          autorizacionReemitida: reemitir,
          autorizacionesAnuladas: pendientes.map((p) => p.id),
          camposSinEquivalente: mapeo.sinEquivalente,
        } as Prisma.InputJsonValue,
      },
    })

    return {
      resultado: {
        tipoOrigen,
        tipoDestino,
        concursoId: nuevo.concurso.id,
        detalleId: nuevoDetalleId,
        autorizacionReemitida: reemitir,
        codigoRegistroActualizado: cr.cambia,
      } satisfies CorregirTipoResultado,
      aviso: {
        cargoCodigo: cargo.codigo ?? cargo.id.slice(0, 8),
        cargoId: cargo.id,
        registradoPorId: base.registradoPorId as string | null,
        solicitantesIds: pendientes.map((p) => p.solicitadoPorId).filter((x): x is string => !!x),
        autReemitidaId,
      },
    }
  }, TX_OPTS_LARGA)

  // Avisos DESPUÉS del commit: un fallo se loguea y NO revierte la corrección.
  await avisarCorreccion(out.resultado, motivo, out.aviso, usuarioId)
  return out.resultado
}

async function avisarCorreccion(
  r: CorregirTipoResultado,
  motivo: string,
  aviso: { cargoCodigo: string; cargoId: string; registradoPorId: string | null; solicitantesIds: string[]; autReemitidaId: string | null },
  usuarioId: string,
) {
  try {
    const titulo = `Cambio de tipo de concurso — ${aviso.cargoCodigo}`
    const mensaje = `El concurso del cargo ${aviso.cargoCodigo} pasó de ${LABEL_TIPO[r.tipoOrigen]} a ${LABEL_TIPO[r.tipoDestino]}. Motivo: ${motivo}`
    const origenTipo = r.tipoDestino === 'cph' ? 'concurso_cph' : 'concurso_ceetps'

    // Quien cargó el alta, quien registró el concurso y quien pidió la autorización.
    const solicitudAlta = await prisma.solicitudAlta.findFirst({
      where: { cargosCreadosIds: { has: aviso.cargoId } },
      select: { solicitadoPorId: true },
    })
    const usuariosIds = [
      ...new Set([solicitudAlta?.solicitadoPorId, aviso.registradoPorId, ...aviso.solicitantesIds].filter((x): x is string => !!x)),
    ].filter((id) => id !== usuarioId)
    const usuarios = usuariosIds.length
      ? await prisma.usuario.findMany({ where: { id: { in: usuariosIds } }, select: { role: { select: { slug: true } } } })
      : []
    // Supervisión de Concursos: los roles que ven la pestaña Nuevos cargos.
    const supervision = await prisma.role.findMany({
      where: { activo: true, permisos: { some: { permiso: { modulo: 'cargos', accion: 'tab:nuevos-cargos' } } } },
      select: { slug: true },
    })
    const slugs = new Set<string>([...usuarios.map((u) => u.role.slug), ...supervision.map((s) => s.slug)])
    for (const rolSlug of slugs) {
      await crearNotificacion({
        tipo: 'concurso_iniciado',
        rolSlug,
        titulo,
        mensaje,
        origenTipo,
        origenId: r.detalleId,
        origenKey: `correccion_tipo:${r.detalleId}:${rolSlug}`,
      })
    }
    if (aviso.autReemitidaId) {
      await notificarSgrasvYHijos({
        tipo: 'autorizacion_pendiente',
        titulo: `Autorización de concurso ${LABEL_TIPO[r.tipoDestino]} pendiente — ${aviso.cargoCodigo}`,
        mensaje: `Tras el cambio de tipo, hay una autorización de apertura del concurso ${LABEL_TIPO[r.tipoDestino]} ${aviso.cargoCodigo} esperando la resolución de SGRASV.`,
        origenTipo: 'autorizacion',
        origenId: aviso.autReemitidaId,
        origenKey: `autorizacion_pendiente:${aviso.autReemitidaId}`,
      })
    }
  } catch (err) {
    logger.error({ err, detalleId: r.detalleId }, 'corregir tipo de concurso: falló el envío de avisos (la corrección NO se revierte)')
  }
}

// ─── Historial de correcciones (para el wizard) ───────────────────────────────
export async function listarCorreccionesTipo(detalleId: string) {
  const filas = await prisma.auditLog.findMany({
    where: { entidad: AUDIT_ENTIDAD_CORRECCION_TIPO, entidadId: detalleId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      cambios: true,
      usuario: { select: { nombre: true, apellido: true, username: true } },
    },
  })
  return filas.map((f) => {
    const c = (f.cambios ?? {}) as Record<string, unknown>
    return {
      id: f.id,
      fecha: f.createdAt,
      tipoOrigen: c.tipoOrigen as TipoConcursoCorregible,
      tipoDestino: c.tipoDestino as TipoConcursoCorregible,
      motivo: (c.motivo as string) ?? '',
      usuario: f.usuario ? [f.usuario.nombre, f.usuario.apellido].filter(Boolean).join(' ') || f.usuario.username : null,
    }
  })
}
