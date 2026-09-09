import { z } from 'zod'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido')

export const ordenesMeritoQuerySchema = z.object({
  concursoCphId: z.string().uuid().optional(),
  especialidad: z.string().trim().min(1).optional(),
  estado: z.enum(['vigente', 'prorrogada', 'vencida']).optional(),
})

export const createOrdenMeritoSchema = z.object({
  concursoCphId: z.string().uuid(),
  especialidad: z.string().trim().min(1).max(200),
  puesto: z.string().trim().max(200).optional(),
  expediente: z.string().trim().max(200).optional(),
  fechaPublicacion: fecha,
  observaciones: z.string().trim().max(2000).optional(),
})

export const updateOrdenMeritoSchema = z.object({
  expediente: z.string().trim().max(200).nullable().optional(),
  observaciones: z.string().trim().max(2000).nullable().optional(),
  // Prórroga: fecha exacta del vencimiento extendido (fechaVencimiento + 60 días)
  fechaProrroga: fecha.nullable().optional(),
  estado: z.enum(['vigente', 'prorrogada', 'vencida']).optional(),
})

export const createIntegranteSchema = z.object({
  cuil: z.string().regex(/^\d{11}$/, 'CUIL debe tener 11 dígitos'),
  apellidoNombre: z.string().trim().min(1).max(200),
  especialidad: z.string().trim().max(200).optional(),
  posicion: z.number().int().min(1),
})

export const updateIntegranteSchema = z.object({
  designado: z.boolean().optional(),
  concursoCphDesignadoId: z.string().uuid().nullable().optional(),
})

export const alertaQuerySchema = z.object({
  especialidad: z.string().trim().min(1),
})

export type OrdenesMeritoQuery = z.infer<typeof ordenesMeritoQuerySchema>
export type CreateOrdenMeritoBody = z.infer<typeof createOrdenMeritoSchema>
export type UpdateOrdenMeritoBody = z.infer<typeof updateOrdenMeritoSchema>
export type CreateIntegranteBody = z.infer<typeof createIntegranteSchema>
export type UpdateIntegranteBody = z.infer<typeof updateIntegranteSchema>
export type AlertaQuery = z.infer<typeof alertaQuerySchema>
