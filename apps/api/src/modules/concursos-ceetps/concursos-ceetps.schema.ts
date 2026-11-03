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
  subEstado: z.enum(['EXP_CARATULADO', 'DISPO_LLAMADO', 'IFACS', 'INSAL', 'TAD', 'DISPO_DESIGNACION']).optional(),
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
    fechaCaratulacion: fecha.nullable(),
    fechaAutorizacion: fecha.nullable(),
    tipificadorOrigen: z.string().trim().max(200).nullable(),
    // ── Puesto solicitado (catálogo + texto) ────────────────────────────────
    // S20-10: id del catálogo — el string puestoSolicitado se recalcula en
    // el backend a partir de este id (deja de aceptarse como input directo).
    puestoCargoSolicitadoId: z.string().uuid().nullable(),
    puestoSolicitado: z.string().trim().max(200).nullable(),
    dispoLlamado: z.string().trim().max(500).nullable(),
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

export type DesignarCeetpsBody = z.infer<typeof designarCeetpsSchema>
