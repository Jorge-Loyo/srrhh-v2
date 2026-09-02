import { z } from 'zod'

export const createUsuarioSchema = z.object({
  username: z.string().min(3).max(64),
  email: z.string().email(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  roleId: z.string().uuid(),
  hospitalId: z.string().uuid().optional(),
})

export type CreateUsuarioBody = z.infer<typeof createUsuarioSchema>
