import { z } from 'zod'

export const dimIncidenciasQuerySchema = z.object({
  page:           z.coerce.number().int().min(1).default(1),
  limit:          z.coerce.number().int().min(1).max(200).default(50),
  tipo:           z.enum(['baja_gestionable', 'puesto_nuevo_gestionable']).optional(),
  estado:         z.enum(['pendiente', 'resuelta', 'descartada']).optional(),
  efector:        z.string().trim().min(1).optional(),
  codigoRegistro: z.string().trim().min(1).optional(),
})

export type DimIncidenciasQuery = z.infer<typeof dimIncidenciasQuerySchema>

export const iniciarConcursoBodySchema = z.object({
  observaciones: z.string().trim().optional(),
})

export const descartarBodySchema = z.object({
  motivo: z.string().trim().optional(),
})

export const dimConcursosQuerySchema = z.object({
  page:           z.coerce.number().int().min(1).default(1),
  limit:          z.coerce.number().int().min(1).max(200).default(50),
  tipo:           z.enum(['cph', 'ceetps']).optional(),
  estado:         z.string().trim().min(1).optional(),
  efector:        z.string().trim().min(1).optional(),
  codigoRegistro: z.string().trim().min(1).optional(),
})

export type DimConcursosQuery = z.infer<typeof dimConcursosQuerySchema>
