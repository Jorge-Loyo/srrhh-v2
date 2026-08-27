import { z } from 'zod'
import { EstadoCargo } from '@srrhh/types'

// S3-4/S3-3: filtros de GET /api/v1/cargos — ver CargoFilters en packages/types.
export const cargosQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().trim().min(1).optional(),
  hospitalId: z.string().uuid().optional(),
  escalafonId: z.string().uuid().optional(),
  estado: z.nativeEnum(EstadoCargo).optional(),
  ocupado: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
})

export type CargosQuery = z.infer<typeof cargosQuerySchema>
