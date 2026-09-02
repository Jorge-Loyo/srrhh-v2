import { z } from 'zod'
import { EstadoConcursoCph } from '@srrhh/types'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido')

// S4-1: listado paginado con filtros. `subEstado` filtra contra el valor
// persistido (no depende de "hoy", se recalcula en cada write — ver
// concursosCph.calc.ts) y `subEstado3` se recalcula en vivo en SQL al
// filtrar (SUB_ESTADO_3_SQL_PG), porque sí depende de la fecha de hoy y
// puede desactualizarse solo con el paso del tiempo.
export const concursosCphQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  hospitalId: z.string().uuid().optional(),
  cargoId: z.string().uuid().optional(),
  estado: z.nativeEnum(EstadoConcursoCph).optional(),
  subEstado: z.string().trim().min(1).optional(),
  subEstado3: z.string().trim().min(1).optional(),
  suspendido: z.coerce.boolean().optional(),
  pendienteAutorizacion: z.coerce.boolean().optional(),
  search: z.string().trim().min(1).optional(),
})

export type ConcursosCphQuery = z.infer<typeof concursosCphQuerySchema>

// S4-3: PATCH por fase. `estado`/`subEstado`/`subEstado3` NO forman parte de
// este contrato a propósito — son calculados por calcConcursoCph() en cada
// write, no editables por el cliente (criterio de éxito de Sprint 4). Mismo
// motivo para `concursoId`/`cargoId`/`hospitalId`: son inmutables una vez
// creado el registro (ver S4-6, POST /api/v1/concursos).
export const patchConcursoCphSchema = z
  .object({
    // Baja / apertura del concurso
    especialidadSolicitada: z.string().trim().max(200).nullable(),
    // Puesto solicitado, si difiere del puesto de la baja (cargo.literalPuesto)
    // — lo usan los documentos exportables (Validación/Autorización).
    puestoSolicitado: z.string().trim().max(200).nullable(),
    eeBaja: z.string().trim().max(150).nullable(),
    fechaBaja: fecha.nullable(),
    eeConcurso: z.string().trim().max(150).nullable(),
    fechaEeConcurso: fecha.nullable(),
    // Autorización
    fechaAutorizacion: fecha.nullable(),
    sorteoJurado: fecha.nullable(),
    disposicion: z.string().trim().max(100).nullable(),
    // Inscripción / examen / orden de mérito
    fechaInscDesde: fecha.nullable(),
    fechaInscHasta: fecha.nullable(),
    fechaExamen: fecha.nullable(),
    fechaOrdenMerito: fecha.nullable(),
    // IFACS / INSAL
    fechaIfacs: fecha.nullable(),
    fechaInsal: fecha.nullable(),
    // Designación
    eeDesignacion: z.string().trim().max(150).nullable(),
    cargaDocumentacion: z.boolean().nullable(),
    fechaAptoMedico: fecha.nullable(),
    fechaIte: fecha.nullable(),
    proyectoResolucion: z.boolean().nullable(),
    resoALaFirma: z.boolean().nullable(),
    resolucionDesignacion: z.string().trim().max(100).nullable(),
    fechaResolucion: fecha.nullable(),
    cargoSial: z.string().trim().max(50).nullable(),
    personaDesignadaId: z.string().uuid().nullable(),
    // Desierto
    dispoDesierta: z.string().trim().max(50).nullable(),
    fechaDispoDesierta: fecha.nullable(),
    observaciones: z.string().trim().max(2000).nullable(),
    // Campos de autorización (sigla/codigoRegistro cambiados)
    pendienteAutorizacion: z.boolean().nullable(),
    sigla: z.string().trim().max(20).nullable(),
    codigoRegistroId: z.string().uuid().nullable(),
  })
  .partial()
  .strict()

export type PatchConcursoCphBody = z.infer<typeof patchConcursoCphSchema>

// S4-5: suspender/reanudar. `suspendido` por defecto true — el mismo
// endpoint reanuda si se manda explícitamente en false, para no necesitar un
// segundo endpoint solo para el camino inverso.
export const suspenderConcursoCphSchema = z.object({
  suspendido: z.boolean().default(true),
  observaciones: z.string().trim().max(2000).optional(),
})

export type SuspenderConcursoCphBody = z.infer<typeof suspenderConcursoCphSchema>
