import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { AppError } from '../../shared/errors/AppError.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { corregirTipoSchema } from '../concursos/corregirTipo.schema.js'
import { corregirTipoConcursoService } from '../concursos/corregirTipo.service.js'
import { concursosCeetpsQuerySchema, patchConcursoCeetpsSchema, designarCeetpsSchema } from './concursos-ceetps.schema.js'
import {
  listConcursosCeetpsService,
  getConcursoCeetpsByIdService,
  patchConcursoCeetpsService,
  designarConcursoCeetpsService,
} from './concursos-ceetps.service.js'

const WRITE_PERMISO = { modulo: 'concursos-ceetps', accion: 'editar' }

export async function concursosCeetpsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET / — S5-1: listado paginado con filtros
  app.get('/', async (request, reply) => {
    const query = concursosCeetpsQuerySchema.parse(request.query)
    const result = await listConcursosCeetpsService(query)
    return reply.send(result)
  })

  // GET /:id — S5-1: detalle completo
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const data = await getConcursoCeetpsByIdService(request.params.id)
    return reply.send({ data })
  })

  // PATCH /:id — S5-1: actualizar campos por fase (estado calculado server-side)
  app.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const usuarioId = (request as any).user?.id as string | undefined
      if (!usuarioId) throw AppError.unauthorized('Sesion requerida')
      const body = patchConcursoCeetpsSchema.parse(request.body)
      const data = await patchConcursoCeetpsService(request.params.id, body, usuarioId)
      return reply.send({ data })
    }
  )

  // POST /:id/corregir-tipo — Paso 5a: CEETPS -> CPH, solo quien autoriza (se valida en el service)
  app.post<{ Params: { id: string } }>('/:id/corregir-tipo', async (request, reply) => {
    const usuarioId = (request as any).user?.id as string | undefined
    if (!usuarioId) throw AppError.unauthorized('Sesion requerida')
    const body = corregirTipoSchema.parse(request.body)
    const data = await corregirTipoConcursoService('ceetps', request.params.id, body, usuarioId)
    return reply.send({ data })
  })
  // POST /:id/designar — S16-2: registra la designación, crea Ocupacion, avanza a finalizado
  app.post<{ Params: { id: string } }>(
    '/:id/designar',
    { preHandler: requirePermiso(WRITE_PERMISO) },
    async (request, reply) => {
      const body = designarCeetpsSchema.parse(request.body)
      const data = await designarConcursoCeetpsService(request.params.id, body)
      return reply.send({ data })
    }
  )
}
