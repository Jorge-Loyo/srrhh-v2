import type { FastifyInstance } from 'fastify'
import { loginSchema } from './auth.schema.js'
import { loginService } from './auth.service.js'

// Nombre de la cookie httpOnly que transporta el refresh token.
// Mismo valor en login (Set-Cookie) y en refresh/logout (lectura).
const REFRESH_COOKIE = 'srrhh_rt'

// Opciones base de la cookie: httpOnly impide acceso desde JS (mitiga XSS),
// sameSite:'lax' protege contra CSRF en navegación normal, secure:true en
// producción fuerza HTTPS. Path acotado a /api/v1/auth para que el browser
// solo envíe la cookie en los endpoints que la necesitan.
function cookieOpts(maxAgeSeconds: number, isProduction: boolean) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/api/v1/auth',
    maxAge: maxAgeSeconds,
  }
}

// Parsea "7d", "30d", "1h", etc. a segundos.
function parseDuration(s: string): number {
  const m = /^(\d+)([dhms])$/.exec(s)
  if (!m) return 7 * 86400
  const v = parseInt(m[1]!)
  return m[2] === 'd' ? v * 86400 : m[2] === 'h' ? v * 3600 : m[2] === 'm' ? v * 60 : v
}

export async function authRoutes(app: FastifyInstance) {
  const isProd = process.env.NODE_ENV === 'production'
  const refreshMaxAge = parseDuration(process.env.JWT_REFRESH_EXPIRES ?? '7d')

  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)
    const result = await loginService(body, (payload: object) => app.jwt.sign(payload))
    return reply.send({ data: result })
  })

  app.post('/logout', async (_request, reply) => {
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' })
    return reply.send({ data: { ok: true } })
  })
}
