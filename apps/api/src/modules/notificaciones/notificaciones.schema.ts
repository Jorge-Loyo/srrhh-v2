import { z } from 'zod'

export const notificacionesQuerySchema = z.object({
  page:         z.coerce.number().int().min(1).default(1),
  limit:        z.coerce.number().int().min(1).max(100).default(20),
  tipo:         z.enum(['concurso_estancado', 'baja_pendiente', 'autorizacion_pendiente', 'autorizacion_resuelta']).optional(),
  soloNoLeidas: z.coerce.boolean().optional(),
})

export type NotificacionesQuery = z.infer<typeof notificacionesQuerySchema>
