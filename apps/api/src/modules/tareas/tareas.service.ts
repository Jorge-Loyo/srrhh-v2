import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { TipoTareaPendiente } from '@srrhh/types'
import type { TareasQuery } from './tareas.schema.js'

// ─── Jerarquía de roles: descendientes (función PURA, testeable sin BD) ──────
// BFS hacia abajo sobre las aristas (rolHijoSlug → rolPadreSlug) partiendo del
// rol raíz, devolviendo los slugs de todos los roles hijos/nietos/etc. El
// visited-set corta ciclos y diamantes (multi-padre/multi-hijo). NO incluye la
// raíz. Mismo patrón "función pura separada del acceso a datos" que
// elegirSlugResolutor en autorizaciones.service.ts.
export function descendientesDeJerarquia(
  filas: { rolHijoSlug: string; rolPadreSlug: string }[],
  rolSlugRaiz: string,
): string[] {
  // Índice padre → hijos para no recorrer todas las filas en cada paso.
  const hijosPorPadre = new Map<string, string[]>()
  for (const { rolHijoSlug, rolPadreSlug } of filas) {
    const lista = hijosPorPadre.get(rolPadreSlug)
    if (lista) lista.push(rolHijoSlug)
    else hijosPorPadre.set(rolPadreSlug, [rolHijoSlug])
  }

  const visitados = new Set<string>()
  const resultado: string[] = []
  const cola: string[] = [...(hijosPorPadre.get(rolSlugRaiz) ?? [])]

  while (cola.length > 0) {
    const actual = cola.shift()!
    if (visitados.has(actual) || actual === rolSlugRaiz) continue
    visitados.add(actual)
    resultado.push(actual)
    for (const hijo of hijosPorPadre.get(actual) ?? []) {
      if (!visitados.has(hijo)) cola.push(hijo)
    }
  }

  return resultado
}

// Acceso a datos: carga la tabla de jerarquías y delega en la función pura.
export async function slugsDescendientes(rolSlugRaiz: string): Promise<string[]> {
  const filas = await prisma.roleJerarquia.findMany({
    select: { rolHijoSlug: true, rolPadreSlug: true },
  })
  return descendientesDeJerarquia(filas, rolSlugRaiz)
}

// ─── Helper: crear una tarea pendiente (con deduplicación) ───────────────────
// Dedup por (tipo, referenciaTipo, referenciaId, usuarioDestinatarioId) sobre
// las tareas en estado 'pendiente': si ya hay una abierta la devuelve, si no la
// crea. Recibe el client transaccional `tx` (o prisma) para componerse dentro
// de la $transaction del flujo que la dispara.
export async function crearTareaPendiente(
  tx: typeof prisma,
  data: {
    tipo: TipoTareaPendiente
    usuarioDestinatarioId: string
    referenciaTipo: string
    referenciaId: string
    mensaje?: string | null
    creadaPorId?: string | null
  },
) {
  const existente = await tx.tareaPendiente.findFirst({
    where: {
      tipo: data.tipo,
      referenciaTipo: data.referenciaTipo,
      referenciaId: data.referenciaId,
      usuarioDestinatarioId: data.usuarioDestinatarioId,
      estado: 'pendiente',
    },
  })
  if (existente) return existente

  return tx.tareaPendiente.create({
    data: {
      tipo: data.tipo,
      usuarioDestinatarioId: data.usuarioDestinatarioId,
      referenciaTipo: data.referenciaTipo,
      referenciaId: data.referenciaId,
      mensaje: data.mensaje ?? null,
      creadaPorId: data.creadaPorId ?? null,
    },
  })
}

// ─── Cerrar las tareas de un concurso (idempotente) ──────────────────────────
// updateMany sobre las tareas pendientes de rechazo de este concurso: las marca
// resueltas. Idempotente (si no hay ninguna, no hace nada). Recibe el client
// transaccional para correr dentro de la tx del re-pedido de autorización.
export async function cerrarTareasDeConcurso(client: typeof prisma, concursoId: string) {
  return client.tareaPendiente.updateMany({
    where: {
      tipo: 'rechazo_autorizacion_concurso',
      referenciaTipo: 'concurso_cph',
      referenciaId: concursoId,
      estado: 'pendiente',
    },
    data: { estado: 'resuelta', resueltaAt: new Date() },
  })
}

