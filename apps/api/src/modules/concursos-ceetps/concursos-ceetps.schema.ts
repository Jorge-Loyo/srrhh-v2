import { z } from 'zod'
import { CRONOGRAMA_CEETPS_PASOS, EstadoConcursoCeetps } from '@srrhh/types'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido')

const CLAVES_CRONOGRAMA = CRONOGRAMA_CEETPS_PASOS.map((p) => p.key) as [
  (typeof CRONOGRAMA_CEETPS_PASOS)[number]['key'],
  ...(typeof CRONOGRAMA_CEETPS_PASOS)[number]['key'][],
]

// S5-1: listado paginado con filtros
export const concursosCeetpsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  hospitalId: z.string().uuid().optional(),
  escalafonId: z.string().uuid().optional(),
  estado: z.nativeEnum(EstadoConcursoCeetps).optional(),
  subEstado: z.enum(['EXP_CARATULADO', 'A_AUTORIZACION', 'DISPO_LLAMADO', 'IFACS', 'INSAL', 'TAD', 'DISPO_DESIGNACION']).optional(),
  // Rangos de fechas del proceso (recuperados del legacy)
  fechaCaratulacionDesde: fecha.optional(),
  fechaCaratulacionHasta: fecha.optional(),
  fechaAutorizacionDesde: fecha.optional(),
  fechaAutorizacionHasta: fecha.optional(),
  fechaIfacsDesde: fecha.optional(),
  fechaIfacsHasta: fecha.optional(),
  fechaInsalDesde: fecha.optional(),
  fechaInsalHasta: fecha.optional(),
  search: z.string().trim().min(1).optional(),
})

export type ConcursosCeetpsQuery = z.infer<typeof concursosCeetpsQuerySchema>

