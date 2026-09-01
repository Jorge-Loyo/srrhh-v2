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

  // Errores nativos de Fastify que no son de "validation" pero ya traen su
  // propio statusCode correcto — ej. FST_ERR_CTP_EMPTY_JSON_BODY /
  // FST_ERR_CTP_INVALID_JSON_BODY (body vacío o JSON malformado con
  // Content-Type: application/json). Sin este caso caían al 500 genérico de
  // abajo pese a ser errores 4xx del cliente, encontrado verificando Sprint 1
  // con un PATCH sin body (2026-08-28).
  if ('statusCode' in error && typeof error.statusCode === 'number' && error.statusCode < 500) {
    return reply.status(error.statusCode).send({
      error: {
        code: 'code' in error && typeof error.code === 'string' ? error.code : 'BAD_REQUEST',
        message: error.message,
      },
    })
  }

  // Error genérico
  reply.log.error(error)
  return reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' ? (error as Error).message : 'Error interno del servidor',
      ...(process.env.NODE_ENV === 'development' ? { stack: (error as Error).stack?.split('\n').slice(0, 5) } : {}),
    },
  })
}