// ─── Visibilidad jerárquica ──────────────────────────────────────────────────
// Núcleo PURO: ¿el destinatario es el propio usuario o alguien bajo su rol?
// `slugsDescendientes` es el set (ya resuelto) de slugs descendientes del rol
// del usuario; `rolSlugsDestinatario` son los slugs de rol del destinatario.
export function esVisibleParaNucleo(
  destinatarioId: string,
  rolSlugsDescendientes: string[],
  userId: string,
  rolSlugsDestinatario: string[],
): boolean {
  if (destinatarioId === userId) return true
  const set = new Set(rolSlugsDescendientes)
  return rolSlugsDestinatario.some((slug) => set.has(slug))
}

// ¿El usuario (userId/rolSlug) puede ver la tarea dirigida a `destinatarioId`?
export async function esVisiblePara(destinatarioId: string, userId: string, rolSlug: string) {
  if (destinatarioId === userId) return true
  const descendientes = await slugsDescendientes(rolSlug)
  if (descendientes.length === 0) return false
  const destinatario = await prisma.usuario.findUnique({
    where: { id: destinatarioId },
    select: { role: { select: { slug: true } } },
  })
  const slugDest = destinatario?.role.slug
  return esVisibleParaNucleo(destinatarioId, descendientes, userId, slugDest ? [slugDest] : [])
}

// WHERE de las tareas visibles: las propias + las dirigidas a usuarios cuyo rol
// cae bajo el rol del usuario en la jerarquía.
async function tareasVisiblesWhere(userId: string, rolSlug: string) {
  const descendientes = await slugsDescendientes(rolSlug)
  if (descendientes.length === 0) {
    return { usuarioDestinatarioId: userId }
  }
  return {
    OR: [
      { usuarioDestinatarioId: userId },
      { destinatario: { role: { slug: { in: descendientes } } } },
    ],
  }
}

const usuarioRefSelect = {
  select: { id: true, username: true, nombre: true, apellido: true },
} as const

// ─── GET / — listado paginado de tareas visibles ────────────────────────────
export async function listTareasService(userId: string, rolSlug: string, query: TareasQuery) {
  const { page, limit, estado, tipo } = query
  const offset = (page - 1) * limit

  const visibles = await tareasVisiblesWhere(userId, rolSlug)
  const where = {
    ...visibles,
    ...(estado && { estado }),
    ...(tipo && { tipo }),
  }

  const [total, data] = await Promise.all([
    prisma.tareaPendiente.count({ where }),
    prisma.tareaPendiente.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      include: {
        creadaPor: usuarioRefSelect,
        destinatario: usuarioRefSelect,
      },
    }),
  ])

  return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } }
}

// ─── GET /pendientes — contador para el badge del header ─────────────────────
export async function countTareasPendientesService(userId: string, rolSlug: string) {
  const visibles = await tareasVisiblesWhere(userId, rolSlug)
  return prisma.tareaPendiente.count({ where: { ...visibles, estado: 'pendiente' } })
}

// ─── POST /:id/resolver — marcar una tarea como resuelta ─────────────────────
// 404 si no existe, 403 si no es visible para el usuario, idempotente (devuelve
// la tarea si ya estaba resuelta).
export async function resolverTareaService(id: string, userId: string, rolSlug: string) {
  const tarea = await prisma.tareaPendiente.findUnique({ where: { id } })
  if (!tarea) throw AppError.notFound('Tarea no encontrada')

  const visible = await esVisiblePara(tarea.usuarioDestinatarioId, userId, rolSlug)
  if (!visible) throw AppError.forbidden('Sin acceso a esta tarea')

  if (tarea.estado === 'resuelta') return tarea

  return prisma.tareaPendiente.update({
    where: { id },
    data: { estado: 'resuelta', resueltaAt: new Date() },
  })
}
