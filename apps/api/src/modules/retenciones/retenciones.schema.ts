import { z } from 'zod'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido')

// S18-4: registrar retención — genera el cargo remplazante (R o TTR)
export const registrarRetencionSchema = z.object({
  cargoId: z.string().uuid(),
  srDocRespaldo: z.string().trim().min(1, 'Documento de respaldo obligatorio'),
  srComentario: z.string().trim().max(2000).optional(),
  // Solo se usan si el cargo retenido resulta ser de conducción (TTR)
  periodoDesde: fecha.optional(),
  periodoHasta: fecha.optional(),
}).refine(
  (body) => !body.periodoDesde || !body.periodoHasta || body.periodoHasta > body.periodoDesde,
  { message: 'periodoHasta debe ser posterior a periodoDesde', path: ['periodoHasta'] }
)

export type RegistrarRetencionBody = z.infer<typeof registrarRetencionSchema>

// S18-9: titular cesa — el ocupante del cargo R hereda el cargo titular
export const titularCesaSchema = z.object({
  cargoId: z.string().uuid(),
  ocupanteRId: z.string().uuid(),
  docRespaldo: z.string().trim().min(1, 'Documento de respaldo obligatorio'),
})

export type TitularCesaBody = z.infer<typeof titularCesaSchema>

// S19-4/5: renovar el período de un cargo de conducción (TTR)
export const renovarPeriodoSchema = z.object({
  periodoHasta: fecha,
})

export type RenovarPeriodoBody = z.infer<typeof renovarPeriodoSchema>
