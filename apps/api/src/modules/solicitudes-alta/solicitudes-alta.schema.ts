import { z } from 'zod'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido')

export const createSolicitudAltaSchema = z.object({
  hospitalId:       z.string().uuid(),
  escalafonId:      z.string().uuid(),
  codigoRegistroId: z.string().uuid().optional(),
  literalPuesto:    z.string().trim().min(1).max(200),
  especialidad:     z.string().trim().max(200).optional(),
  agrupador:        z.string().trim().max(150).optional(),
  unificadorPuesto: z.string().trim().max(200).optional(),
  regimen:          z.string().trim().max(50).optional(),
  expediente:       z.string().trim().max(150).optional(),
  desde:            fecha.optional(),
  cantidad:         z.coerce.number().int().min(1).max(50).default(1),
  etiqueta:         z.string().trim().max(100).optional(),
  // S16-8: baja que originó la vacante que esta alta viene a cubrir
  bajaOrigenId:     z.string().uuid().optional(),
  // Transferencia desde otro ministerio — se crea aprobada directamente
  esTransferencia:  z.boolean().optional(),
})

export const solicitudesAltaQuerySchema = z.object({
  page:            z.coerce.number().int().min(1).default(1),
  limit:           z.coerce.number().int().min(1).max(100).default(20),
  hospitalId:      z.string().uuid().optional(),
  estado:          z.enum(['pendiente', 'aprobada', 'rechazada']).optional(),
  esTransferencia: z.coerce.boolean().optional(),
})

export type CreateSolicitudAltaBody  = z.infer<typeof createSolicitudAltaSchema>
export type SolicitudesAltaQuery     = z.infer<typeof solicitudesAltaQuerySchema>
