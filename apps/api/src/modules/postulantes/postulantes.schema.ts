import { z } from 'zod'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido')

export const postulantesQuerySchema = z.object({
  search: z.string().trim().min(1).optional(), // busca por cuil o apellidoNombre
  esExterno: z.coerce.boolean().optional(),
  especialidad: z.string().trim().min(1).optional(),
})

export const createPostulanteSchema = z.object({
  cuil: z.string().regex(/^\d{11}$/, 'CUIL debe tener 11 dígitos'),
  apellidoNombre: z.string().trim().min(1).max(200),
  especialidad: z.string().trim().max(200).optional(),
  esExterno: z.boolean().default(false),
})

export const updatePostulanteSchema = z.object({
  apellidoNombre: z.string().trim().min(1).max(200).optional(),
  especialidad: z.string().trim().max(200).nullable().optional(),
  esExterno: z.boolean().optional(),
})

// Postulación a un concurso
export const createPostulacionSchema = z.object({
  concursoCphId: z.string().uuid(),
  fechaPostulacion: fecha,
  observaciones: z.string().trim().max(2000).optional(),
})

export const updatePostulacionSchema = z.object({
  estado: z.enum(['inscripto', 'admitido', 'rechazado']).optional(),
  observaciones: z.string().trim().max(2000).nullable().optional(),
})

export type PostulantesQuery = z.infer<typeof postulantesQuerySchema>
export type CreatePostulanteBody = z.infer<typeof createPostulanteSchema>
export type UpdatePostulanteBody = z.infer<typeof updatePostulanteSchema>
export type CreatePostulacionBody = z.infer<typeof createPostulacionSchema>
export type UpdatePostulacionBody = z.infer<typeof updatePostulacionSchema>
