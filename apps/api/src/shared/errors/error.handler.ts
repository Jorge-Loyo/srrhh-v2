import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { AppError } from './AppError.js'

export function errorHandler(
  error: FastifyError | AppError | ZodError | Error,
  _request: FastifyRequest,
  reply: FastifyReply
) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    })
  }

  // Errores de validación de Zod (schema.parse() dentro de un handler, ej.
  // loginSchema / createUsuarioSchema) — sin este caso, caían al 500 genérico
  // de más abajo en vez de un 400 con el detalle del campo que falló.
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request inválido',
        details: error.flatten().fieldErrors,
      },
    })
  }

  // Errores de validación de Fastify
  if ('validation' in error && error.validation) {
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request inválido',
        details: error.validation,
      },
    })
  }

  // Error genérico
  reply.log.error(error)
  return reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor',
    },
  })
}