// S5-1: PATCH por fase. `estado` y `subEstado` NO forman parte del contrato —
// se calculan server-side en calcEstadoCeetps() en cada write, igual que CPH.
export const patchConcursoCeetpsSchema = z
  .object({
    // ── Proceso previo ──────────────────────────────────────────────────────
    expedienteConcurso: z.string().trim().max(150).nullable(),
    // Paso 2b: IF de autorización de apertura (obligatorio con el expediente en nuevo_cargo)
    ifAutorizacion: z.string().trim().max(150).nullable(),
    fechaCaratulacion: fecha.nullable(),
    fechaAutorizacion: fecha.nullable(),
    tipificadorOrigen: z.string().trim().max(200).nullable(),
    // ── Puesto solicitado (catálogo + texto) ────────────────────────────────
    // S20-10: id del catálogo — el string puestoSolicitado se recalcula en
    // el backend a partir de este id (deja de aceptarse como input directo).
    puestoCargoSolicitadoId: z.string().uuid().nullable(),
    puestoSolicitado: z.string().trim().max(200).nullable(),
    dispoLlamado: z.string().trim().max(500).nullable(),
    // Etapa 2: mismos valores que concursos-cph (tipoGestion).
    tipoGestion: z.enum(['centralizado', 'descentralizado']).nullable(),
    // ── Carga horaria / apertura (Enfermería/Técnicos) ──────────────────────
    cargaHoraria: z.number().int().min(0).max(99).nullable(),
    apertura2x18: z.boolean(),
    informeApertura: z.string().trim().max(150).nullable(),
    expedienteConcurso2: z.string().trim().max(150).nullable(),
    // ── Cambio de especialidad ──────────────────────────────────────────────
    // No dispara flujo de autorización separado: solo documenta el cambio con
    // el expediente/informe respaldatorio (mismo patrón que CPH).
    // Boolean no nullable en Prisma — no se acepta null, solo true/false.
    cambioEspecialidad: z.boolean(),
    docCambioEspecialidad: z.string().trim().max(500).nullable(),
    // ── IFACS / INSAL ───────────────────────────────────────────────────────
    // cantidadCargos: no nullable en Prisma (DEFAULT 1) — solo acepta entero positivo.
    cantidadCargos: z.number().int().min(1),
    fechaIfacs: fecha.nullable(),
    fechaInsal: fecha.nullable(),
    // Respuesta al INSAL del candidato reservado (Etapa 4). Los ids son de inscriptos_ceetps.
    insalAceptado: z.boolean().nullable(),
    insalRechazados: z.array(z.string().uuid()),
    inscriptoReservadoId: z.string().uuid().nullable(),
    // ── Designación ─────────────────────────────────────────────────────────
    expedienteDesignacion: z.string().trim().max(150).nullable(),
    dispoDesignacion: z.string().trim().max(500).nullable(),
    resolucionDesignacion: z.string().trim().max(500).nullable(),
    puestoDesignado: z.string().trim().max(150).nullable(),
    estadoApto: z.string().trim().max(100).nullable(),
    numeroAptoMedico: z.string().trim().max(100).nullable(),
    fechaProyectoDispo: fecha.nullable(),
    altaSial: z.boolean().nullable(),
    codigoSial: z.string().trim().max(100).nullable(),
    // Etapa 5 del wizard. dispoDesignacion (arriba) es la "Disposición de designación".
    cargaDocumentacion: z.boolean().nullable(),
    tramiteDesignacion: z.enum(['tad', 'gene1303']).nullable(),
    fechaAptoMedico: fecha.nullable(),
    fechaDispoDesignacion: fecha.nullable(),
    resolucionConvalidacion: z.string().trim().max(500).nullable(),
    proyectoResolucion: z.boolean().nullable(), // "Designación a la firma"
    resoALaFirma: z.boolean().nullable(), // "Resolución a la firma"
    fechaResolucion: fecha.nullable(),
    // ── Etapa 3: puntaje mínimo por paso y cronograma ───────────────────────
    // Los lugares del jurado (juradoCant*) NO van acá: PUT /:id/jurado/cantidades.
    puntajeMinimoExamen: z.number().min(0).nullable(),
    puntajeMinimoCv: z.number().min(0).nullable(),
    puntajeMinimoEntrevista: z.number().min(0).nullable(),
    // Reemplaza el cronograma completo (el wizard manda todas las fechas juntas).
    cronograma: z.record(z.enum(CLAVES_CRONOGRAMA), fecha.nullable()),
    // ── Observaciones ───────────────────────────────────────────────────────
    observaciones: z.string().trim().max(2000).nullable(),
    // personaDesignadaId NO se acepta via PATCH — usar POST /:id/designar,
    // que ejecuta la lógica transaccional completa (crea Ocupacion, actualiza
    // Cargo, envía notificación). Dejar el campo aquí bypassearía todo eso.
  })
  .partial()
  .strict()

export type PatchConcursoCeetpsBody = z.infer<typeof patchConcursoCeetpsSchema>

// S16-2: registrar designación CEETPS — mismo contrato que CPH.
export const designarCeetpsSchema = z.object({
  personaId: z.string().uuid(),
  fechaDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido'),
  idSialRol: z.string().trim().max(50).optional(),
})

// Etapa 5: vincula al designado SIN ocupar el cargo (el cargo pasa a ocupado
// cuando la persona aparezca en el padrón). Mismo contrato que CPH: o una
// persona ya existente, o una referencia (CUIL + nombre).
export const asignarDesignadoCeetpsSchema = z.union([
  z.object({ personaId: z.string().uuid() }).strict(),
  z
    .object({
      refCuil: z
        .string()
        .trim()
        .transform((s) => s.replace(/\D/g, ''))
        .refine((s) => s.length === 11, 'El CUIL debe tener 11 dígitos'),
      refNombre: z.string().trim().min(1).max(200),
      idSialRol: z.string().trim().max(50).optional(),
    })
    .strict(),
])

export type AsignarDesignadoCeetpsBody = z.infer<typeof asignarDesignadoCeetpsSchema>

export type DesignarCeetpsBody = z.infer<typeof designarCeetpsSchema>
