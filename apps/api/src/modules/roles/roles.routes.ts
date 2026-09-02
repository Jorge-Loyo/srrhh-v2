import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { createRoleSchema, updateRoleSchema, setRolePermisosSchema } from './roles.schema.js'
import { listRoles, createRole, updateRole, deleteRole, setRolePermisos } from './roles.service.js'

export async function rolesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requirePermiso({ modulo: 'configuracion', accion: 'gestionar_permisos' }))

  app.get('/', async (_request, reply) => {
    const roles = await listRoles()
    return reply.send({ data: roles })
  })

  app.post('/', async (request, reply) => {
    const body = createRoleSchema.parse(request.body)
    const role = await createRole(body)
    return reply.status(201).send({ data: role })
  })

  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const body = updateRoleSchema.parse(request.body)
    const role = await updateRole(request.params.id, body)
    return reply.send({ data: role })
  })

  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    await deleteRole(request.params.id)
    return reply.status(204).send()
  })

  app.put<{ Params: { id: string } }>('/:id/permisos', async (request, reply) => {
    const body = setRolePermisosSchema.parse(request.body)
    const role = await setRolePermisos(request.params.id, body.permisoIds)
    return reply.send({ data: role })
  })
}
