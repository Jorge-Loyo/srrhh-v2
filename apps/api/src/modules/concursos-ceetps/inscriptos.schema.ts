import { z } from 'zod'
import { PASOS_IMPORTABLES } from './inscriptos.importar.js'

const texto = (max: number) => z.string().trim().max(max).nullable()
const puntaje = z.number().min(0).max(1000).nullable()

// Etapa 3 CEETPS — inscripto y su recorrido por los pasos del concurso.
// Solo apellido y nombre son obligatorios; todo es editable durante el concurso.
const camposInscripto = {
  apellido: z.string().trim().min(1).max(120),
  nombre: z.string().trim().min(1).max(120),
  dni: texto(20),
  cuil: texto(20),
  email: texto(200),
  telefono: texto(40),
  observaciones: texto(2000),
  // a) Inscripción
  entregoDocumentacion: z.boolean(),
  // b) Admisibilidad (admitido null = pendiente) + reclamo
  admitido: z.boolean().nullable(),
  motivoNoAdmision: texto(2000),
  reclamoAdmisibilidad: z.boolean(),
  resultadoReclamoAdmisibilidad: texto(2000),
  // c) Examen escrito + reclamo
  presentoExamen: z.boolean(),
  notaExamen: puntaje,
  reclamoExamen: z.boolean(),
  resultadoReclamoExamen: texto(2000),
  // d) Análisis curricular y e) Entrevista
  puntajeCv: puntaje,
  puntajeEntrevista: puntaje,
  // La posición en el orden de mérito final NO se carga: se calcula (inscriptos.calc.ts).
}

export const inscriptoCeetpsSchema = z
  .object(camposInscripto)
  .partial()
  .required({ apellido: true, nombre: true })
  .strict()

export type InscriptoCeetpsBody = z.infer<typeof inscriptoCeetpsSchema>

export const inscriptoCeetpsPatchSchema = z.object(camposInscripto).partial().strict()

export type InscriptoCeetpsPatchBody = z.infer<typeof inscriptoCeetpsPatchSchema>

// Importación de un paso desde un Excel: el front manda las filas tal cual
// (encabezado → valor) y el backend las interpreta (inscriptos.importar.ts).
export const importarInscriptosSchema = z
  .object({
    paso: z.enum(PASOS_IMPORTABLES),
    filas: z
      .array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])))
      .min(1, 'El archivo no tiene filas')
      .max(2000, 'Máximo 2000 filas por archivo'),
  })
  .strict()

export type ImportarInscriptosBody = z.infer<typeof importarInscriptosSchema>

export const documentacionInscriptosSchema = z
  .object({ entregoDocumentacion: z.boolean() })
  .strict()
