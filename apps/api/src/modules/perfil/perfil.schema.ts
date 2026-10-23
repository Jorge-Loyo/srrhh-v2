import { z } from 'zod'

// Actualización del perfil del propio usuario. SIN `.strict()`: las claves
// desconocidas benignas (id, rol, roleId, hospitalId, activo, createdAt,
// permisos...) se stripean por el default de Zod, así un body con ruido no
// convierte un guardado normal en 400.
//
// `cuil` se declara en el shape con `z.never(...).optional()` para RECHAZARLO
// con un issue `invalid_type` en `path:['cuil']` cuando viene en el body (con
// cualquier valor). Declararlo en el shape es lo que hace que Zod lo VALIDE en
// vez de stripearlo (un `.refine` sobre una clave no declarada es inerte en
// modo strip — comprobado contra Zod 3.25.76). La garantía DURA de
// inmutabilidad del CUIL igual vive en el service (nunca arma `data.cuil`);
// este rechazo es la señal de UX y la barrera de validación alineadas.
export const updatePerfilSchema = z.object({
  nombre: z.string().min(1).max(120).optional(),
  apellido: z.string().min(1).max(120).optional(),
  email: z
    .string()
    .email()
    .max(255)
    .optional()
    .transform((e) => e?.toLowerCase().trim()),
  username: z.string().min(3).max(64).optional(), // 3–64 como createUsuarioSchema
  cuil: z.never({ invalid_type_error: 'El CUIL no puede editarse' }).optional(),
})

// Cambio de contraseña seguro. Los 3 campos DEBEN contener el substring
// `password` para caer bajo `maskBody` del audit middleware (que enmascara
// toda clave que contenga `password/token/authorization`) — así las
// contraseñas nunca se guardan en texto plano en `audit_logs`.
export const changePasswordSchema = z
  .object({
    passwordActual: z.string().min(1),
    passwordNueva: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    passwordConfirmacion: z.string().min(1),
  })
  .refine((b) => b.passwordNueva === b.passwordConfirmacion, {
    message: 'La confirmación no coincide',
    path: ['passwordConfirmacion'],
  })

export type UpdatePerfilBody = z.infer<typeof updatePerfilSchema>
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>
