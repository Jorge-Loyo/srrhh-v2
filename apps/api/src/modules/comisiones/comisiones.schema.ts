import { z } from 'zod'

// S19-6: registrar una comisión sobre una ocupación activa.
export const registrarComisionSchema = z.object({
  ocupacionId: z.string().uuid(),
  comision: z.string().trim().min(1, 'El motivo de la comisión es obligatorio').max(150),
  repaComision: z.string().trim().min(1, 'La repartición de destino es obligatoria').max(200),
  crComentario: z.string().trim().max(2000).optional(),
})

export type RegistrarComisionBody = z.infer<typeof registrarComisionSchema>
