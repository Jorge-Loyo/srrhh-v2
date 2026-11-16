import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { z } from 'zod'
import { createUsuarioSchema, updateUsuarioSchema, setSiglasSchema } from './usuarios.schema.js'
import {
  listUsuarios,
  createUsuario,
  updateUsuario,
  setUsuarioActivo,
  changePassword,
  getSupervisoresService,
  setSiglasService,
  getMisSiglasService,
} from './usuarios.service.js'

export async function usuariosRoutes(app: FastifyInstance) {
  // ── S25-2: rutas de siglas/supervisores — solo autenticación ─────────────────
  await app.register(async (sub) => {
    sub.addHook('preHandler', authenticate)

    sub.get('/supervisores', {
      preHandler: requirePermiso([
        { modulo: 'tareas', accion: 'ver_kanban_sgrasv' },
        { modulo: 'tareas', accion: 'asignar_concurso' },
      ]),
    }, async (_request, reply) => {
      const data = await getSupervisoresService()
      return reply.send({ data })
    })

    sub.get('/me/siglas', async (request, reply) => {
      const user = request.user as { id: string }
      const data = await getMisSiglasService(user.id)
      return reply.send({ data })
    })

    sub.put('/:id/siglas', {
      preHandler: requirePermiso({ modulo: 'tareas', accion: 'asignar_concurso' }),
    }, async (request, reply) => {
      const { id } = request.params as { id: string }
      const { hospitalIds } = setSiglasSchema.parse(request.body)
      const data = await setSiglasService(id, hospitalIds)
      return reply.send({ data })
    })
  })

  // ── Rutas de administración — requieren gestionar_usuarios ───────────────────
  await app.register(async (sub) => {
    sub.addHook('preHandler', authenticate)
    sub.addHook('preHandler', requirePermiso({ modulo: 'configuracion', accion: 'gestionar_usuarios' }))

    sub.get('/', async (_request, reply) => {
      const usuarios = await listUsuarios()
      return reply.send({ data: usuarios })
    })

    sub.post('/', async (request, reply) => {
      const body = createUsuarioSchema.parse(request.body)
      const usuario = await createUsuario(body)
      return reply.status(201).send({ data: usuario })
    })

    sub.patch<{ Params: { id: string } }>('/:id/activar', async (request, reply) => {
      const requestingUser = request.user as { id: string }
      const usuario = await setUsuarioActivo(request.params.id, true, requestingUser.id)
      return reply.send({ data: usuario })
    })

    sub.patch<{ Params: { id: string } }>('/:id/desactivar', async (request, reply) => {
      const requestingUser = request.user as { id: string }
      const usuario = await setUsuarioActivo(request.params.id, false, requestingUser.id)
      return reply.send({ data: usuario })
    })

    sub.patch<{ Params: { id: string } }>('/:id/password', async (request, reply) => {
      const { password } = z.object({ password: z.string().min(8) }).parse(request.body)
      await changePassword(request.params.id, password)
      return reply.send({ ok: true })
    })

    sub.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
      const body = updateUsuarioSchema.parse(request.body)
      const usuario = await updateUsuario(request.params.id, body)
      return reply.send({ data: usuario })
    })
  })
}
