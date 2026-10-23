import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { cargosQuerySchema, createCargoSchema, altasQuerySchema, cargosExportQuerySchema } from './cargos.schema.js'
import { listCargosService, listPuestosCargosService, getCargoByIdService, createCargoService, listAltasService, exportCargosService } from './cargos.service.js'

export async function cargosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /puestos — catálogo PuestoCargo (con especialidades anidadas) por escalafón
  app.get('/puestos', async (request, reply) => {
    const { escalafonId } = request.query as { escalafonId?: string }
    const data = await listPuestosCargosService(escalafonId)
    return reply.send({ data })
  })

  // GET /altas — S7-4: historial persistente de altas manuales
  app.get('/altas', async (request, reply) => {
    const query = altasQuerySchema.parse(request.query)
    const result = await listAltasService(query)
    return reply.send(result)
  })

  // GET /export — export de /cargos: universo completo (solo excluye borrados
  // lógicos), SIN filtros de pantalla, con las 9 columnas ya resueltas.
  // Declarado ANTES de GET /:id para que no lo capture la ruta param.
  app.get('/export', async (request, reply) => {
    const query = cargosExportQuerySchema.parse(request.query)
    const result = await exportCargosService(query)
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
