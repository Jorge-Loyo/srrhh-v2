import { z } from 'zod'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido')

// S5-4: listado paginado con filtros
export const bajasQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  hospitalId: z.string().uuid().optional(),
  estado: z.enum(['pendiente', 'confirmada', 'anulada']).optional(),
  search: z.string().trim().min(1).optional(),
})

export type BajasQuery = z.infer<typeof bajasQuerySchema>

// S5-4: crear baja. `tipoBaja` y `tipificadorOrigen` son opcionales —
// 97% de los datos reales no tienen tipo de baja (ver análisis CSV en
// PLAN_SCRUM_2026.md POST-SPRINT 4 (4)).
export const createBajaSchema = z.object({
  cargoId: z.string().uuid(),
  hospitalId: z.string().uuid(),
  personaId: z.string().uuid().optional(),
  fechaBaja: fecha,
  tipoBaja: z.string().trim().max(100).optional(),
  motivo: z.string().trim().max(500).optional(),
  tipificadorOrigen: z.string().trim().max(200).optional(),
  generaConcurso: z.boolean().default(true),
  observaciones: z.string().trim().max(2000).optional(),
})

export type CreateBajaBody = z.infer<typeof createBajaSchema>
