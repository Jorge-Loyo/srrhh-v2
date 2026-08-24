import type { FastifyReply, FastifyRequest } from 'fastify'
import type { RolUsuario } from '@srrhh/types'
import { AppError } from '../errors/AppError.js'

export function requireRole(roles: RolUsuario[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const user = request.user as { rol: RolUsuario }
    if (!user || !roles.includes(user.rol)) {
      throw AppError.forbidden()
    }
  }
}
