import { z } from 'zod'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido')

// Crear una jornada de sorteo: fecha + los concursos CPH que se sortearán ese
// día (deben estar en sub-estado 'B-SORTEO JUR'; se valida en el service).
export const crearJornadaSchema = z.object({
  fecha,
  titulo: z.string().trim().max(200).optional(),
  observaciones: z.string().trim().max(2000).optional(),
  concursoCphIds: z.array(z.string().uuid()).min(1, 'Elegí al menos un concurso'),
})

export type CrearJornadaBody = z.infer<typeof crearJornadaSchema>

// Candidatos: concursos en B-SORTEO JUR, filtrables por etiqueta.
export const candidatosJornadaQuerySchema = z.object({
  etiquetaId: z.string().uuid().optional(),
})

export type CandidatosJornadaQuery = z.infer<typeof candidatosJornadaQuerySchema>

// Estados posibles de una jornada de sorteo.
//   planificada → jornada abierta, se pueden seguir sorteando sus concursos.
//   finalizada  → jornada cerrada; ya no se sortea más ahí. Los concursos que
//                 no se llegaron a sortear NO cambian de etapa (siguen en
//                 B-SORTEO JUR) y por eso siguen siendo elegibles para otra
//                 jornada — la elegibilidad depende solo del sub-estado del
//                 concurso, no del estado de la jornada.
export const ESTADOS_JORNADA = ['planificada', 'finalizada'] as const
export type EstadoJornada = (typeof ESTADOS_JORNADA)[number]

// Cambiar el estado de una jornada (cerrar / reabrir).
export const cambiarEstadoJornadaSchema = z.object({
  estado: z.enum(ESTADOS_JORNADA),
})

export type CambiarEstadoJornadaBody = z.infer<typeof cambiarEstadoJornadaSchema>
