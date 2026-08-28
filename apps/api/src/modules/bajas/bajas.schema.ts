import { z } from 'zod'
import { TipoConcurso } from '@srrhh/types'

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
// S5-5: si `generaConcurso: true`, se requiere `tipoConcurso`. Si es
// `ceetps`, también se requiere `escalafonId`.
export const createBajaSchema = z
  .object({
    cargoId: z.string().uuid(),
    hospitalId: z.string().uuid(),
    personaId: z.string().uuid().optional(),
    fechaBaja: fecha,
    tipoBaja: z.string().trim().max(100).optional(),
    motivo: z.string().trim().max(500).optional(),
    tipificadorOrigen: z.string().trim().max(200).optional(),
    generaConcurso: z.boolean().default(true),
    // Requerido cuando generaConcurso = true
    tipoConcurso: z.nativeEnum(TipoConcurso).optional(),
    // Requerido cuando tipoConcurso = ceetps
    escalafonId: z.string().uuid().optional(),
    observaciones: z.string().trim().max(2000).optional(),
  })
  .refine(
    (d) => !d.generaConcurso || !!d.tipoConcurso,
    { message: 'tipoConcurso es requerido cuando generaConcurso es true', path: ['tipoConcurso'] }
  )
  .refine(
    (d) => d.tipoConcurso !== TipoConcurso.CEETPS || !!d.escalafonId,
    { message: 'escalafonId es requerido cuando tipoConcurso es ceetps', path: ['escalafonId'] }
  )

export type CreateBajaBody = z.infer<typeof createBajaSchema>
