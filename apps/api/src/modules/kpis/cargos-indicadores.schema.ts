import { z } from 'zod'

export const cargosIndicadoresQuerySchema = z.object({
  // 'YYYY-MM'. Ausente = mes en curso. Que no sea futuro lo valida resolverPeriodos (requiere `hoy`).
  mes: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .refine((m) => m >= '2020-01', { message: 'mes inválido' })
    .optional(),
  hospitalId: z.string().uuid().optional(),
  codigoRegistroId: z.string().uuid().optional(),
})
export type CargosIndicadoresQuery = z.infer<typeof cargosIndicadoresQuerySchema>
