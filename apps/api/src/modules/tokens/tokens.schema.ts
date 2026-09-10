import { z } from 'zod'

// z.coerce.boolean() no sirve para query strings ("false" es string no-vacío
// y coerciona a `true`) — mismo problema y misma solución que en
// personas.schema.ts (parsear como enum de string y transformar a mano).
export const listTokensQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  username: z.string().trim().min(1).optional(),
  activo: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
})

export type ListTokensQuery = z.infer<typeof listTokensQuerySchema>
