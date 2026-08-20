import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError } from '../errors/AppError.js'

export async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    throw AppError.unauthorized()
  }
}
