import { z } from 'zod'

// Paso 5a — body de POST /concursos-cph/:id/corregir-tipo y
// POST /concursos-ceetps/:id/corregir-tipo (mismo contrato en los dos).
export const corregirTipoSchema = z.object({
  tipoDestino: z.enum(['cph', 'ceetps']),
  motivo: z.string().trim().min(1, 'El motivo es obligatorio').max(500),
  // Ajuste 5a: obligatorio (85|87) si el destino es CEETPS; se ignora si es CPH. Lo valida el servicio.
  codigoRegistro: z.string().trim().max(10).optional(),
})

export type CorregirTipoBody = z.infer<typeof corregirTipoSchema>
