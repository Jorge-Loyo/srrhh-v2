import { z } from 'zod'

export const kpisConcursosCphQuerySchema = z.object({
  hospitalId: z.string().uuid().optional(),
})

export type KpisConcursosCphQuery = z.infer<typeof kpisConcursosCphQuerySchema>

export const kpisConcursosCeetpsQuerySchema = z.object({
  hospitalId: z.string().uuid().optional(),
  escalafonId: z.string().uuid().optional(),
})

export type KpisConcursosCeetpsQuery = z.infer<typeof kpisConcursosCeetpsQuerySchema>
