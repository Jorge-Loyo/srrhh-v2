import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requireRole } from '../../shared/middleware/roles.middleware.js'
import { RolUsuario } from '@srrhh/types'
import { cargosQuerySchema, createCargoSchema } from './cargos.schema.js'
import { listCargosService, listPuestosCargosService, getCargoByIdService, createCargoService } from './cargos.service.js'

const WRITE_ROLES = [RolUsuario.ADMIN, RolUsuario.EDITOR]

export async function cargosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /puestos — valores distintos de literal_puesto para el filtro
  app.get('/puestos', async (request, reply) => {
    const { escalafonId, hospitalId } = request.query as { escalafonId?: string; hospitalId?: string }
    const data = await listPuestosCargosService(escalafonId, hospitalId)
    return reply.send({ data })
  })

  // GET / — S3-4 + S3-3: listado paginado con filtros
  app.get('/', async (request, reply) => {
    const query = cargosQuerySchema.parse(request.query)
    const result = await listCargosService(query)
    return reply.send(result)
  })

  // POST / — S5-10: Alta de Cargo manual
  app.post('/', { preHandler: requireRole(WRITE_ROLES) }, async (request, reply) => {
    const body = createCargoSchema.parse(request.body)
    const data = await createCargoService(body)
    return reply.status(201).send({ data })
  })

  // GET /:id — S3-5: detalle con ocupación actual
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const cargo = await getCargoByIdService(request.params.id)
    return reply.send({ data: cargo })
  })
}
