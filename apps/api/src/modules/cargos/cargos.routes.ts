import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { cargosQuerySchema, createCargoSchema, altasQuerySchema } from './cargos.schema.js'
import { listCargosService, listPuestosCargosService, getCargoByIdService, createCargoService, listAltasService } from './cargos.service.js'

export async function cargosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /puestos — valores distintos de literal_puesto para el filtro
  app.get('/puestos', async (request, reply) => {
    const { escalafonId, hospitalId } = request.query as { escalafonId?: string; hospitalId?: string }
    const data = await listPuestosCargosService(escalafonId, hospitalId)
    return reply.send({ data })
  })

  // GET /altas — S7-4: historial persistente de altas manuales
  app.get('/altas', async (request, reply) => {
    const query = altasQuerySchema.parse(request.query)
    const result = await listAltasService(query)
    return reply.send(result)
  })

  // GET / — S3-4 + S3-3: listado paginado con filtros
  app.get('/', async (request, reply) => {
    const query = cargosQuerySchema.parse(request.query)
    const result = await listCargosService(query)
    return reply.send(result)
  })

  // POST / — S5-10 + S7-2: Alta de Cargo manual
  app.post('/', { preHandler: requirePermiso({ modulo: 'cargos', accion: 'crear' }) }, async (request, reply) => {
    const body = createCargoSchema.parse(request.body)
    const data = await createCargoService(body, (request.user as { id?: string })?.id)
    return reply.status(201).send({ data })
  })

  // GET /:id — S3-5: detalle con ocupación actual
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const cargo = await getCargoByIdService(request.params.id)
    return reply.send({ data: cargo })
  })
}
