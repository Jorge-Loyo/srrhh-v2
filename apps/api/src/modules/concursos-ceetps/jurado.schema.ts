import { z } from 'zod'

// PUT /:id/jurado/cantidades — lugares del jurado (se definen antes de asignar).
export const cantidadesJuradoSchema = z.object({
  cantTitulares: z.number().int().min(1).max(20),
  cantSuplentes: z.number().int().min(0).max(20),
})

export type CantidadesJuradoBody = z.infer<typeof cantidadesJuradoSchema>

// POST /:id/jurado/miembros — asignar una persona con cargo vigente.
export const agregarMiembroJuradoSchema = z.object({
  personaId: z.string().uuid(),
  rol: z.enum(['titular', 'suplente']),
})

export type AgregarMiembroJuradoBody = z.infer<typeof agregarMiembroJuradoSchema>
