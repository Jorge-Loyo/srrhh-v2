import { z } from 'zod'

// Columnas habilitadas para ordenar la tabla — primer uso de sort dinámico en
// el proyecto (no hay convención previa que copiar), se valida contra esta
// whitelist fija para no exponer nombres de columna SQL arbitrarios en la query.
export const DOTACION_SORT_COLUMNS = [
  'nombreApellido', 'cuil', 'sexo', 'literalPuesto', 'especialidad',
  'unificadorPuesto', 'agrupador', 'escalafon', 'situacionRevista',
  'reparticion', 'sigla', 'codigoCargo', 'codigoRol', 'edad', 'antiguedad',
] as const

// z.coerce.boolean() no sirve para query strings ("false" es string no-vacío
// y coerciona a `true`): mismo problema y misma solución que en
// personas.schema.ts (parsear como enum de string y transformar a mano).
const csv = () => z
  .string()
  .trim()
  .min(1)
  .optional()
  .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined))

export const dotacionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sortBy: z.enum(DOTACION_SORT_COLUMNS).optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  skipDistinct: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),

  // Segmentación de hospitales (multi-select, CSV)
  sigla: csv(),
  universoTotalizador: csv(),
  tipoHospital: csv(),
  monovalencia: csv(),

  // Filtros de dotación (multi-select, CSV)
  unificadorPuesto: csv(),
  especialidad: csv(),
  agrupador: csv(),
  literalPuesto: csv(),
  escalafonId: csv(),
  sexo: csv(),
  situacionRevista: csv(),
  reparticion: csv(),

  // Búsqueda rápida (campo único)
  codigoCargo: z.string().trim().min(1).optional(),
  nombreApellido: z.string().trim().min(1).optional(),
  cuil: z.string().trim().min(1).optional(),
  codigoRol: z.string().trim().min(1).optional(),

  edadMin: z.coerce.number().int().min(0).max(120).optional(),
  edadMax: z.coerce.number().int().min(0).max(120).optional(),
  antiguedadMin: z.coerce.number().int().min(0).optional(),
  antiguedadMax: z.coerce.number().int().min(0).optional(),

  // Filtro de estado disparado desde el click en las KPI cards del panel
  estado: z.string().trim().min(1).optional(),
})

export type DotacionQuery = z.infer<typeof dotacionQuerySchema>

export const dotacionKpisQuerySchema = z.object({
  hospitalId: z.string().uuid().optional(),
})

export type DotacionKpisQuery = z.infer<typeof dotacionKpisQuerySchema>
