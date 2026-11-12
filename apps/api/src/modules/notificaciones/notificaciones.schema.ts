import { z } from 'zod'
import { queryBool } from '../../shared/queryBool.js'

export const notificacionesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  tipo: z
    .enum([
      'concurso_estancado',
      'baja_pendiente',
      'autorizacion_pendiente',
      'autorizacion_resuelta',
      'concurso_iniciado',
      'vencimiento_conduccion',
    ])
    .optional(),
  soloNoLeidas: queryBool.optional(),
})

export type NotificacionesQuery = z.infer<typeof notificacionesQuerySchema>
