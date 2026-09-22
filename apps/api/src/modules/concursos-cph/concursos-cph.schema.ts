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
  suspendido: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  pendienteAutorizacion: z.coerce.boolean().optional(),
  conFaltantes: z.coerce.boolean().optional(),
  search: z.string().trim().min(1).optional(),
  // Filtro dedicado por especialidad (busca en especialidad_solicitada del
  // concurso y en la especialidad del cargo).
  especialidad: z.string().trim().min(1).optional(),
  // Origen del concurso (documentación respaldatoria):
  //  - 'baja': tiene baja asociada (concurso.bajaId not null) → expediente de baja
  //  - 'ampliacion': sin baja pero el cargo tiene expediente de alta → cargo.expediente
  //  - 'cobertura': sin baja y sin expediente de cargo → sin documentación
  origen: z.enum(['baja', 'ampliacion', 'cobertura']).optional(),
  // Filtro por etiquetas — CSV de ids, un concurso matchea si tiene AL MENOS
  // UNA de las etiquetas pedidas (OR, no AND).
  etiquetaIds: z
    .string()
    .trim()
    .min(1)
    .transform((v) => v.split(',').filter(Boolean))
    .optional(),
  // Etapa 5: concursos con persona elegida del orden de mérito
  // (inscriptoReservadoId o personaDesignadaId). Tri-estado igual que
  // `suspendido` (no z.coerce.boolean para que 'false' no coercione a true).
  personaOm: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  // Etapa 5: concursos validados contra el padrón (flag validado).
  validado: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
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
    // IF de autorización (nro de documento previo a solicitar autorización SGRASV)
    ifAutorizacion: z.string().trim().max(150).nullable(),
    // Autorización
    fechaAutorizacion: fecha.nullable(),
    sorteoJurado: fecha.nullable(),
    tipoGestion: z.enum(['centralizado', 'descentralizado']).nullable(),
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
    // Campos nuevos — datos del CSV histórico
    ifacs: z.string().trim().max(200).nullable(),
    insal: z.string().trim().max(200).nullable(),
    // Respuesta al INSAL (Etapa 4 — propuesta, no designación oficial).
    insalAceptado: z.boolean().nullable(),
    insalRechazados: z.array(z.string().uuid()),
    // Etapa 4 — inscripto (del orden de mérito) reservado para el INSAL.
    // FK a InscriptoConcurso, no al padrón. La resolución contra el padrón
    // se hace recién en Etapa 5 (personaDesignadaId).
    inscriptoReservadoId: z.string().uuid().nullable(),
    cambioEspecialidad: z.boolean().nullable(),
    motivoCambioEspecialidad: z.string().trim().max(2000).nullable(),
    qInscriptos: z.number().int().min(0).nullable(),
    // Desierto
    dispoDesierta: z.string().trim().max(50).nullable(),
    fechaDispoDesierta: fecha.nullable(),
    cantidadCargos: z.number().int().min(1).nullable(),
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

// S16-1: registrar designación — crea Ocupacion y avanza sub-estado a N-DESIGNADO.
// idSialRol opcional: si no se conoce todavía (el padrón no llegó), se genera
// un valor sintético MANUAL-{cargoId}-{fecha} que el padrón siguiente sobreescribe.
export const designarCphSchema = z.object({
  personaId: z.string().uuid(),
  fechaDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido'),
  idSialRol: z.string().trim().max(50).optional(),
})

export type DesignarCphBody = z.infer<typeof designarCphSchema>

// PS16D-3: declarar desierto — guarda snapshot en ConcursoCphDesierto,
// limpia campos de la ronda, pone suspendido=true, sub-estado Q-DESIERTO.
export const declararDesiertoSchema = z.object({
  dispoDesierta: z.string().trim().min(1).max(50),
  fechaDispoDesierta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido'),
  observaciones: z.string().trim().max(2000).optional(),
})

export type DeclararDesiertoBody = z.infer<typeof declararDesiertoSchema>

// Etapa 2 — Sorteo de jurado. Criterios configurables del sorteo:
// - cantTitulares/cantSuplentes: composición del jurado (default 3+3). El total
//   (titulares + suplentes) es el mínimo de candidatos que debe reunir el pool.
// - antiguedadMinimaAnios: umbral de antigüedad de la Regla 2 (default 15).
// - semilla: opcional, para reproducir/auditar un sorteo. Si no se envía se
//   genera una aleatoria y se guarda en el acta.
// El pool se arma por CASCADA de reglas (ver sorteoJurado.service.ts):
//   Regla 1: mismo hospital + conducción + misma especialidad
//   Regla 2: mismo hospital + antigüedad >= antiguedadMinimaAnios
//   Regla 3: sistema (cualquier hospital) + conducción
// Se baja de regla solo si no se llegó al total de jurados. Por eso ya no hay
// flags de "exigir especialidad" ni "ampliar a sistema": están implícitos en
// las reglas.
export const generarSorteoJuradoSchema = z
  .object({
    // La fecha del sorteo NO se elige: es la del día en que se genera (hoy),
    // asignada por el backend. No forma parte del contrato.
    cantTitulares: z.number().int().min(1).max(10).default(3),
    cantSuplentes: z.number().int().min(1).max(10).default(3),
    antiguedadMinimaAnios: z.number().int().min(0).max(60).default(15),
    // Hasta 2 especialidades extra que también cuentan como "cumple
    // especialidad" (además de la propia del concurso) para ampliar el pool de
    // jurados elegibles por especialidad.
    especialidadesAdicionales: z.array(z.string().trim().min(1).max(200)).max(2).optional(),
    // Expediente que respalda las especialidades adicionales — obligatorio si
    // se cargó alguna (validado abajo con refine).
    expedienteEspecialidades: z.string().trim().min(1).max(200).optional(),
    semilla: z.string().trim().min(1).max(64).optional(),
    observaciones: z.string().trim().max(2000).optional(),
  })
  .refine(
    (b) => !b.especialidadesAdicionales?.length || !!b.expedienteEspecialidades,
    {
      message: 'El expediente que respalda las especialidades adicionales es obligatorio',
      path: ['expedienteEspecialidades'],
    },
  )

export type GenerarSorteoJuradoBody = z.infer<typeof generarSorteoJuradoSchema>
