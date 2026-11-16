import { z } from 'zod'
import { queryBool } from '../../shared/queryBool.js'

export const TIPOS_NOTIFICACION = [
  'concurso_estancado',
  'baja_pendiente',
  'autorizacion_pendiente',
  'autorizacion_resuelta',
  'concurso_iniciado',
  'vencimiento_conduccion',
] as const

export const notificacionesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  tipo: z.enum(TIPOS_NOTIFICACION).optional(),
  // Varios tipos separados por coma (pestañas que agrupan tipos): se filtra en la
  // base, así el total y la paginación corresponden a la pestaña.
  tipos: z
    .string()
    .transform((s) => s.split(',').map((t) => t.trim()).filter(Boolean))
    .pipe(z.array(z.enum(TIPOS_NOTIFICACION)).min(1))
    .optional(),
  soloNoLeidas: queryBool.optional(),
})

export type NotificacionesQuery = z.infer<typeof notificacionesQuerySchema>
