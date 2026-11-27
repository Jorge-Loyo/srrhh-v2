// Logger singleton para services que corren fuera del contexto de request
// (no tienen acceso a request.log de Fastify). Usa pino directamente con la
// misma configuración que el servidor: pino-pretty en development, JSON en prod.
import pino from 'pino'
import { env } from '../config/env.js'

export const logger = pino(
  { level: env.LOG_LEVEL },
  env.NODE_ENV === 'development'
    ? pino.transport({ target: 'pino-pretty', options: { colorize: true } })
    : undefined,
)
