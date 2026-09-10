import { z } from 'zod'
import { TipoConcurso, MotivoConcurso } from '@srrhh/types'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido')

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
    motivoConcurso: z.nativeEnum(MotivoConcurso).optional(),
    especialidadSolicitada: z.string().trim().max(200).optional(),
    eeBaja: z.string().trim().max(150).optional(),
    fechaBaja: fecha.optional(),
    escalafonId: z.string().uuid().optional(),
    puestoSolicitado: z.string().trim().max(200).optional(),
  })
  .refine((data) => data.tipoConcurso !== TipoConcurso.CEETPS || !!data.escalafonId, {
    message: 'escalafonId es requerido cuando tipoConcurso es ceetps',
    path: ['escalafonId'],
  })

export type CreateConcursoBody = z.infer<typeof createConcursoSchema>
