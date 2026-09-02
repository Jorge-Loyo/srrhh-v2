import { z } from 'zod'
import { EstadoConcursoCeetps } from '@srrhh/types'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido')

// S5-1: listado paginado con filtros
export const concursosCeetpsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  hospitalId: z.string().uuid().optional(),
  escalafonId: z.string().uuid().optional(),
  estado: z.nativeEnum(EstadoConcursoCeetps).optional(),
  search: z.string().trim().min(1).optional(),
})

export type ConcursosCeetpsQuery = z.infer<typeof concursosCeetpsQuerySchema>

// S5-1: PATCH por fase. `estado` NO forma parte del contrato — se calcula
// server-side en calcEstadoCeetps() en cada write, igual que CPH.
export const patchConcursoCeetpsSchema = z
  .object({
    expedienteConcurso: z.string().trim().max(150).nullable(),
    puestoSolicitado: z.string().trim().max(200).nullable(),
    dispoLlamado: z.string().trim().max(500).nullable(),
    // Carga horaria (hs) — Enfermería/Técnicos. Apertura 2x18hs — solo Enfermería.
    cargaHoraria: z.number().int().min(0).max(99).nullable(),
    apertura2x18: z.boolean(),
    informeApertura: z.string().trim().max(150).nullable(),
    expedienteConcurso2: z.string().trim().max(150).nullable(),
    fechaIfacs: fecha.nullable(),
    fechaInsal: fecha.nullable(),
    expedienteDesignacion: z.string().trim().max(150).nullable(),
    dispoDesignacion: z.string().trim().max(500).nullable(),
    resolucionDesignacion: z.string().trim().max(500).nullable(),
    personaDesignadaId: z.string().uuid().nullable(),
    observaciones: z.string().trim().max(2000).nullable(),
  })
  .partial()
  .strict()

export type PatchConcursoCeetpsBody = z.infer<typeof patchConcursoCeetpsSchema>
