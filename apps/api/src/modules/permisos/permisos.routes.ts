import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { prisma } from '../../shared/prisma.js'

// Catálogo completo — cada fila es un punto de aplicación real o reservado
// (autorizaciones/notificaciones, Sprint 10/11) de requirePermiso en el backend.
// Lo consume ConfiguracionPermisosPage para renderizar la matriz módulo → acción.
export async function permisosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requirePermiso({ modulo: 'configuracion', accion: 'gestionar_permisos' }))

  app.get('/', async (_request, reply) => {
    const permisos = await prisma.permiso.findMany({
      orderBy: [{ modulo: 'asc' }, { accion: 'asc' }],
    })
    return reply.send({ data: permisos })
  })
}
