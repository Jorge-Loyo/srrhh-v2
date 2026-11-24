import { createHash } from 'node:crypto'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { type TipoCarga, type listSesionesQuerySchema, type diffsQuerySchema } from './carga-semanal.schema.js'
import type { z } from 'zod'

export type ResolucionesConfirmar = {
  modificados?: Record<string, 'nuevo' | 'actual'>  // clave → qué valor usar
  eliminados?:  Record<string, 'eliminar' | 'mantener'>
}

type ListSesionesQuery = z.infer<typeof listSesionesQuerySchema>
type DiffsQuery = z.infer<typeof diffsQuerySchema>

export function calcularSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/**
 * Verifica si ya existe una sesión completada con el mismo sha256.
 * Lanza 409 si el archivo ya fue procesado.
 */
export async function verificarDuplicado(sha256: string): Promise<void> {
  const existente = await prisma.dimCargaArchivo.findFirst({
    where: { sha256, sesion: { estado: 'completado' } },
    select: { sesionId: true },
  })
  if (existente) {
    throw AppError.conflict(`Este archivo ya fue procesado (sesión ${existente.sesionId})`)
  }
}

/**
 * Crea la sesión y el registro de archivo. Devuelve la sesión creada.
 * El procesamiento real lo dispara el caller de forma async.
 */
/**
 * Crea la sesión y N registros de archivo (uno por tipo detectado).
 * Devuelve la sesión creada con todos sus archivos.
 */
export async function crearSesionMultiService(params: {
  archivos: Array<{ tipo: TipoCarga; filename: string; sha256: string; fechaArchivo: Date | null }>
  usuarioId: string | undefined
}) {
  const { archivos, usuarioId } = params

  // Tipo de la sesión = primer tipo con preview; si no hay ninguno, el primero
  const tipoSesion = archivos.find((a) => ['cargos_salud', 'bajas_salud'].includes(a.tipo))?.tipo
    ?? archivos[0]!.tipo

  const sesion = await prisma.dimCargaSesion.create({
    data: {
      tipo: tipoSesion,
      fechaArchivo: archivos[0]?.fechaArchivo ?? null,
      estado: 'procesando',
      usuarioId: usuarioId ?? null,
      archivos: {
        create: archivos.map((a) => ({ filename: a.filename, filas: 0, sha256: a.sha256 })),
      },
    },
    select: {
      id: true,
      tipo: true,
      fechaArchivo: true,
      estado: true,
      createdAt: true,
      archivos: { select: { id: true, filename: true, filas: true, sha256: true } },
    },
  })

  return sesion
}

/**
 * Agrega el resumen de un procesador al informe JSON de la sesión (merge parcial).
 * Cuando todos los tipos con preview terminaron, marca la sesión como pendiente_confirmacion.
 * Los tipos sin preview (arbol, ocupacion_pou, pou_decreto) no bloquean la confirmación.
 */
export async function registrarResumenParcial(
  sesionId: string,
  tipo: TipoCarga,
  resumen: Record<string, unknown>,
  tiposEnSesion: TipoCarga[],
): Promise<void> {
  // Leer informe actual
  const sesion = await prisma.dimCargaSesion.findUnique({
    where: { id: sesionId },
    select: { informe: true, estado: true },
  })
  if (!sesion) return

  const informeActual = (sesion.informe as Record<string, unknown> | null) ?? {}
  const informeNuevo = { ...informeActual, [tipo]: resumen }

  // Tipos con preview que están en esta sesión
  const tiposConPreviewEnSesion = tiposEnSesion.filter((t) =>
    ['cargos_salud', 'bajas_salud'].includes(t),
  )
  // Todos los tipos con preview ya tienen su resumen?
  const todosListos = tiposConPreviewEnSesion.every((t) => informeNuevo[t] !== undefined)

  await prisma.dimCargaSesion.update({
    where: { id: sesionId },
    data: {
      informe: informeNuevo as any,
      ...(todosListos && sesion.estado === 'procesando'
        ? { estado: 'pendiente_confirmacion' }
        : {}),
    },
  })
}

export async function crearSesionService(params: {
  tipo: TipoCarga
  filename: string
  filas: number
  sha256: string
  fechaArchivo: Date | null
  usuarioId: string | undefined
}) {
  const { tipo, filename, filas, sha256, fechaArchivo, usuarioId } = params

  const sesion = await prisma.dimCargaSesion.create({
    data: {
      tipo,
      fechaArchivo,
      estado: 'procesando',
      usuarioId: usuarioId ?? null,
      archivos: {
        create: { filename, filas, sha256 },
      },
    },
    select: {
      id: true,
      tipo: true,
      fechaArchivo: true,
      estado: true,
      createdAt: true,
      archivos: { select: { id: true, filename: true, filas: true } },
    },
  })

  return sesion
}

