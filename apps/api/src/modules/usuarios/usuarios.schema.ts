import { z } from 'zod'

export const createUsuarioSchema = z.object({
  username: z.string().min(3).max(64),
  email: z.string().email(),
  nombre: z.string().min(1).max(120),
  apellido: z.string().min(1).max(120),
  cuil: z.string().regex(/^\d{11}$/, 'El CUIL debe tener 11 dígitos numéricos'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  roleId: z.string().uuid(),
  hospitalId: z.string().uuid().optional(),
})

export type CreateUsuarioBody = z.infer<typeof createUsuarioSchema>

export const updateUsuarioSchema = z
  .object({
    username: z.string().min(3).max(64).optional(),
    email: z.string().email().optional(),
    nombre: z.string().min(1).max(120).optional(),
    apellido: z.string().min(1).max(120).optional(),
    cuil: z.string().regex(/^\d{11}$/, 'El CUIL debe tener 11 dígitos numéricos').optional(),
    roleId: z.string().uuid().optional(),
    hospitalId: z.string().uuid().nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'No hay cambios para guardar' })

export type UpdateUsuarioBody = z.infer<typeof updateUsuarioSchema>
