import { z } from 'zod'

// Login multi-identificador retrocompatible. El front nuevo manda
// `identificador`; `username` se mantiene como alias legacy para no romper
// clientes viejos que todavía envían esa clave. Se normaliza a
// `{ identificador, password }` con `.trim()` para el service.
export const loginSchema = z
  .object({
    identificador: z.string().min(1).optional(),
    username: z.string().min(1).optional(), // alias legacy, retrocompat
    password: z.string().min(1),
  })
  .refine((b) => b.identificador ?? b.username, {
    message: 'identificador requerido',
    path: ['identificador'],
  })
  .transform((b) => ({
    identificador: (b.identificador ?? b.username)!.trim(),
    password: b.password,
  }))

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export type LoginBody = z.infer<typeof loginSchema>
export type RefreshBody = z.infer<typeof refreshSchema>
