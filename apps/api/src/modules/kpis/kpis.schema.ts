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

export const kpisDotacionQuerySchema = z.object({
  hospitalId: z.string().uuid().optional(),
})

export type KpisDotacionQuery = z.infer<typeof kpisDotacionQuerySchema>

export const kpisConcursosQuerySchema = z.object({
  hospitalId: z.string().uuid().optional(),
})

export type KpisConcursosQuery = z.infer<typeof kpisConcursosQuerySchema>

export const kpisAlertasQuerySchema = z.object({
  hospitalId: z.string().uuid().optional(),
})

export type KpisAlertasQuery = z.infer<typeof kpisAlertasQuerySchema>

export const kpisDotacionHistoricaQuerySchema = z.object({
  hospitalId: z.string().uuid().optional(),
  agrupacion: z.enum(['mes', 'subida']).default('mes'),
})

export type KpisDotacionHistoricaQuery = z.infer<typeof kpisDotacionHistoricaQuerySchema>
