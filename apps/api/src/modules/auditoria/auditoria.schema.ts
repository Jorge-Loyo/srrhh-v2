import { z } from 'zod'

export const listAuditoriaQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  accion: z.string().trim().min(1).optional(),
  entidad: z.string().trim().min(1).optional(),
  usuarioId: z.string().uuid().optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
})

export type ListAuditoriaQuery = z.infer<typeof listAuditoriaQuerySchema>

// Legacy tenía una inconsistencia entre el default de purga manual (180
// días) y el del scheduler automático (30 días) — acá un solo número, sin
// scheduler todavía (purga siempre manual, por ahora).
export const purgeAuditoriaSchema = z.object({
  dias: z.coerce.number().int().min(1).default(180),
})

export type PurgeAuditoriaBody = z.infer<typeof purgeAuditoriaSchema>
