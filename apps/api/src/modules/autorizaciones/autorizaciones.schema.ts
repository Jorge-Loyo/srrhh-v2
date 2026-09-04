import { z } from 'zod'

export const autorizacionesQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  tipo:  z.enum(['concurso_cph', 'alta_cargo']).optional(),
})

export const resolverAutorizacionSchema = z.object({
  observaciones: z.string().max(1000).optional(),
})

export type AutorizacionesQuery      = z.infer<typeof autorizacionesQuerySchema>
export type ResolverAutorizacionBody = z.infer<typeof resolverAutorizacionSchema>
