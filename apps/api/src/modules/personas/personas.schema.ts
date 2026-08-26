import { z } from 'zod'

// S3-1/S3-3: filtros de GET /api/v1/personas — ver PersonaFilters en
// packages/types (misma forma, pero acá como query string: todo llega como
// string y se coerciona/valida).
export const personasQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  // Búsqueda libre: nombre (full-text) o CUIL/DNI (ILIKE) — ver personas.service.ts
  search: z.string().trim().min(1).optional(),
  // z.coerce.boolean() NO sirve acá: "false" es un string no-vacío, coerciona
  // a `true` igual. Se valida como enum de string y se convierte a mano.
  activo: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  hospitalId: z.string().uuid().optional(),
  escalafonId: z.string().uuid().optional(),
  // Puesto/especialidad son texto libre en Cargo (sin catálogo, ver
  // Doc/Planificacion/PLAN_SCRUM_2026.md) — se filtra por igualdad exacta
  // contra el valor que ya devuelve GET /api/v1/puestos.
  puesto: z.string().trim().min(1).optional(),
  especialidad: z.string().trim().min(1).optional(),
})

export type PersonasQuery = z.infer<typeof personasQuerySchema>
