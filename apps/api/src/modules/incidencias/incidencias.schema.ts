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

// ─── Pestañas "Baja sin concurso" / "Todo" / resumen (solo lectura) ──────────
// `q` vacío se trata como ausente; mínimo 2 caracteres si viene.
const qSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().trim().min(2).max(100).optional(),
)
const refrescarSchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true')
const paginacion = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
}

export const bajaSinConcursoQuerySchema = z.object({
  ...paginacion,
  q: qSchema,
  carrera: z.string().trim().max(100).optional(),
  origen: z.enum(['baja_sial', 'padron']).optional(),
  estadoCargo: z.enum(['vigente', 'validacion_vacante']).optional(),
  refrescar: refrescarSchema,
})
export type BajaSinConcursoQuery = z.infer<typeof bajaSinConcursoQuerySchema>

// Query de la pestaña "Bloqueados" (FASE 5, on-demand, solo lectura): mismo
// molde que bajaSinConcursoQuerySchema (q / carrera / paginación / refrescar),
// sin los filtros origen/estadoCargo que no aplican.
export const bloqueadosQuerySchema = z.object({
  ...paginacion,
  q: qSchema,
  carrera: z.string().trim().max(100).optional(),
  refrescar: refrescarSchema,
})
export type BloqueadosQuery = z.infer<typeof bloqueadosQuerySchema>

export const todoQuerySchema = z.object({
  ...paginacion,
  q: qSchema,
  carrera: z.string().trim().max(100).optional(),
  tipo: z
    .enum([
      'sial-sin-cargo',
      'baja-sin-concurso',
      'cayo-del-padron',
      'cambio-situacion-revista',
      'cambios-del-puesto',
      'otras',
      'bloqueados',
    ])
    .optional(),
  refrescar: refrescarSchema,
})
export type TodoQuery = z.infer<typeof todoQuerySchema>

export const resumenQuerySchema = z.object({ refrescar: refrescarSchema })

// Query de las pestañas persistidas (FASE 4, solo lectura): mismo molde que
// bajaSinConcursoQuerySchema (q / carrera / paginación). No llevan `refrescar`
// porque leen directo de padron_incidencias (sin caché en proceso).
export const persistidaQuerySchema = z.object({
  ...paginacion,
  q: qSchema,
  carrera: z.string().trim().max(100).optional(),
})
export type PersistidaQuery = z.infer<typeof persistidaQuerySchema>
