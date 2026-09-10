import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { getCadenaMandoService } from './cadena-mando.service.js'

export async function cadenaMandoRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /cadena-mando?personaId=xxx  o  ?codigoRepa=xxx
  app.get('/', async (request, reply) => {
    const { personaId, codigoRepa } = request.query as { personaId?: string; codigoRepa?: string }
    if (!personaId && !codigoRepa) {
      return reply.status(400).send({ error: 'Se requiere personaId o codigoRepa' })
    }
    const data = await getCadenaMandoService(
      personaId ? { personaId } : { codigoRepa: codigoRepa! }
    )
    return reply.send({ data })
  })
}
