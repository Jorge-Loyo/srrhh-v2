import { z } from 'zod'
import { TipoConcurso } from '@srrhh/types'
import { MotivoConcurso } from '@prisma/client'

// Querystring para buscar concursos a vincular con un id_sial nuevo (búsqueda
// libre opcional, mismo patrón que GET /snapshots/:id/diffs/:diffId/concursos
// del padrón).
export const buscarConcursosQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
})
export type BuscarConcursosQuery = z.infer<typeof buscarConcursosQuerySchema>

// Vincular un id_sial nuevo a un concurso CPH ya existente.
export const vincularConcursoSchema = z.object({
  concursoCphId: z.string().uuid(),
})
export type VincularConcursoBody = z.infer<typeof vincularConcursoSchema>

// Crear un concurso para un id_sial nuevo sin concurso. Se deriva de
// createConcursoSchema (concursos.schema.ts) pero cargoId y hospitalId se
// resuelven en el service desde el diff (el usuario no los envía): el cargo a
// concursar sale del id_sial del diff y el hospital de su sigla. El resto del
// cuerpo (origen, fechaVacante, tipoConcurso, etc.) lo aporta el usuario.
export const crearConcursoParaIdSialSchema = z
  .object({
    origen: z.string().trim().min(1).max(50),
    fechaVacante: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido'),
    tipoConcurso: z.nativeEnum(TipoConcurso),
    motivo: z.string().trim().max(200).optional(),
    expediente: z.string().trim().max(150).optional(),
    motivoConcurso: z.nativeEnum(MotivoConcurso).optional(),
    especialidadSolicitada: z.string().trim().max(200).optional(),
    eeBaja: z.string().trim().max(150).optional(),
    fechaBaja: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    escalafonId: z.string().uuid().optional(),
    puestoSolicitado: z.string().trim().max(200).optional(),
  })
  .refine((data) => data.tipoConcurso !== TipoConcurso.CEETPS || !!data.escalafonId, {
    message: 'escalafonId es requerido cuando tipoConcurso es ceetps',
    path: ['escalafonId'],
  })
export type CrearConcursoParaIdSialBody = z.infer<typeof crearConcursoParaIdSialSchema>
