import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'

const WRITE_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Campos que nunca se guardan en texto plano en `cambios` — mismo criterio
// que el middleware legacy (`app/src/middlewares/audit.js`).
const CAMPOS_SENSIBLES = ['password', 'passwordHash', 'token', 'refreshToken', 'authorization']
const CAMBIOS_MAX_LEN = 4000

// Recursivo (a diferencia de la versión anterior que solo miraba el primer
// nivel) — la respuesta de varios endpoints anida el recurso bajo `data`
// (ej. `{ data: { usuario: { passwordHash: ... } } }`), así que enmascarar
// solo el nivel superior dejaba pasar secretos anidados.
function maskBody(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskBody)
  if (!value || typeof value !== 'object') return value
  const masked: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    masked[key] = CAMPOS_SENSIBLES.some((s) => key.toLowerCase().includes(s.toLowerCase())) ? '***' : maskBody(v)
  }
  return masked
}

// La respuesta llega como string ya serializado (Fastify serializa antes de
// onSend) — pero puede ser un Buffer/stream (ej. descarga de archivo) o no
// ser JSON en absoluto, así que nunca se asume el formato.
function parsearPayload(payload: unknown): unknown {
  if (typeof payload !== 'string' || payload.length === 0) return undefined
  try {
    return JSON.parse(payload)
  } catch {
    return undefined
  }
}

function truncar(value: unknown): unknown {
  const json = JSON.stringify(value)
  if (json.length <= CAMBIOS_MAX_LEN) return value
  return { _truncado: true, preview: json.slice(0, CAMBIOS_MAX_LEN) }
}

// Verbos de negocio explícitos en la URL (ej. POST /padron/snapshots/:id/
// rechazar, PATCH /usuarios/:id/desactivar) — sin esto, CUALQUIER endpoint de
// este tipo en CUALQUIER módulo quedaba etiquetado con el CRUD genérico por
// verbo HTTP ("create"/"update"), aunque fuera literalmente lo opuesto (ej.
// "rechazar" mostrado como "Creación"). Lista construida barriendo TODOS los
// `apps/api/src/modules/*/*.routes.ts` (no adivinada) y verificando, para cada
// uno, que ningún caso especial de más arriba lo intercepte antes (ver nota
// de `revocar` abajo, que sí lo estaba) — agregar acá el que corresponda si
// aparece un endpoint de este tipo en un módulo nuevo, pero repetir esa
// verificación, no alcanza con agregarlo a esta lista.
const VERBOS_NEGOCIO = new Set([
  'activar', 'desactivar', 'aprobar', 'rechazar', 'asignar', 'desasignar', 'leer', 'password',
])

// Nombres de acción de negocio (migrado del criterio del middleware legacy,
// que resolvía `login_success`/`login_fail`/`create`/`update`/`delete`/
// `token_revoke`/etc. en vez de exponer el verbo HTTP crudo). Casos
// especiales primero (por path), después el verbo de negocio en la URL si
// hay uno, fallback genérico por método al final.
//
// `tokens` tiene 2 rutas con "revocar" en el path (`/:id/revocar` y
// `/usuario/:id/revocar-todos`, ver tokens.routes.ts) — por eso NO están en
// VERBOS_NEGOCIO: si estuvieran, jamás se alcanzarían (este caso especial
// corre primero) y quedarían como opciones muertas en el filtro de la
// pantalla — exactamente el bug reportado 2026-09-14 ("cosas que no deberían
// existir"). `endsWith` en vez de `includes` porque antes "revocar-todos"
// también matcheaba "/revocar" como substring y las dos rutas se
// confundían bajo el mismo nombre, perdiendo la distinción entre revocar
// UN token y revocar TODAS las sesiones de un usuario (una acción bastante
// más grande) — eran indistinguibles en el log.
function resolverAccion(method: string, entidad: string, path: string, statusCode: number): string {
  if (entidad === 'auth') {
    if (path.endsWith('/login')) return statusCode < 400 ? 'login_success' : 'login_fail'
    if (path.endsWith('/logout')) return 'logout'
    if (path.endsWith('/refresh')) return 'refresh'
  }
  if (entidad === 'tokens') {
    if (path.endsWith('/revocar-todos')) return 'token_revoke_all'
    if (path.endsWith('/revocar')) return 'token_revoke'
  }
  if (entidad === 'auditoria' && path.endsWith('/purgar')) return 'purge'

  const segmentos = path.split('/').filter(Boolean)
  const ultimoSegmento = segmentos[segmentos.length - 1]
  if (ultimoSegmento && VERBOS_NEGOCIO.has(ultimoSegmento)) {
    return ultimoSegmento === 'password' ? 'cambiar_password' : ultimoSegmento
  }

  switch (method) {
    case 'POST': return 'create'
    case 'PATCH':
    case 'PUT': return 'update'
    case 'DELETE': return 'delete'
    default: return method.toLowerCase()
  }
}

// Hook `onSend` (no `onResponse`): es el único punto donde Fastify todavía
// tiene el payload de la respuesta a mano antes de mandarlo al cliente. Antes
// esto corría en `onResponse` y solo veía `request.body` — para un DELETE
// (sin body) o un error de negocio (409/404 de AppError) no quedaba
// registrado NADA de lo que realmente pasó, solo el status code. Ahora se
// guarda también la respuesta real: en un error trae `{error:{code,message}}`
// (el motivo exacto del rechazo) y en un éxito trae `{data:{...}}` (lo que se
// creó/devolvió) — hallazgo 2026-09-14 revisando la pantalla de Auditoría.
//
// Contrato de un hook onSend: SIEMPRE hay que devolver el payload (si no se
// modifica, tal cual llegó) — por eso cada `return` de acá abajo devuelve
// `payload`, nunca `undefined`, y todo el cuerpo está en un try/catch que
// nunca deja escapar un error (una falla acá no puede romper la respuesta
// real al usuario).
export async function auditLog(request: FastifyRequest, reply: FastifyReply, payload: unknown) {
  try {
    if (!WRITE_METHODS.includes(request.method)) return payload

    const parts = request.url.split('?')[0]!.split('/')
    const entidad = parts[3] ?? 'unknown' // /api/v1/{entidad}/...
    const entidadId = parts.find((p) => UUID_RE.test(p)) ?? null

    const user = request.user as { id: string; username?: string } | undefined
    // Login/logout/refresh pasan por acá SIN request.user poblado (todavía no
    // hay sesión, o la sesión recién termina) — a diferencia del resto de las
    // rutas de escritura, que siempre están detrás de `authenticate`. Se
    // registran igual (con usuarioId null): quién intentó loguearse importa
    // tanto como quién ya está adentro, y el intento queda en `cambios.request`
    // (username enmascarado de contraseña).
    if (!user && entidad !== 'auth') return payload

    const rutaCompleta = parts.join('/')
    const accion = resolverAccion(request.method, entidad, rutaCompleta, reply.statusCode)
    const cambios = truncar({
      status: reply.statusCode,
      request: maskBody(request.body),
      response: maskBody(parsearPayload(payload)),
    }) as Prisma.InputJsonValue

    await prisma.auditLog.create({
      data: {
        usuarioId: user?.id ?? null,
        accion,
        entidad,
        entidadId,
        metodo: request.method,
        ruta: rutaCompleta.slice(0, 300),
        cambios,
        ip: request.ip,
      },
    })
  } catch {
    // Nunca romper el request por un fallo al auditar (mismo criterio que el
    // middleware legacy — logging silencioso, best-effort).
  }
  return payload
}
