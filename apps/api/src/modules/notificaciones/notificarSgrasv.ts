import type { Prisma } from '@prisma/client'
import pino from 'pino'
import { prisma } from '../../shared/prisma.js'
import { elegirSlugResolutor } from '../autorizaciones/autorizaciones.service.js'
import { descendientesDeJerarquia } from '../tareas/tareas.service.js'
import { crearNotificacion } from './notificaciones.service.js'
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })
type NotificacionBase = Parameters<typeof crearNotificacion>[0]
// ─── Destinatarios de las notificaciones a SGRASV ────────────────────────────
// El slug real de SGRASV lleva hash (p.ej. 'sgrasv_5ac494e'), por eso se
// resuelve por el permiso autorizaciones.resolver_sgrasv (misma fuente de verdad
// que el flujo de autorizaciones) y se expande a sus roles descendientes.
// Variante TOLERANTE: a diferencia de resolverSlugPorPermiso, si no hay
// exactamente un rol devuelve [] y loguea un warn; notificar no debe abortar la
// operación principal.
export async function slugsDestinatariosSgrasv(
  tx: Prisma.TransactionClient = prisma,
): Promise<string[]> {
  const roles = await tx.role.findMany({
    where: {
      activo: true,
      permisos: { some: { permiso: { modulo: 'autorizaciones', accion: 'resolver_sgrasv' } } },
    },
    select: { slug: true },
    orderBy: { slug: 'asc' },
  })
  const r = elegirSlugResolutor(roles)
  if (!r.ok) {
    logger.warn(
      { motivo: (r as { motivo: string }).motivo, slugs: roles.map((x) => x.slug) },
      'notificarSgrasv: no se pudo resolver un único rol SGRASV; no se notifica',
    )
    return []
  }
  const slug = (r as { slug: string }).slug
  const filas = await tx.roleJerarquia.findMany({
    select: { rolHijoSlug: true, rolPadreSlug: true },
  })
  return [slug, ...descendientesDeJerarquia(filas, slug)]
}
// Crea una notificación por cada rol destinatario (SGRASV + descendientes). El
// origenKey incluye el slug destinatario para que la dedup de crearNotificacion
// siga siendo por rol y no colapse roles distintos.
export function origenKeyPorRol(origenKey: string, rolSlug: string): string {
  return `${origenKey}:${rolSlug}`
}
export async function notificarSgrasvYHijos(
  data: Omit<NotificacionBase, 'rolSlug'>,
  tx: Prisma.TransactionClient = prisma,
): Promise<void> {
  const slugs = await slugsDestinatariosSgrasv(tx)
  for (const rolSlug of slugs) {
    await crearNotificacion({
      ...data,
      rolSlug,
      ...(data.origenKey && { origenKey: origenKeyPorRol(data.origenKey, rolSlug) }),
    })
  }
}
