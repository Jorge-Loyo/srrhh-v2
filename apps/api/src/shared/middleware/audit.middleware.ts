import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'

const WRITE_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Campos que nunca se guardan en texto plano en `cambios` — mismo criterio
// que el middleware legacy (`app/src/middlewares/audit.js`).
const CAMPOS_SENSIBLES = ['password', 'passwordHash', 'token', 'refreshToken', 'authorization']
const CAMBIOS_MAX_LEN = 4000

function maskBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body
  const masked: Record<string, unknown> = { ...(body as Record<string, unknown>) }
  for (const key of Object.keys(masked)) {
    if (CAMPOS_SENSIBLES.some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
      masked[key] = '***'
    }
  }
  return masked
}

function truncar(value: unknown): unknown {
  const json = JSON.stringify(value)
  if (json.length <= CAMBIOS_MAX_LEN) return value
  return { _truncado: true, preview: json.slice(0, CAMBIOS_MAX_LEN) }
}

// Nombres de acción de negocio (migrado del criterio del middleware legacy,
// que resolvía `login_success`/`login_fail`/`create`/`update`/`delete`/
// `token_revoke`/etc. en vez de exponer el verbo HTTP crudo). Casos
// especiales primero (por path), fallback genérico por método al final.
function resolverAccion(method: string, entidad: string, path: string, statusCode: number): string {
  if (entidad === 'auth') {
    if (path.endsWith('/login')) return statusCode < 400 ? 'login_success' : 'login_fail'
    if (path.endsWith('/logout')) return 'logout'
    if (path.endsWith('/refresh')) return 'refresh'
  }
  if (entidad === 'tokens' && path.includes('/revocar')) return 'token_revoke'
  if (entidad === 'auditoria' && path.endsWith('/purgar')) return 'purge'

  switch (method) {
    case 'POST': return 'create'
    case 'PATCH':
    case 'PUT': return 'update'
    case 'DELETE': return 'delete'
    default: return method.toLowerCase()
  }
}

export async function auditLog(request: FastifyRequest, reply: FastifyReply) {
  if (!WRITE_METHODS.includes(request.method)) return

  const parts = request.url.split('?')[0]!.split('/')
  const entidad = parts[3] ?? 'unknown' // /api/v1/{entidad}/...
  const entidadId = parts.find((p) => UUID_RE.test(p)) ?? null

  const user = request.user as { id: string; username?: string } | undefined
  // Login/logout/refresh pasan por acá SIN request.user poblado (todavía no
  // hay sesión, o la sesión recién termina) — a diferencia del resto de las
  // rutas de escritura, que siempre están detrás de `authenticate`. Se
  // registran igual (con usuarioId null): quién intentó loguearse importa
  // tanto como quién ya está adentro, y el intento queda en `cambios.body`
  // (username enmascarado de contraseña).
  if (!user && entidad !== 'auth') return

  const accion = resolverAccion(request.method, entidad, parts.join('/'), reply.statusCode)
  const cambios = truncar({ status: reply.statusCode, body: maskBody(request.body) }) as Prisma.InputJsonValue

  try {
    await prisma.auditLog.create({
      data: {
        usuarioId: user?.id ?? null,
        accion,
        entidad,
        entidadId,
        cambios,
        ip: request.ip,
      },
    })
  } catch {
    // Nunca romper el request por un fallo al auditar (mismo criterio que el
    // middleware legacy — logging silencioso, best-effort).
  }
}
