import { z } from 'zod'

const csv = () =>
  z.string().trim().min(1).optional().transform((v) =>
    v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
  )

export const dimDotacionQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(200).default(50),
  sortBy: z.enum(['apellidoNombre', 'cuil', 'efector', 'carrera', 'situacionRevista', 'literalPuesto']).optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),

  // Filtros
  efector:          csv(),   // sigla del efector
  codigoRegistro:   csv(),   // código de carrera (22, 37, 85...)
  situacionRevista: csv(),
  literalPuesto:    csv(),   // nombre del puesto (dim_puestos.literal_puesto)
  especialidad:     csv(),   // especialidad (dim_puestos.especialidad)
  idSialRol:        z.string().trim().min(1).optional(),
  cuil:             z.string().trim().min(1).optional(),
  apellidoNombre:   z.string().trim().min(1).optional(),
})

export type DimDotacionQuery = z.infer<typeof dimDotacionQuerySchema>

export const dimDotacionKpisQuerySchema = z.object({
  efector:        z.string().trim().min(1).optional(),
  codigoRegistro: z.string().trim().min(1).optional(),
})

export type DimDotacionKpisQuery = z.infer<typeof dimDotacionKpisQuerySchema>
