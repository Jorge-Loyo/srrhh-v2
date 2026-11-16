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

// ─── Builder del mensaje de la tarea de rechazo (función PURA) ───────────────
// Arma el texto de la tarea que vuelve al solicitante cuando se rechaza una
// autorización de concurso: con observaciones adjunta el motivo, sin
// observaciones usa el texto por defecto "corregí y reenviá". Separado del
// acceso a datos para testearlo sin BD (patrón del repo).
export function mensajeTareaRechazo(observaciones?: string | null): string {
  const base = 'Autorizacion rechazada. Corregi y reenvia.'
  return observaciones ? `${base} Motivo: ${observaciones}` : base
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

// ─── S25-3: GET /kanban-sgrasv ───────────────────────────────────────────────
// Una columna por supervisor (sgrasv + supervision_de_concursos) + columna
// "sin_asignar". Cada tarjeta incluye tipo (cph/ceetps), diasSinMovimiento,
// subEstado, hospital.sigla, cargo.codigo.

const SLUG_SGRASV     = 'sgrasv_5ac494e'
const SLUG_SUPERVISOR = 'supervision_de_concursos_4ff21d6'

const TARJETA_CARGO_SELECT = {
  select: {
    id: true,
    codigo: true,
    literalPuesto: true,
    hospital: { select: { id: true, sigla: true } },
  },
} as const

function diasDesde(fecha: Date): number {
  return Math.floor((Date.now() - fecha.getTime()) / 86_400_000)
}

function colorBadge(dias: number): 'verde' | 'naranja' | 'rojo' {
  if (dias < 7)  return 'verde'
  if (dias <= 30) return 'naranja'
  return 'rojo'
}

function tarjetaCph(c: {
  id: string; estado: string; subEstado: string | null; subEstado3: string | null
  pendienteAutorizacion: boolean; updatedAt: Date
  cargo: { id: string; codigo: string | null; literalPuesto: string | null; hospital: { id: string; sigla: string } }
}) {
  const dias = diasDesde(c.updatedAt)
  return {
    id: c.id, tipo: 'cph' as const,
    estado: c.estado, subEstado: c.subEstado3 ?? c.subEstado,
    pendienteAutorizacion: c.pendienteAutorizacion,
    cargo: { id: c.cargo.id, codigo: c.cargo.codigo, literalPuesto: c.cargo.literalPuesto },
    hospital: c.cargo.hospital,
    diasSinMovimiento: dias, colorBadge: colorBadge(dias),
  }
}

function tarjetaCeetps(c: {
  id: string; estado: string; subEstado: string | null; updatedAt: Date
  cargo: { id: string; codigo: string | null; literalPuesto: string | null; hospital: { id: string; sigla: string } }
}) {
  const dias = diasDesde(c.updatedAt)
  return {
    id: c.id, tipo: 'ceetps' as const,
    estado: c.estado, subEstado: c.subEstado,
    pendienteAutorizacion: false,
    cargo: { id: c.cargo.id, codigo: c.cargo.codigo, literalPuesto: c.cargo.literalPuesto },
    hospital: c.cargo.hospital,
    diasSinMovimiento: dias, colorBadge: colorBadge(dias),
  }
}

export async function getKanbanSgrasvService() {
  // 1. Supervisores (sgrasv + supervision_de_concursos)
  const supervisores = await prisma.usuario.findMany({
    where: { activo: true, role: { slug: { in: [SLUG_SGRASV, SLUG_SUPERVISOR] } } },
    select: {
      id: true, nombre: true, apellido: true, username: true,
      role: { select: { slug: true, nombre: true } },
      siglas: { select: { hospital: { select: { id: true, sigla: true, nombre: true } } } },
    },
    orderBy: [{ role: { slug: 'asc' } }, { apellido: 'asc' }],
  })

  // 2. Asignaciones activas
  const asignaciones = await prisma.concursoAsignado.findMany({
    where: { usuarioId: { not: null } },
    select: { referenciaId: true, referenciaTipo: true, usuarioId: true },
  })
  const asigMap = new Map(asignaciones.map((a) => [`${a.referenciaId}:${a.referenciaTipo}`, a.usuarioId!]))

  // 3. Concursos activos (no finalizados)
  const [cphs, ceetps] = await Promise.all([
    prisma.concursoCph.findMany({
      where: { estado: { notIn: ['finalizado', 'suspendido'] } },
      select: {
        id: true, estado: true, subEstado: true, subEstado3: true,
        pendienteAutorizacion: true, updatedAt: true,
        cargo: TARJETA_CARGO_SELECT,
      },
    }),
    prisma.concursoCeetps.findMany({
      where: { estado: { notIn: ['finalizado', 'desierto'] } },
      select: {
        id: true, estado: true, subEstado: true, updatedAt: true,
        cargo: TARJETA_CARGO_SELECT,
      },
    }),
  ])

  // 4. Siglas de hospitales → supervisor natural
  const siglaRows = await prisma.usuarioSigla.findMany({
    where: { usuario: { role: { slug: { in: [SLUG_SGRASV, SLUG_SUPERVISOR] } } } },
    select: { usuarioId: true, hospitalId: true },
  })
  const siglaMap = new Map<string, string>() // hospitalId → usuarioId
  for (const s of siglaRows) siglaMap.set(s.hospitalId, s.usuarioId)

  // 5. Armar columnas
  type Tarjeta = ReturnType<typeof tarjetaCph> | ReturnType<typeof tarjetaCeetps>
  const columnas = new Map<string, Tarjeta[]>()
  const sinAsignar: Tarjeta[] = []

  for (const sup of supervisores) columnas.set(sup.id, [])

  function clasificar(id: string, tipo: 'concurso_cph' | 'concurso_ceetps', hospitalId: string, tarjeta: Tarjeta) {
    const key = `${id}:${tipo}`
    const asignadoA = asigMap.get(key)
    if (asignadoA) {
      columnas.get(asignadoA)?.push(tarjeta) ?? sinAsignar.push(tarjeta)
    } else {
      const natural = siglaMap.get(hospitalId)
      if (natural && columnas.has(natural)) columnas.get(natural)!.push(tarjeta)
      else sinAsignar.push(tarjeta)
    }
  }

  for (const c of cphs)   clasificar(c.id, 'concurso_cph',    c.cargo.hospital.id, tarjetaCph(c))
  for (const c of ceetps) clasificar(c.id, 'concurso_ceetps', c.cargo.hospital.id, tarjetaCeetps(c))

  // 6. Respuesta
  return {
    sinAsignar,
    columnas: supervisores.map((sup) => ({
      usuario: {
        id: sup.id, nombre: sup.nombre, apellido: sup.apellido,
        username: sup.username, rolSlug: sup.role.slug,
      },
      siglas: sup.siglas.map((s) => s.hospital),
      concursos: columnas.get(sup.id) ?? [],
    })),
  }
}

// ─── S25-4: POST /asignar ─────────────────────────────────────────────────────
export async function asignarConcursoService(
  referenciaId: string,
  referenciaTipo: 'concurso_cph' | 'concurso_ceetps',
  usuarioId: string | null,
  solicitanteId: string,
  solicitanteRolSlug: string,
) {
  // Validar que el destino sea descendiente del solicitante (o null = liberar)
  if (usuarioId !== null) {
    const descendientes = await slugsDescendientes(solicitanteRolSlug)
    const destino = await prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { role: { select: { slug: true } } },
    })
    if (!destino) throw AppError.notFound('Usuario destino no encontrado')
    // Admin puede asignar a cualquiera; el resto solo a descendientes
    if (solicitanteRolSlug !== 'admin' && !descendientes.includes(destino.role.slug)) {
      throw AppError.forbidden('Solo podés asignar a supervisores bajo tu jerarquía')
    }
  }

  // Upsert en concursos_asignados
  return prisma.concursoAsignado.upsert({
    where: { referenciaId_referenciaTipo: { referenciaId, referenciaTipo } },
    create: { referenciaId, referenciaTipo, usuarioId, asignadoPorId: solicitanteId },
    update: { usuarioId, asignadoPorId: solicitanteId, updatedAt: new Date() },
  })
}

