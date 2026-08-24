import './config/env.js' // Valida variables al arrancar
import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { env } from './config/env.js'
import { errorHandler } from './shared/errors/error.handler.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { auditLog } from './shared/middleware/audit.middleware.js'
import { personasRoutes } from './modules/personas/personas.routes.js'
import { cargosRoutes } from './modules/cargos/cargos.routes.js'
import { padronRoutes } from './modules/padron/padron.routes.js'
import { concursosCphRoutes } from './modules/concursos-cph/concursos-cph.routes.js'
import { concursosCeetpsRoutes } from './modules/concursos-ceetps/concursos-ceetps.routes.js'
import { hospitalesRoutes } from './modules/hospitales/hospitales.routes.js'
import { usuariosRoutes } from './modules/usuarios/usuarios.routes.js'
import { kpisRoutes } from './modules/kpis/kpis.routes.js'

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    ...(env.NODE_ENV === 'development' && {
      transport: { target: 'pino-pretty', options: { colorize: true } },
    }),
  },
})

// Plugins de seguridad
await app.register(helmet)
await app.register(rateLimit, { max: 200, timeWindow: '1 minute' })
await app.register(cors, {
  origin: env.CORS_ORIGINS.split(','),
  credentials: true,
})
await app.register(jwt, {
  secret: env.JWT_SECRET,
  sign: { expiresIn: env.JWT_ACCESS_EXPIRES },
})

// Error handler global
app.setErrorHandler(errorHandler)

// Audit log en todas las rutas autenticadas
app.addHook('preHandler', auditLog)

// Health check (público)
app.get('/health', async () => ({
  status: 'ok',
  service: 'srrhh-api',
  timestamp: new Date().toISOString(),
}))

// Rutas
await app.register(authRoutes, { prefix: '/api/v1/auth' })
await app.register(personasRoutes, { prefix: '/api/v1/personas' })
await app.register(cargosRoutes, { prefix: '/api/v1/cargos' })
await app.register(padronRoutes, { prefix: '/api/v1/padron' })
await app.register(concursosCphRoutes, { prefix: '/api/v1/concursos-cph' })
await app.register(concursosCeetpsRoutes, { prefix: '/api/v1/concursos-ceetps' })
await app.register(hospitalesRoutes, { prefix: '/api/v1/hospitales' })
await app.register(usuariosRoutes, { prefix: '/api/v1/usuarios' })
await app.register(kpisRoutes, { prefix: '/api/v1/kpis' })

// Start
try {
  await app.listen({ port: env.PORT, host: env.HOST })
  console.log(`🚀 SRRHH API corriendo en http://${env.HOST}:${env.PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
