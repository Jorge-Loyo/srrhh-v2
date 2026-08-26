import { z } from 'zod'

export const kpisConcursosCphQuerySchema = z.object({
  hospitalId: z.string().uuid().optional(),
})

export type KpisConcursosCphQuery = z.infer<typeof kpisConcursosCphQuerySchema>
