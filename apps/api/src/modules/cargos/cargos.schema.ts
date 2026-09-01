import { z } from 'zod'
import { EstadoCargo } from '@srrhh/types'

// S3-4/S3-3: filtros de GET /api/v1/cargos — ver CargoFilters en packages/types.
export const cargosQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().trim().min(1).optional(),
  hospitalId: z.string().uuid().optional(),
  escalafonId: z.string().uuid().optional(),
  puesto: z.string().trim().min(1).optional(),
  estado: z.nativeEnum(EstadoCargo).optional(),
  ocupado: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  personaSearch: z.string().trim().min(1).optional(),
})

export type CargosQuery = z.infer<typeof cargosQuerySchema>

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido')

// S5-10: Alta de Cargo manual.
// `idSial` no se genera acá — es un identificador del sistema SIAL del GCBA
// que solo existe para cargos que vienen del padrón. Los cargos creados
// manualmente usan un idSial sintético generado por el backend.
export const createCargoSchema = z.object({
  hospitalId:       z.string().uuid(),
  escalafonId:      z.string().uuid(),
  codigoRegistroId: z.string().uuid().optional(),
  literalPuesto:    z.string().trim().min(1).max(200),
  especialidad:     z.string().trim().max(200).optional(),
  agrupador:        z.string().trim().max(150).optional(),
  unificadorPuesto: z.string().trim().max(200).optional(),
  regimen:          z.string().trim().max(50).optional(),
  // Expediente o decreto que autoriza el alta — se persiste en BD (S7-2)
  expediente:       z.string().trim().max(150).optional(),
  // Fecha desde la que rige el cargo — se persiste en BD (S7-2)
  desde:            fecha.optional(),
  // Cantidad de cargos a crear (1..50)
  cantidad: z.coerce.number().int().min(1).max(50).default(1),
  // S7-5: forzar creación aunque exista duplicado estructural
  forzar:   z.boolean().optional().default(false),
})

export type CreateCargoBody = z.infer<typeof createCargoSchema>

// S7-4: filtros para GET /api/v1/cargos/altas
export const altasQuerySchema = z.object({
  expediente: z.string().trim().min(1).optional(),
  desde:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(200).default(50),
})

export type AltasQuery = z.infer<typeof altasQuerySchema>