// ─── S25-5: GET /kanban-supervisor ───────────────────────────────────────────
// Concursos visibles = siglas propias UNION asignados directamente.
// Agrupados en 5 columnas: no_iniciado, pendiente_autorizacion, en_proceso,
// finalizado, novedades.
export async function getKanbanSupervisorService(usuarioId: string, novedadesDias: number) {
  // IDs de hospitales del supervisor
  const siglaRows = await prisma.usuarioSigla.findMany({
    where: { usuarioId },
    select: { hospitalId: true },
  })
  const hospitalIds = siglaRows.map((s) => s.hospitalId)

  // Asignaciones directas
  const asignados = await prisma.concursoAsignado.findMany({
    where: { usuarioId },
    select: { referenciaId: true, referenciaTipo: true },
  })
  const asigCphIds    = asignados.filter((a) => a.referenciaTipo === 'concurso_cph').map((a) => a.referenciaId)
  const asigCeetpsIds = asignados.filter((a) => a.referenciaTipo === 'concurso_ceetps').map((a) => a.referenciaId)

  const novedadesDesde = new Date(Date.now() - novedadesDias * 86_400_000)

  const [cphs, ceetps] = await Promise.all([
    prisma.concursoCph.findMany({
      where: {
        OR: [
          ...(hospitalIds.length > 0 ? [{ cargo: { hospitalId: { in: hospitalIds } } }] : []),
          ...(asigCphIds.length > 0  ? [{ id: { in: asigCphIds } }] : []),
        ],
      },
      select: {
        id: true, estado: true, subEstado: true, subEstado3: true,
        pendienteAutorizacion: true, updatedAt: true,
        cargo: TARJETA_CARGO_SELECT,
      },
    }),
    prisma.concursoCeetps.findMany({
      where: {
        OR: [
          ...(hospitalIds.length > 0  ? [{ cargo: { hospitalId: { in: hospitalIds } } }] : []),
          ...(asigCeetpsIds.length > 0 ? [{ id: { in: asigCeetpsIds } }] : []),
        ],
      },
      select: {
        id: true, estado: true, subEstado: true, updatedAt: true,
        cargo: TARJETA_CARGO_SELECT,
      },
    }),
  ])

  // Columnas
  const cols = {
    no_iniciado:            [] as ReturnType<typeof tarjetaCph | typeof tarjetaCeetps>[],
    pendiente_autorizacion: [] as ReturnType<typeof tarjetaCph | typeof tarjetaCeetps>[],
    en_proceso:             [] as ReturnType<typeof tarjetaCph | typeof tarjetaCeetps>[],
    finalizado:             [] as ReturnType<typeof tarjetaCph | typeof tarjetaCeetps>[],
    novedades:              [] as ReturnType<typeof tarjetaCph | typeof tarjetaCeetps>[],
  }

  for (const c of cphs) {
    const t = tarjetaCph(c)
    if (c.estado === 'no_iniciado')                                    cols.no_iniciado.push(t)
    else if (c.pendienteAutorizacion)                                  cols.pendiente_autorizacion.push(t)
    else if (c.estado === 'activo')                                    cols.en_proceso.push(t)
    else if (c.estado === 'finalizado' || c.estado === 'suspendido')   cols.finalizado.push(t)
    if (c.estado !== 'finalizado' && c.estado !== 'suspendido' && c.updatedAt >= novedadesDesde)
      cols.novedades.push(t)
  }

  for (const c of ceetps) {
    const t = tarjetaCeetps(c)
    if (c.estado === 'sin_autorizar')                                  cols.no_iniciado.push(t)
    else if (c.estado === 'autorizado')                                cols.pendiente_autorizacion.push(t)
    else if (c.estado === 'en_proceso')                                cols.en_proceso.push(t)
    else if (c.estado === 'finalizado' || c.estado === 'desierto')     cols.finalizado.push(t)
    if (c.estado !== 'finalizado' && c.estado !== 'desierto' && c.updatedAt >= novedadesDesde)
      cols.novedades.push(t)
  }

  return { novedadesDias, columnas: cols }
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
