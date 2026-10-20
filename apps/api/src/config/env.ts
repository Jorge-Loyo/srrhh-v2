import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),
  PYTHON_SERVICE_URL: z.string().url(),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
})

// Bajo Vitest (process.env.VITEST) se completan valores placeholder para las
// variables requeridas: los tests unitarios importan services que dependen de
// este módulo sólo por funciones puras (p. ej. resolverUsuarioLogin), y no se
// debe matar el proceso de test por falta de env. En development/production el
// comportamiento no cambia: la validación corre y aborta si algo falta.
const parseEnv = () =>
  process.env.VITEST
    ? {
        DATABASE_URL: 'postgresql://test',
        JWT_SECRET: 'x'.repeat(32),
        PYTHON_SERVICE_URL: 'http://localhost',
        ...process.env,
      }
    : process.env

const parsed = envSchema.safeParse(parseEnv())

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
