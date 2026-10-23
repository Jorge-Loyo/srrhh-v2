import { z } from 'zod'

export const tareasQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  estado: z.enum(['pendiente', 'resuelta']).optional(),
  tipo: z.string().max(50).optional(),
})

export type TareasQuery = z.infer<typeof tareasQuerySchema>
