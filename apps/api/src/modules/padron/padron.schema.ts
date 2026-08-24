import { z } from 'zod'

export const uploadPadronSchema = z.object({
  fechaAsignada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido'),
})

export const diffQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  tipo:  z.enum(['nuevo', 'modificado', 'eliminado']).optional(),
})

export type UploadPadronBody = z.infer<typeof uploadPadronSchema>
export type DiffQuery = z.infer<typeof diffQuerySchema>
