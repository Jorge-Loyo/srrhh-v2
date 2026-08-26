import { z } from 'zod'
import { TipoConcurso } from '@srrhh/types'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido')

// S4-6: crear concurso (por ahora carga manual — el disparador automático
// "baja con genera_concurso" es S5-5, todavía no existe módulo de Bajas).
// `origen` queda texto libre (ej. "Baja", "Vacante nueva") hasta que S5
// agregue el modelo Baja real y una FK acá.
export const createConcursoSchema = z
  .object({
    cargoId: z.string().uuid(),
    hospitalId: z.string().uuid(),
    personaId: z.string().uuid().optional(),
    origen: z.string().trim().min(1).max(50),
    fechaVacante: fecha,
    motivo: z.string().trim().max(200).optional(),
    expediente: z.string().trim().max(150).optional(),
    tipoConcurso: z.nativeEnum(TipoConcurso),
    // Seed inicial opcional del ConcursoCph hijo (tipoConcurso = cph)
    especialidadSolicitada: z.string().trim().max(200).optional(),
    eeBaja: z.string().trim().max(150).optional(),
    fechaBaja: fecha.optional(),
    // Seed inicial del ConcursoCeetps hijo (tipoConcurso = ceetps) — el
    // escalafón es requerido ahí (ver schema.prisma), no tiene default posible.
    escalafonId: z.string().uuid().optional(),
    puestoSolicitado: z.string().trim().max(200).optional(),
  })
  .refine((data) => data.tipoConcurso !== TipoConcurso.CEETPS || !!data.escalafonId, {
    message: 'escalafonId es requerido cuando tipoConcurso es ceetps',
    path: ['escalafonId'],
  })

export type CreateConcursoBody = z.infer<typeof createConcursoSchema>
