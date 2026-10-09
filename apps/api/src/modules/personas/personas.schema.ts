import { z } from 'zod'

// S3-1/S3-3: filtros de GET /api/v1/personas — ver PersonaFilters en
// packages/types (misma forma, pero acá como query string: todo llega como
// string y se coerciona/valida).
// S21: un grupo de la cascada de catálogo (repartición · escalafón → modalidad
// → puesto → especialidad). Varios grupos se combinan con OR (uniones), ver
// `grupos` abajo. Todos los campos opcionales: un grupo puede filtrar solo por
// escalafón, o por escalafón+puesto, etc.
export const grupoCatalogoSchema = z.object({
  hospitalId: z.string().uuid().optional(),
  escalafonId: z.string().uuid().optional(),
  // S25: código de registro puntual del escalafón (ej. CPH → 22 ó 37). Acota
  // dentro del escalafón ya elegido.
  codigoRegistroId: z.string().uuid().optional(),
  modalidad: z.enum(['pof', 'pou', 'ambos']).optional(),
  puestoCargoId: z.string().uuid().optional(),
  especialidadPuestoId: z.string().uuid().optional(),
})

export type GrupoCatalogo = z.infer<typeof grupoCatalogoSchema>

export const personasQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  // Búsqueda libre: nombre (full-text) o CUIL/DNI (ILIKE) — ver personas.service.ts
  search: z.string().trim().min(1).optional(),
  // S21: uniones (OR) de la cascada de catálogo. Llega como JSON string en el
  // query param `grupos`. Cada grupo es un AND de sus campos; los grupos se
  // combinan con OR. Los filtros hospitalId/escalafonId/... sueltos (abajo)
  // siguen soportados para el "grupo en edición" / compatibilidad.
  grupos: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined
      try {
        const parsed = JSON.parse(v)
        const arr = z.array(grupoCatalogoSchema).max(20).parse(parsed)
        // Descarta grupos totalmente vacíos (no aportan condición).
        const noVacios = arr.filter((g) => Object.values(g).some((x) => x != null && x !== ''))
        return noVacios.length ? noVacios : undefined
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'grupos: JSON inválido' })
        return z.NEVER
      }
    }),
  // z.coerce.boolean() NO sirve acá: "false" es un string no-vacío, coerciona
  // a `true` igual. Se valida como enum de string y se convierte a mano.
  activo: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  hospitalId: z.string().uuid().optional(),
  escalafonId: z.string().uuid().optional(),
  // S25: código de registro puntual del escalafón (cascada escalafón→cod. registro).
  codigoRegistroId: z.string().uuid().optional(),
  // S21: modalidad del cargo (POF/POU) — cascada escalafón→modalidad→puesto.
  modalidad: z.enum(['pof', 'pou', 'ambos']).optional(),
  // S20-7: puesto/especialidad filtran por FK real al catálogo.
  puestoCargoId: z.string().uuid().optional(),
  especialidadPuestoId: z.string().uuid().optional(),
  idSial: z.string().trim().min(1).optional(),
  // Solo jefes: personas con una ocupación vigente de jefatura. Mismo patrón
  // enum→boolean que `activo` (z.coerce.boolean no sirve para 'false').
  soloJefes: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
})

export type PersonasQuery = z.infer<typeof personasQuerySchema>