export async function marcarSesionPendiente(
  sesionId: string,
  informe: Record<string, unknown>,
): Promise<void> {
  await prisma.dimCargaSesion.update({
    where: { id: sesionId },
    data: { estado: 'pendiente_confirmacion', informe: informe as any },
  })
}

export async function marcarSesionError(sesionId: string, errorMsg: string): Promise<void> {
  await prisma.dimCargaSesion.update({
    where: { id: sesionId },
    data: { estado: 'error', errorMsg, finalizadoAt: new Date() },
  })
}

export async function descartarSesionService(sesionId: string): Promise<void> {
  const sesion = await prisma.dimCargaSesion.findUnique({
    where: { id: sesionId },
    select: { estado: true },
  })
  if (!sesion) throw AppError.notFound(`Sesión ${sesionId} no encontrada`)
  if (sesion.estado !== 'pendiente_confirmacion') {
    throw AppError.badRequest(`Solo se pueden descartar sesiones en estado pendiente_confirmacion`)
  }
  await prisma.dimCargaSesion.update({
    where: { id: sesionId },
    data: { estado: 'error', errorMsg: 'Descartado por el usuario', finalizadoAt: new Date() },
  })
}

export async function marcarSesionCompletada(
  sesionId: string,
  informe: Record<string, unknown>,
): Promise<void> {
  await prisma.dimCargaSesion.update({
    where: { id: sesionId },
    data: { estado: 'completado', informe: informe as any, finalizadoAt: new Date() },
  })
}

export async function listSesionesService(query: ListSesionesQuery) {
  const { tipo, estado, limit, offset } = query

  const [sesiones, total] = await Promise.all([
    prisma.dimCargaSesion.findMany({
      where: {
        ...(tipo   && { tipo }),
        ...(estado && { estado }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        tipo: true,
        fechaArchivo: true,
        estado: true,
        errorMsg: true,
        informe: true,
        createdAt: true,
        finalizadoAt: true,
        usuario: { select: { username: true } },
        archivos: { select: { filename: true, filas: true, sha256: true } },
      },
    }),
    prisma.dimCargaSesion.count({
      where: {
        ...(tipo   && { tipo }),
        ...(estado && { estado }),
      },
    }),
  ])

  return { data: sesiones, total, limit, offset }
}

export async function getSesionService(id: string) {
  const sesion = await prisma.dimCargaSesion.findUnique({
    where: { id },
    select: {
      id: true,
      tipo: true,
      fechaArchivo: true,
      estado: true,
      errorMsg: true,
      informe: true,
      createdAt: true,
      finalizadoAt: true,
      usuario: { select: { username: true } },
      archivos: { select: { filename: true, filas: true, sha256: true, createdAt: true } },
    },
  })
  if (!sesion) throw AppError.notFound(`Sesión ${id} no encontrada`)
  return sesion
}

export async function listDiffsService(sesionId: string, query: DiffsQuery) {
  const { tabla, tipo, limit, offset } = query

  // Verificar que la sesión existe
  const existe = await prisma.dimCargaSesion.findUnique({
    where: { id: sesionId },
    select: { id: true },
  })
  if (!existe) throw AppError.notFound(`Sesión ${sesionId} no encontrada`)

  const [diffs, total] = await Promise.all([
    prisma.dimCargaDiff.findMany({
      where: {
        sesionId,
        ...(tabla && { tablaAfectada: tabla }),
        ...(tipo  && { tipoDiff: tipo }),
      },
      orderBy: [{ tablaAfectada: 'asc' }, { tipoDiff: 'asc' }, { clave: 'asc' }],
      take: limit,
      skip: offset,
      select: {
        id: true,
        tablaAfectada: true,
        tipoDiff: true,
        clave: true,
        campo: true,
        valorAnterior: true,
        valorNuevo: true,
      },
    }),
    prisma.dimCargaDiff.count({
      where: {
        sesionId,
        ...(tabla && { tablaAfectada: tabla }),
        ...(tipo  && { tipoDiff: tipo }),
      },
    }),
  ])

  return { data: diffs, total, limit, offset }
}
