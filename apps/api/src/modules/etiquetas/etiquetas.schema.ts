import { z } from 'zod'

export const etiquetasQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  activo: z.coerce.boolean().optional(),
})

export const createEtiquetaSchema = z.object({
  nombre: z.string().trim().min(1).max(100),
  color: z.string().trim().max(20).optional(),
})

export const updateEtiquetaSchema = z.object({
  nombre: z.string().trim().min(1).max(100).optional(),
  color: z.string().trim().max(20).optional(),
  activo: z.boolean().optional(),
})

const entidadEnum = z.enum(['cargo', 'concurso_cph', 'baja', 'solicitud_alta'])

export const asignarEtiquetaSchema = z.object({
  entidad: entidadEnum,
  entidadId: z.string().uuid(),
})

export type EtiquetasQuery = z.infer<typeof etiquetasQuerySchema>
export type CreateEtiquetaBody = z.infer<typeof createEtiquetaSchema>
export type UpdateEtiquetaBody = z.infer<typeof updateEtiquetaSchema>
export type AsignarEtiquetaBody = z.infer<typeof asignarEtiquetaSchema>
