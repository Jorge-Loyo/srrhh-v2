import { z } from 'zod'

export const siglaSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{2,10}$/, 'Formato de sigla inválido (esperado: 2-10 caracteres alfanuméricos)')
  .transform((s) => s.toUpperCase())

export const pouQuerySchema = z.object({
  sigla: siglaSchema,
})
export type PouQuery = z.infer<typeof pouQuerySchema>

const MIN_SIGLAS_COMPARAR = 2
const MAX_SIGLAS_COMPARAR = 50

// Puerto de parseSiglasComparar (pouController.js de la app vieja): ?siglas=A,B,C
export const pouCompararQuerySchema = z.object({
  siglas: z
    .string()
    .trim()
    .transform((raw) => [...new Set(raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))])
    .pipe(
      z
        .array(z.string().regex(/^[A-Za-z0-9]{2,10}$/, 'Formato de sigla inválido'))
        .min(MIN_SIGLAS_COMPARAR, `Se requieren al menos ${MIN_SIGLAS_COMPARAR} hospitales para comparar`)
        .max(MAX_SIGLAS_COMPARAR, `Máximo ${MAX_SIGLAS_COMPARAR} hospitales por comparación`)
    ),
})
export type PouCompararQuery = z.infer<typeof pouCompararQuerySchema>
