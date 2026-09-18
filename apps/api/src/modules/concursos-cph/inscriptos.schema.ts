import { z } from 'zod'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido')

// Etapa 3 CPH — alta/edición de un inscripto al concurso. Solo apellido y
// nombre son obligatorios; el resto de los datos personales/estudios son
// opcionales en esta primera versión (se pueden ampliar).
export const inscriptoSchema = z.object({
  apellido: z.string().trim().min(1).max(120),
  nombre: z.string().trim().min(1).max(120),
  dni: z.string().trim().max(20).nullable().optional(),
  cuil: z.string().trim().max(20).nullable().optional(),
  sexo: z.string().trim().max(4).nullable().optional(),
  fechaNacimiento: fecha.nullable().optional(),
  nacionalidad: z.string().trim().max(80).nullable().optional(),
  telefono: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().max(200).nullable().optional(),
  titulo: z.string().trim().max(200).nullable().optional(),
  matricula: z.string().trim().max(80).nullable().optional(),
  especialidad: z.string().trim().max(200).nullable().optional(),
  presentoExamen: z.boolean().optional(),
  ordenMerito: z.number().int().min(1).max(9999).nullable().optional(),
  observaciones: z.string().trim().max(2000).nullable().optional(),
})

export type InscriptoBody = z.infer<typeof inscriptoSchema>

// Edición parcial (PATCH).
export const inscriptoPatchSchema = inscriptoSchema.partial()
export type InscriptoPatchBody = z.infer<typeof inscriptoPatchSchema>

// Publicar fechas de inscripción (cierra el período): opcionalmente guarda las
// fechas antes de cerrar.
export const publicarInscripcionSchema = z.object({
  fechaInscDesde: fecha.nullable().optional(),
  fechaInscHasta: fecha.nullable().optional(),
})
export type PublicarInscripcionBody = z.infer<typeof publicarInscripcionSchema>

// Publicar examen: opcionalmente guarda la fecha de examen.
export const publicarExamenSchema = z.object({
  fechaExamen: fecha.nullable().optional(),
})
export type PublicarExamenBody = z.infer<typeof publicarExamenSchema>
