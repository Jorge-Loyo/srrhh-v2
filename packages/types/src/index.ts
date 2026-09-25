// =============================================================================
// SRRHH v2 — Tipos compartidos entre API y Web
// =============================================================================
// Fuente de verdad para los contratos de datos entre frontend y backend.
// Cualquier cambio aquí se refleja automáticamente en ambos lados.
// =============================================================================

// -----------------------------------------------------------------------------
// ENUMS
// -----------------------------------------------------------------------------

// Reemplazados de enum a const+type para compatibilidad con Node 22 strip-only mode
// (los enum de TypeScript requieren transpilación; const objects no)

export const EstadoCargo = {
  VIGENTE: 'vigente',
  NO_VIGENTE: 'no_vigente',
  VALIDACION_VACANTE: 'validacion_vacante',
} as const
export type EstadoCargo = (typeof EstadoCargo)[keyof typeof EstadoCargo]

export const EstadoSnapshot = {
  PROCESANDO: 'procesando',
  PENDIENTE: 'pendiente',
  APROBADO: 'aprobado',
  RECHAZADO: 'rechazado',
  ERROR: 'error',
} as const
export type EstadoSnapshot = (typeof EstadoSnapshot)[keyof typeof EstadoSnapshot]

export const TipoDiff = {
  NUEVO: 'nuevo',
  MODIFICADO: 'modificado',
  ELIMINADO: 'eliminado',
} as const
export type TipoDiff = (typeof TipoDiff)[keyof typeof TipoDiff]

export const TipoConcurso = {
  CPH: 'cph',
  CEETPS: 'ceetps',
  SIN_CONCURSO: 'sin_concurso',
} as const
export type TipoConcurso = (typeof TipoConcurso)[keyof typeof TipoConcurso]

// Motivo por el que se abre el concurso — campo libre en el legacy,
// acá tipificado para filtros y reportes.
export const MotivoConcurso = {
  BAJA: 'baja',
  AMPLIACION: 'ampliacion',
  COBERTURA_POU: 'cobertura_pou',
  JEFATURA: 'jefatura',
  OTRO: 'otro',
} as const
export type MotivoConcurso = (typeof MotivoConcurso)[keyof typeof MotivoConcurso]

export const EstadoConcursoCph = {
  NO_INICIADO: 'no_iniciado',
  ACTIVO: 'activo',
  FINALIZADO: 'finalizado',
  SUSPENDIDO: 'suspendido',
} as const
export type EstadoConcursoCph = (typeof EstadoConcursoCph)[keyof typeof EstadoConcursoCph]

export const EstadoConcursoCeetps = {
  SIN_AUTORIZAR: 'sin_autorizar',
  AUTORIZADO: 'autorizado',
  EN_PROCESO: 'en_proceso',
  FINALIZADO: 'finalizado',
  DESIERTO: 'desierto',
} as const
export type EstadoConcursoCeetps = (typeof EstadoConcursoCeetps)[keyof typeof EstadoConcursoCeetps]

// RBAC dinámico — reemplaza el enum fijo de roles. Los roles viven en la tabla
// `roles` (editable por el admin desde /configuracion/permisos), no en código.
export interface Role {
  id: string
  slug: string
  nombre: string
  descripcion: string | null
  esSistema: boolean
  activo: boolean
  permisos?: { permiso: Permiso }[]
}

export interface Permiso {
  id: string
  modulo: string
  accion: string
  descripcion: string | null
}

// -----------------------------------------------------------------------------
// ENTIDADES BASE (respuestas de la API)
// -----------------------------------------------------------------------------

export interface Persona {
  id: string
  cuil: string
  numeroDoc: string | null
  tipoDoc: string | null
  apellidoNombre: string
  fechaNacimiento: string | null
  sexo: string | null
  especialidadPrincipal: string | null
  activo: boolean
  createdAt: string
  updatedAt: string
}

// Devuelto por GET /api/v1/personas — Persona + el puesto de su ocupación
// vigente (Cargo.literalPuesto, texto libre, `null` si no tiene ocupación
// vigente). No es un campo de Persona en sí, por eso no vive en el tipo base.
export interface PersonaListItem extends Persona {
  puesto: string | null
  idSial: string | null
}

// Devuelto por GET /api/v1/puestos — cada puesto real (Cargo.literalPuesto)
// con las especialidades que efectivamente aparecen en cargos con ese
// puesto. Alimenta el filtro en cascada de PersonasPage: la mayoría de los
// puestos no médicos nunca tienen especialidad (`especialidades: []`).
export interface Puesto {
  puesto: string
  especialidades: string[]
}

export interface Hospital {
  id: string
  sigla: string
  nombre: string
  universoTotalizador: string | null
  tipo: string | null
  monovalencia: string | null
  activo: boolean
}

export interface Escalafon {
  id: string
  codigo: string
  nombre: string
  activo: boolean
}

export interface CodigoRegistro {
  id: string
  codigo: string
  literal: string
  escalafonId: string
}

export interface Cargo {
  id: string
  idSial: string
  codigo: string | null
  hospitalId: string
  escalafonId: string
  codigoRegistroId: string | null
  literalPuesto: string | null
  especialidad: string | null // @deprecated — usar especialidadLegacy
  especialidadLegacy: string | null
  especialidadId: string | null
  agrupador: string | null
  unificadorPuesto: string | null
  regimen: string | null
  // S2-17: repartición y clasificaciones SIAL
  codigoRepa: string | null
  descripcionRepa: string | null
  codAgrupamiento: string | null
  agrupamiento: string | null
  codFamilia: string | null
  litFamilia: string | null
  puestoCodigoSial: string | null
  estado: EstadoCargo
  // S8A-1: días en estado actual (calculado por el backend)
  estadoDesde: string | null
  ocupado: boolean
  ocupadoDesde: string | null
  // S7-1/S7-2: campos de trazabilidad de alta manual
  expediente: string | null
  fechaDesde: string | null
  // Persona que ocupa el cargo actualmente (solo en listado, null si vacante)
  personaOcupante: (Pick<Persona, 'id' | 'apellidoNombre' | 'cuil'> & { idSialRol: string }) | null
  createdAt: string
  updatedAt: string
  // S18-1: retención y cadena
  tipoOrigen: TipoOrigen
  cargoRetenidoId: string | null
  cargoBaseId: string | null
  periodoDesde: string | null
  periodoHasta: string | null
  periodoRenovado: boolean
  fechaRenovacion: string | null
  // Relaciones expandidas (opcionales)
  hospital?: Hospital
  escalafon?: Escalafon
  codigoRegistro?: CodigoRegistro | null
}

export interface Ocupacion {
  id: string
  personaId: string
  cargoId: string
  idSialRol: string
  cuilYRol: string | null
  situacionRevista: string | null
  estadoPersona: string | null
  desde: string | null
  hasta: string | null
  codigoJefaturas: string | null
  jefeEscalafon: string | null
  documentacionJefatura: string | null
  comentariosJefaturas: string | null
  comision: string | null
  repaComision: string | null
  codSituacion: string | null
  documentacionDelRol: string | null
  documentacionBaja: string | null
  cargoDesdeFecha: string | null
  cargoHastaFecha: string | null
  fechaBloqueo: string | null
  bloqueoComentario: string | null
  bloqMotivo: string | null
  snapshotId: string | null
  createdAt: string
  updatedAt: string
  // Relaciones expandidas (opcionales)
  persona?: Persona
  cargo?: Cargo
}

// Ocupacion con cargo siempre expandido — usado en PersonaDetail
export interface OcupacionConCargo extends Ocupacion {
  cargo: Cargo & { hospital: Hospital; escalafon: Escalafon; codigoRegistro: CodigoRegistro | null }
}

export interface PadronSnapshot {
  id: string
  fechaAsignada: string
  filename: string
  totalRegistros: number
  estado: EstadoSnapshot
  pasoActual: string | null
  errorMsg: string | null
  aprobadoAt: string | null
  createdAt: string
  procesadoPor: { username: string } | null
  aprobadoPor: { username: string } | null
}

// Devuelto por GET /padron/snapshots/:id/estado (getSnapshotEstadoService) —
// subconjunto de PadronSnapshot, para pollear mientras runPipeline() corre.
export type SnapshotEstadoResponse = Pick<
  PadronSnapshot,
  'id' | 'estado' | 'pasoActual' | 'errorMsg' | 'totalRegistros'
>

// Devuelto por POST /padron/upload (uploadPadronService)
export interface UploadPadronResponse {
  snapshotId: string
  fechaAsignada: string
  totalRegistros: number
}

export interface PadronDiff {
  id: string
  snapshotId: string
  tipo: TipoDiff
  idSialRol: string
  campo: string | null
  valorAnterior: string | null
  valorNuevo: string | null
  // null = pendiente, true = aprobado, false = rechazado
  aprobado: boolean | null
  codigoPreview?: string | null // solo en tab nuevos pendientes: código que se generaría
  codigoReal?: string | null // solo en tab nuevos aprobados: código real asignado
  codigoReutilizado?: boolean // true si el cargo proviene de un concurso CPH vinculado
  concursoCodigo?: string | null // código del cargo del concurso (cuando codigoReutilizado=true)
  apellidoNombre?: string | null // modificados y eliminados: nombre de la persona
  clasificacionEliminado?: 'con_persona' | 'en_validacion' | 'sin_persona' | null // solo eliminados
  codigoCargo?: string | null // solo eliminados: código del cargo en la BD
  siglas?: string | null // solo eliminados: sigla del hospital
  escalafon?: string | null // solo eliminados: nombre del escalafón
  createdAt: string
}

export interface Concurso {
  id: string
  personaId: string | null
  cargoId: string
  hospitalId: string
  origen: string
  fechaVacante: string
  motivo: string | null
  expediente: string | null
  tipoConcurso: TipoConcurso
  motivoConcurso: string | null
  createdAt: string
  // Relaciones expandidas
  persona?: Persona
  cargo?: Cargo
  hospital?: Hospital
  baja?: Baja | null
}

// Etiqueta reutilizable que se asigna a concursos (y otras entidades) para
// agruparlos. Relación N:M — un concurso puede tener varias etiquetas.
export interface Etiqueta {
  id: string
  nombre: string
  color: string | null
  activo: boolean
  createdAt: string
}

// Body para asignar/desasignar una etiqueta a una entidad.
export interface AsignarEtiquetaRequest {
  entidad: 'cargo' | 'concurso_cph' | 'baja' | 'solicitud_alta'
  entidadId: string
}

// Body para crear una etiqueta nueva.
export interface CrearEtiquetaRequest {
  nombre: string
  color?: string
}

// S4-4: estado/subEstado/subEstado3 son calculados por el backend
// (calcConcursoCph, apps/api/.../concursos-cph/concursosCph.calc.ts) en cada
// create/PATCH — no forman parte de PatchConcursoCphRequest más abajo.
export interface ConcursoCph {
  id: string
  concursoId: string
  cargoId: string
  hospitalId: string
  estado: EstadoConcursoCph
  subEstado: string | null
  subEstado3: string | null
  especialidadSolicitada: string | null
  // Puesto solicitado, si difiere del de la baja (cargo.literalPuesto) —
  // usado por los documentos exportables (Validación/Autorización).
  puestoSolicitado: string | null
  eeBaja: string | null
  fechaBaja: string | null
  eeConcurso: string | null
  fechaEeConcurso: string | null
  ifAutorizacion: string | null
  fechaAutorizacion: string | null
  sorteoJurado: string | null
  tipoGestion: 'centralizado' | 'descentralizado' | null
  disposicion: string | null
  fechaInscDesde: string | null
  fechaInscHasta: string | null
  inscripcionCerrada: boolean
  fechaCierreInscripcion: string | null
  presentadosConfirmados: boolean
  ordenMeritoConfirmado: boolean
  fechaExamen: string | null
  fechaOrdenMerito: string | null
  fechaIfacs: string | null
  fechaInsal: string | null
  eeDesignacion: string | null
  cargaDocumentacion: boolean | null
  fechaAptoMedico: string | null
  fechaIte: string | null
  proyectoResolucion: boolean | null
  resoALaFirma: boolean | null
  resolucionDesignacion: string | null
  fechaResolucion: string | null
  cargoSial: string | null
  dispoDesierta: string | null
  fechaDispoDesierta: string | null
  cantidadCargos: number
  personaDesignadaId: string | null
  suspendido: boolean
  ifacs: string | null
  insal: string | null
  // Respuesta al INSAL (Etapa 4 — propuesta, no designación oficial; esa es
  // en Etapa 5). null = sin respuesta, true = aceptó el cargo.
  insalAceptado: boolean | null
  // Ids de InscriptoConcurso que fueron propuestos y rechazaron el cargo.
  insalRechazados: string[]
  // Etapa 4 — inscripto del orden de mérito reservado para el INSAL (FK a
  // InscriptoConcurso, no al padrón). La designación oficial contra el padrón
  // es en Etapa 5 (personaDesignadaId).
  inscriptoReservadoId: string | null
  // Etapa 5 — validación contra el padrón semanal: true cuando la persona
  // aparece con un id SIAL rol cuyo cargo coincide en carrera y especialidad
  // con el concurso.
  validado: boolean
  validadoAt: string | null
  validadoIdSialRol: string | null
  cambioEspecialidad: boolean
  motivoCambioEspecialidad: string | null
  qInscriptos: number | null
  pendienteAutorizacion: boolean
  aprobadoDirector: boolean
  siglaSolicitada: string | null
  codigoRegistroSolicitadoId: string | null
  observaciones: string | null
  createdAt: string
  updatedAt: string
  // Relaciones expandidas (GET /:id y listado)
  concurso?: Concurso
  hospital?: Hospital
  personaDesignada?: Persona
  // Etiquetas asignadas (aplanadas desde la tabla join por el backend)
  etiquetas?: Etiqueta[]
}

export interface ConcursoCeetps {
  id: string
  concursoId: string
  cargoId: string
  hospitalId: string
  escalafonId: string
  estado: EstadoConcursoCeetps
  expedienteConcurso: string | null
  puestoSolicitado: string | null
  dispoLlamado: string | null
  // Carga horaria (hs, Enfermería/Técnicos) y apertura 2x18hs (solo Enfermería)
  // — usados por los documentos exportables (Validación/Autorización).
  cargaHoraria: number | null
  apertura2x18: boolean
  informeApertura: string | null
  expedienteConcurso2: string | null
  cantidadCargos: number
  fechaIfacs: string | null
  fechaInsal: string | null
  expedienteDesignacion: string | null
  dispoDesignacion: string | null
  resolucionDesignacion: string | null
  personaDesignadaId: string | null
  observaciones: string | null
  createdAt: string
  updatedAt: string
  // Relaciones expandidas (GET /:id y listado)
  concurso?: Concurso
  hospital?: Hospital
  escalafon?: Escalafon
  personaDesignada?: Persona
}

export interface Usuario {
  id: string
  username: string
  email: string
  rol: string // display: role.nombre (editable por el admin — no usar para gating de UI)
  rolSlug: string // estable, usar esto para comparar en el frontend (ej. rolSlug === 'admin')
  roleId: string
  hospitalId: string | null
  activo: boolean
  createdAt: string
  // Solo viene en la respuesta de login (no en GET /usuarios) — lo consume el
  // helper can() del frontend. Opcional porque el resto de los endpoints que
  // devuelven Usuario no lo calculan.
  permisos?: { modulo: string; accion: string }[]
}

// S10-1 — Notificaciones persistidas
export const TipoNotificacion = {
  CONCURSO_ESTANCADO: 'concurso_estancado',
  BAJA_PENDIENTE: 'baja_pendiente',
  AUTORIZACION_PENDIENTE: 'autorizacion_pendiente',
  AUTORIZACION_RESUELTA: 'autorizacion_resuelta',
} as const
export type TipoNotificacion = (typeof TipoNotificacion)[keyof typeof TipoNotificacion]

export interface Notificacion {
  id: string
  tipo: TipoNotificacion
  rolSlug: string
  titulo: string
  mensaje: string
  origenTipo: string | null
  origenId: string | null
  origenKey: string | null
  leida: boolean
  creadaAt: string
  leidaAt: string | null
}

export interface NotificacionFilters {
  page?: number
  limit?: number
  tipo?: TipoNotificacion
  soloNoLeidas?: boolean
}

// GET /notificaciones/:id/detalle — resuelve el origen para el modal ("qué pasó")
interface HospitalRef {
  sigla: string
  nombre: string
}
interface CargoCreadoDetalle {
  id: string
  codigo: string | null
  literalPuesto: string | null
  especialidadLegacy: string | null
  fechaDesde: string | null
  estado: string
  hospital: HospitalRef
  escalafon: { nombre: string }
}
interface CargoRef {
  codigo: string | null
  literalPuesto: string | null
}

export type NotificacionDetalle =
  | {
      tipo: 'alta_cargo'
      estado: string
      solicitud: {
        hospital: HospitalRef
        escalafon: { nombre: string }
        literalPuesto: string
        especialidad: string | null
        cantidad: number
        expediente: string | null
      }
      cargosCreados: CargoCreadoDetalle[]
    }
  | {
      tipo: 'concurso_cph'
      estado: string | null // estado de la autorización si vino de ese flujo; null si vino de una alerta de estancamiento
      concurso: {
        cargo: CargoRef
        hospital: HospitalRef
        estadoConcurso: string
        subEstado: string | null
        especialidadSolicitada: string | null
        puestoSolicitado: string | null
      }
    }
  | {
      tipo: 'baja'
      cargo: CargoRef
      hospital: HospitalRef
      persona: { apellidoNombre: string } | null
      fechaBaja: string
      motivo: string | null
      estado: string
    }
  | {
      tipo: 'concurso_ceetps'
      concurso: {
        cargo: CargoRef
        hospital: HospitalRef
        estadoConcurso: string
        subEstado: string | null
      }
    }

// S13 — Autorizaciones
export const TipoAutorizacion = {
  CONCURSO_CPH: 'concurso_cph',
  ALTA_CARGO: 'alta_cargo',
  BAJA_CARGO: 'baja_cargo',
} as const
export type TipoAutorizacion = (typeof TipoAutorizacion)[keyof typeof TipoAutorizacion]

export const EstadoAutorizacion = {
  PENDIENTE: 'pendiente',
  APROBADA: 'aprobada',
  RECHAZADA: 'rechazada',
} as const
export type EstadoAutorizacion = (typeof EstadoAutorizacion)[keyof typeof EstadoAutorizacion]

export const SolicitudAltaEstado = {
  PENDIENTE: 'pendiente',
  APROBADA: 'aprobada',
  RECHAZADA: 'rechazada',
} as const
export type SolicitudAltaEstado = (typeof SolicitudAltaEstado)[keyof typeof SolicitudAltaEstado]

export const EstadoBaja = {
  PENDIENTE: 'pendiente',
  CONFIRMADA: 'confirmada',
  ANULADA: 'anulada',
} as const
export type EstadoBaja = (typeof EstadoBaja)[keyof typeof EstadoBaja]

export interface Baja {
  id: string
  cargoId: string
  hospitalId: string
  personaId: string | null
  fechaBaja: string
  tipoBaja: string | null
  motivo: string | null
  tipificadorOrigen: string | null
  eeBaja: string | null
  partidaPresupuestaria: string | null
  docRespaldatoria: string | null
  fechaPaseParalelo: string | null
  generaConcurso: boolean
  estado: EstadoBaja
  observaciones: string | null
  registradoPorId: string | null
  createdAt: string
  updatedAt: string
  // Relaciones expandidas
  cargo?: Cargo & { hospital: Hospital; escalafon: Escalafon }
  hospital?: Hospital
  persona?: Persona | null
  registradoPor?: { username: string } | null
}

export interface Autorizacion {
  id: string
  tipo: TipoAutorizacion
  referenciaId: string
  referenciaTipo: string
  estado: EstadoAutorizacion
  resolverPorRolSlug: string
  solicitadoPorId: string | null
  resueltoPorId: string | null
  observaciones: string | null
  createdAt: string
  updatedAt: string
  // Relaciones expandidas (opcionales)
  solicitadoPor?: Pick<Usuario, 'id' | 'username'> | null
  resueltoPor?: Pick<Usuario, 'id' | 'username'> | null
}

export interface SolicitudAlta {
  id: string
  hospitalId: string
  escalafonId: string
  codigoRegistroId: string | null
  literalPuesto: string
  especialidad: string | null
  agrupador: string | null
  unificadorPuesto: string | null
  regimen: string | null
  expediente: string | null
  desde: string | null
  cantidad: number
  etiqueta: string | null
  esTransferencia: boolean
  estado: SolicitudAltaEstado
  solicitadoPorId: string | null
  cargosCreadosIds: string[]
  observaciones: string | null
  createdAt: string
  updatedAt: string
  // Relaciones expandidas (opcionales)
  hospital?: Hospital
  escalafon?: Escalafon
  codigoRegistro?: CodigoRegistro | null
  solicitadoPor?: Pick<Usuario, 'id' | 'username'> | null
}

export interface RoleJerarquia {
  rolHijoSlug: string
  rolPadreSlug: string
}

// -----------------------------------------------------------------------------
// DTOs — Requests
// -----------------------------------------------------------------------------

export interface LoginRequest {
  username: string
  password: string
}

export interface CreatePersonaRequest {
  cuil: string
  numeroDoc?: string
  tipoDoc?: string
  apellidoNombre: string
  fechaNacimiento?: string
  sexo?: string
  especialidadPrincipal?: string
}

export interface UpdatePersonaRequest {
  numeroDoc?: string
  tipoDoc?: string
  apellidoNombre?: string
  fechaNacimiento?: string
  sexo?: string
  especialidadPrincipal?: string
}

export interface AprobarSnapshotRequest {
  excluidos?: string[] // IDs de diffs a excluir
}

export interface CreateUsuarioRequest {
  username: string
  email: string
  password: string
  roleId: string
  hospitalId?: string
}

// S4-6 — POST /api/v1/concursos. Carga manual por ahora (el disparador
// automático "baja con genera_concurso" es S5-5, todavía no existe módulo
// de Bajas) — de ahí que `origen` sea texto libre en vez de una FK.
export interface CreateConcursoRequest {
  cargoId: string
  hospitalId: string
  personaId?: string
  origen: string
  fechaVacante: string
  motivo?: string
  expediente?: string
  tipoConcurso: TipoConcurso
  // Seed inicial opcional del ConcursoCph hijo (tipoConcurso = cph)
  especialidadSolicitada?: string
  eeBaja?: string
  fechaBaja?: string
  // Seed inicial del ConcursoCeetps hijo (tipoConcurso = ceetps) — escalafonId
  // es requerido en ese caso (ver createConcursoSchema en la API)
  escalafonId?: string
  puestoSolicitado?: string
}

// S4-3 — PATCH /api/v1/concursos-cph/:id. estado/subEstado/subEstado3 quedan
// deliberadamente afuera — los calcula el backend, ver nota en ConcursoCph.
export interface PatchConcursoCphRequest {
  especialidadSolicitada?: string | null
  puestoSolicitado?: string | null
  eeBaja?: string | null
  fechaBaja?: string | null
  eeConcurso?: string | null
  fechaEeConcurso?: string | null
  ifAutorizacion?: string | null
  fechaAutorizacion?: string | null
  sorteoJurado?: string | null
  tipoGestion?: 'centralizado' | 'descentralizado' | null
  disposicion?: string | null
  fechaInscDesde?: string | null
  fechaInscHasta?: string | null
  fechaExamen?: string | null
  fechaOrdenMerito?: string | null
  fechaIfacs?: string | null
  fechaInsal?: string | null
  eeDesignacion?: string | null
  cargaDocumentacion?: boolean | null
  fechaAptoMedico?: string | null
  fechaIte?: string | null
  proyectoResolucion?: boolean | null
  resoALaFirma?: boolean | null
  resolucionDesignacion?: string | null
  fechaResolucion?: string | null
  cargoSial?: string | null
  personaDesignadaId?: string | null
  dispoDesierta?: string | null
  fechaDispoDesierta?: string | null
  observaciones?: string | null
}

// S4-5 — POST /api/v1/concursos-cph/:id/suspender. `suspendido` en `false`
// reanuda — mismo endpoint para los dos sentidos.
export interface SuspenderConcursoCphRequest {
  suspendido?: boolean
  observaciones?: string
}

// -----------------------------------------------------------------------------
// DTOs — Responses
// -----------------------------------------------------------------------------

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: Usuario
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    total: number
    page: number
    limit: number
    pages: number
  }
}

export interface DiffSummary {
  nuevos: number
  modificados: number
  eliminados: number
  nuevosPendientes: number
  nuevosRechazados: number
  eliminadosConPersona: number // cargo vigente con ocupación activa — baja real
  eliminadosEnValidacion: number // cargo en validacion_vacante — ya en proceso de baja
  eliminadosSinPersona: number // cargo no_vigente o vacante — ruido histórico
}

export interface SnapshotDiffResponse {
  // Subconjunto de PadronSnapshot: getSnapshotDiffService devuelve solo estos
  // campos (no aprobadoAt/createdAt/procesadoPor/aprobadoPor).
  snapshot: Pick<PadronSnapshot, 'id' | 'fechaAsignada' | 'filename' | 'totalRegistros' | 'estado'>
  summary: DiffSummary
  diffs: PaginatedResponse<PadronDiff>
}

export interface ApiError {
  code: string
  message: string
  details?: unknown
}

// S4-11 — GET /api/v1/kpis/concursos-cph
export interface KpiConcursosCph {
  total: number
  porEstado: { estado: EstadoConcursoCph; total: number }[]
  porSubEstado: { subEstado: string; total: number }[]
  porSubEstado3: { subEstado3: string; total: number }[]
  porHospital: { hospitalId: string; sigla: string; nombre: string; total: number }[]
}

// S5-8 — GET /api/v1/kpis/concursos-ceetps
export interface KpiConcursosCeetps {
  total: number
  porEstado: { estado: EstadoConcursoCeetps; total: number }[]
  porEscalafon: { escalafonId: string; codigo: string; nombre: string; total: number }[]
  porHospital: { hospitalId: string; sigla: string; nombre: string; total: number }[]
}

// S6-1 — GET /api/v1/kpis/dotacion
export interface KpiDotacion {
  totalVigentes: number
  vacantes: number
  porCarrera: {
    escalafonId: string
    codigo: string
    nombre: string
    vigentes: number
    vacantes: number
  }[]
  porEfector: {
    hospitalId: string
    sigla: string
    nombre: string
    vigentes: number
    vacantes: number
  }[]
}

// S6-3 — GET /api/v1/kpis/concursos
export interface KpiConcursos {
  totalCph: number
  totalCeetps: number
  total: number
  porSubEstadoCph: { subEstado: string; total: number }[]
  tiempoPromedioPorEtapa: { etapa: string; diasPromedio: number | null; muestras: number }[]
}

// S6-5 — GET /api/v1/kpis/dotacion-historica
export interface KpiDotacionHistorica {
  escalafones: string[] // nombres canónicos presentes en los datos
  puntos: {
    fecha: string
    total: number
    porEscalafon: Record<string, number> // escalafon.nombre -> personas acumuladas
  }[]
}

export type FiltroJefatura = 'todos' | 'solo' | 'sin'

// Filtros multivaluados del gráfico de evolución (OR dentro de cada dimensión,
// AND entre dimensiones). Puesto y especialidad son claves canónicas en
// MAYÚSCULAS; el front las muestra con capitalización legible.
export interface FiltrosDotacionEvolucion {
  siglas?: string[]
  carreras?: string[]
  puestos?: string[]
  especialidades?: string[]
  jefatura?: FiltroJefatura
  mesDesde?: string
  mesHasta?: string
}

// GET /api/v1/kpis/dotacion-evolucion/opciones
// Opciones FACETADAS: para cada dimensión, los valores válidos dado el resto de
// los filtros ya elegidos. Listas planas normalizadas.
export interface KpiDotacionEvolucionOpciones {
  siglas: string[]
  carreras: string[]
  puestos: string[]
  especialidades: string[]
  meses: string[] // 'YYYY-MM' disponibles, para el rango temporal
}

// GET /api/v1/kpis/dotacion-evolucion
// Serie mensual de stock (foto reconstruida a fin de mes). Una sola línea =
// suma de todo lo seleccionado.
export interface KpiDotacionEvolucion {
  siglas: string[]
  carreras: string[]
  puestos: string[]
  especialidades: string[]
  jefatura: FiltroJefatura
  mesDesde: string | null
  mesHasta: string | null
  puntos: {
    mes: string // 'YYYY-MM'
    cantidad: number
  }[]
}

// S6-6 — GET /api/v1/kpis/alertas
export interface KpiAlertas {
  concursosVencidos: {
    id: string
    cargoCodigo: string
    hospitalSigla: string
    subEstado: string | null
    fechaInscHasta: string | null
    diasVencido: number
  }[]
  bajasSinConcurso: {
    id: string
    cargoCodigo: string
    hospitalSigla: string
    fechaBaja: string
    diasSinConcurso: number
    personaApellidoNombre: string | null
  }[]
}

// KPIs de bajas — GET /api/v1/kpis/bajas
export interface KpiBajas {
  bajasAValidar: number
  bajasConfirmadas: number
  porEscalafon: { escalafon: string; total: number }[]
}

// -----------------------------------------------------------------------------
// FILTROS
// -----------------------------------------------------------------------------

export interface PersonaFilters {
  search?: string
  activo?: boolean
  hospitalId?: string
  escalafonId?: string
  // Texto libre (Cargo.literalPuesto/especialidad no tienen catálogo/FK) —
  // igualdad exacta contra los valores que devuelve GET /api/v1/puestos.
  puesto?: string
  especialidad?: string
  idSial?: string
  // Solo personas con una ocupación vigente de jefatura (codigoJefaturas).
  soloJefes?: boolean
  page?: number
  limit?: number
}

export interface CargoFilters {
  search?: string
  personaSearch?: string
  hospitalId?: string
  escalafonId?: string
  puesto?: string
  especialidad?: string
  estado?: EstadoCargo
  ocupado?: boolean
  // Solo cargos cuya ocupación vigente es de jefatura (codigoJefaturas).
  soloJefes?: boolean
  page?: number
  limit?: number
}

export interface ConcursoFilters {
  hospitalId?: string
  tipoConcurso?: TipoConcurso
  estado?: string
  page?: number
  limit?: number
}

// S4-1: subEstado filtra contra el valor persistido; subEstado3 se recalcula
// en vivo en el backend al filtrar (ver SUB_ESTADO_3_SQL_PG) — depende de la
// fecha de hoy y puede desactualizarse solo con el paso del tiempo.
export interface ConcursoCphFilters {
  page?: number
  limit?: number
  hospitalId?: string
  estado?: EstadoConcursoCph
  subEstado?: string
  subEstado3?: string
  suspendido?: boolean
  search?: string
  conFaltantes?: boolean
  especialidad?: string
  origen?: 'baja' | 'ampliacion' | 'cobertura'
  // CSV de ids de etiqueta — un concurso matchea si tiene al menos una.
  etiquetaIds?: string
  // Etapa 5: concursos con persona elegida del orden de mérito
  // (inscriptoReservadoId o personaDesignadaId).
  personaOm?: boolean
  // Etapa 5: concursos validados contra el padrón (flag validado).
  validado?: boolean
}

// ─── Etapa 5 CPH: estado de designación / validación contra el padrón ────────
export type EstadoValidacionDesignacion =
  | 'sin_persona' // el CUIL no está en el padrón todavía
  | 'esperando_padron' // está en el padrón pero sin rol que coincida
  | 'rol_no_coincide' // tiene rol(es) nuevos pero ninguno coincide en carrera+especialidad
  | 'validado' // tiene un id SIAL rol que coincide en carrera y especialidad

// Datos completos de la persona designada/reservada (todo lo que tengamos).
export interface PersonaDesignadaDetalle {
  id: string
  cuil: string
  apellidoNombre: string
  numeroDoc: string | null
  tipoDoc: string | null
  fechaNacimiento: string | null
  sexo: string | null
  especialidadPrincipal: string | null
  especialidadCph: string | null
  telefono: string | null
  mailLaboral: string | null
  mailPersonal: string | null
  domicilio: string | null
  localidad: string | null
  provincia: string | null
  antiguedadDesde: string | null
  activo: boolean
}

// Resumen de una ocupación (cargo + rol) para mostrar cargo actual / último.
export interface OcupacionResumen {
  idSialRol: string
  cargoCodigo: string | null
  cargoIdSial: string
  literalPuesto: string | null
  escalafonId: string
  escalafonNombre: string | null
  especialidadLegacy: string | null
  situacionRevista: string | null // incluye 'Retencion de Cargo'
  estadoPersona: string | null
  cargoEstado: string // vigente | no_vigente | validacion_vacante
  hospitalSigla: string | null
  desde: string | null
  hasta: string | null // null = vigente
  carreraCoincide: boolean
  especialidadCoincide: boolean
}

export interface DesignacionEstado {
  fuente: 'persona_designada' | 'inscripto_reservado' | null
  cuil: string | null
  existeEnPadron: boolean
  // Datos del inscripto reservado del orden de mérito (Etapa 4). Están
  // disponibles aunque la persona todavía no figure en el padrón.
  inscripto: { apellido: string; nombre: string; cuil: string | null } | null
  persona: PersonaDesignadaDetalle | null
  ocupacionVigente: OcupacionResumen | null
  ultimaOcupacion: OcupacionResumen | null // última cerrada si no hay vigente
  concurso: {
    escalafonId: string | null
    escalafonNombre: string | null
    especialidadSolicitada: string | null
  }
  validacion: {
    estado: EstadoValidacionDesignacion
    idSialRolValidado: string | null
    mensaje: string
  }
}

// ─── Preview de validaciones al subir un padrón ──────────────────────────────
// Concursos CPH que quedarían validados al aprobar+vincular los diffs "nuevo".
export interface ValidacionPreviewItem {
  diffId: string
  idSialRol: string
  idSial: string | null
  cuil: string
  concursoCphId: string
  concursoCodigo: string | null
  personaNombre: string
  especialidadDiff: string | null
  especialidadConcurso: string | null
  carreraCoincide: boolean
  especialidadCoincide: boolean
  // Sugerido para validar: coincide carrera Y especialidad.
  validable: boolean
  yaValidado: boolean
}

export interface ValidacionesPreview {
  resumen: { total: number; validables: number }
  detalle: ValidacionPreviewItem[]
}

export interface ConcursoCeetpsFilters {
  page?: number
  limit?: number
  hospitalId?: string
  escalafonId?: string
  estado?: EstadoConcursoCeetps
  search?: string
}

export interface BajaFilters {
  page?: number
  limit?: number
  hospitalId?: string
  estado?: EstadoBaja
  search?: string
}

// S13 — POST /api/v1/solicitudes-alta
export interface CreateSolicitudAltaRequest {
  hospitalId: string
  escalafonId: string
  codigoRegistroId?: string
  literalPuesto: string
  especialidad?: string
  agrupador?: string
  unificadorPuesto?: string
  regimen?: string
  expediente?: string
  desde?: string
  cantidad?: number
  etiqueta?: string
  esTransferencia?: boolean
  bajaOrigenId?: string
}

// S13 — POST /api/v1/autorizaciones/:id/aprobar|rechazar
export interface ResolverAutorizacionRequest {
  observaciones?: string
}

// S5-10 — POST /api/v1/cargos (Alta de Cargo manual)
export interface CreateCargoRequest {
  hospitalId: string
  escalafonId: string
  codigoRegistroId?: string
  literalPuesto: string
  especialidad?: string
  agrupador?: string
  unificadorPuesto?: string
  regimen?: string
  expediente?: string
  desde?: string
  cantidad?: number
  forzar?: boolean
}

// S5-4 — POST /api/v1/bajas
// S5-5: tipoConcurso requerido cuando generaConcurso = true
export interface CreateBajaRequest {
  cargoId: string
  hospitalId: string
  personaId?: string
  fechaBaja: string
  tipoBaja?: string
  motivo?: string
  tipificadorOrigen?: string
  generaConcurso?: boolean
  tipoConcurso?: TipoConcurso
  escalafonId?: string
  observaciones?: string
}

// S5-1 — PATCH /api/v1/concursos-ceetps/:id. `estado` queda afuera — lo
// calcula el backend (calcEstadoCeetps), no es editable por el cliente.
export interface PatchConcursoCeetpsRequest {
  expedienteConcurso?: string | null
  puestoSolicitado?: string | null
  dispoLlamado?: string | null
  cargaHoraria?: number | null
  apertura2x18?: boolean
  informeApertura?: string | null
  expedienteConcurso2?: string | null
  fechaIfacs?: string | null
  fechaInsal?: string | null
  expedienteDesignacion?: string | null
  dispoDesignacion?: string | null
  resolucionDesignacion?: string | null
  personaDesignadaId?: string | null
  observaciones?: string | null
}

// -----------------------------------------------------------------------------
// SPRINT 3 — Detalle de persona/cargo
// -----------------------------------------------------------------------------

// Devuelto por GET /api/v1/personas/:id — cada Ocupacion trae `cargo`
// expandido (y a su vez `cargo.hospital`/`cargo.escalafon`).
//
// Nota: `Persona` (arriba) refleja lo que devuelve GET /api/v1/personas
// (listPersonasService) — un SELECT explícito de columnas, más liviano para
// paginar 45k+ filas, que deliberadamente NO trae los campos de contacto/
// domicilio (S2-17). El detalle sí usa `prisma.persona.findUnique` sin
// `select`, así que trae el modelo completo — de ahí que estos campos vivan
// acá y no en `Persona`.
// S8C-2: entrada del historial de padrón de una persona
export interface PadronHistoricoItem {
  id: string
  fechaAsignada: string
  idSialRol: string
  escalafon: string | null
  hospitalSigla: string | null
  literalPuesto: string | null
  especialidad: string | null
  agrupador: string | null
  situacionRevista: string | null
  estadoPersona: string | null
  snapshot: { id: string; fechaAsignada: string; filename: string }
}

export interface PersonaDetail extends Persona {
  telefono: string | null
  mailPersonal: string | null
  mailLaboral: string | null
  domicilio: string | null
  localidad: string | null
  provincia: string | null
  antiguedadDesde: string | null
  ocupaciones: OcupacionConCargo[]
  padronHistorico: PadronHistoricoItem[]
  concursosCphDesignado: (Pick<
    ConcursoCph,
    | 'id'
    | 'estado'
    | 'subEstado'
    | 'resolucionDesignacion'
    | 'fechaResolucion'
    | 'cargoSial'
    | 'createdAt'
  > & {
    cargo: Pick<Cargo, 'id' | 'codigo' | 'literalPuesto'>
    hospital: Pick<Hospital, 'id' | 'sigla' | 'nombre'>
    concurso: { id: string; fechaVacante: string }
  })[]
}

// Devuelto por GET /api/v1/cargos/:id — `hospital`/`escalafon`/`codigoRegistro`
// siempre expandidos; `ocupacionActual` es la Ocupacion vigente (hasta IS NULL)
// con `persona` expandida, o null si el cargo está vacante.
export interface CargoDetail extends Cargo {
  hospital: Hospital
  escalafon: Escalafon
  codigoRegistro: CodigoRegistro | null
  ocupacionActual: (Ocupacion & { persona: Persona }) | null
  historial: (Ocupacion & { persona: Persona })[]
  cargoActivo: (Ocupacion & { cargo: Cargo & { hospital: Hospital; escalafon: Escalafon } }) | null
  // S8C-1: concursos asociados al cargo
  concursosCph: (ConcursoCph & {
    concurso: Concurso
    personaDesignada: Pick<Persona, 'id' | 'apellidoNombre' | 'cuil'> | null
  })[]
  concursosCeetps: (ConcursoCeetps & {
    concurso: Concurso
    escalafon: Escalafon
    personaDesignada: Pick<Persona, 'id' | 'apellidoNombre' | 'cuil'> | null
  })[]
  // S18-1: cargos remplazantes directos (R/TTR) generados sobre este cargo
  remplazantes?: Pick<Cargo, 'id' | 'codigo' | 'literalPuesto' | 'tipoOrigen' | 'estado'>[]
}

// PS16D — POST /api/v1/concursos-cph/:id/declarar-desierto
export interface DeclararDesiertoRequest {
  dispoDesierta: string
  fechaDispoDesierta: string
  sorteoJurado?: string | null
  disposicion?: string | null
  fechaInscDesde?: string | null
  fechaInscHasta?: string | null
  fechaExamen?: string | null
  fechaOrdenMerito?: string | null
  qInscriptos?: number | null
  eeDesignacion?: string | null
  cargaDocumentacion?: boolean | null
  fechaAptoMedico?: string | null
  fechaIte?: string | null
  proyectoResolucion?: boolean | null
  resoALaFirma?: boolean | null
  resolucionDesignacion?: string | null
  fechaResolucion?: string | null
  cargoSial?: string | null
  observaciones?: string | null
}

// Etapa 2 — Sorteo de jurado CPH.
// POST /api/v1/concursos-cph/:id/generar-sorteo
export interface GenerarSorteoJuradoRequest {
  cantTitulares?: number
  cantSuplentes?: number
  antiguedadMinimaAnios?: number
  // Hasta 2 especialidades extra que también cuentan como "cumple
  // especialidad" al priorizar candidatos, además de la especialidad propia
  // del concurso — amplía el pool de jurados elegibles por especialidad.
  especialidadesAdicionales?: string[]
  // Expediente que respalda las especialidades adicionales — obligatorio si
  // especialidadesAdicionales tiene al menos una.
  expedienteEspecialidades?: string
  semilla?: string
  observaciones?: string
}

export type RolJurado = 'titular' | 'suplente'
export type AmbitoJurado = 'hospital' | 'sistema' | 'mixto'

export interface MiembroJuradoSorteado {
  id: string
  sorteoJuradoId: string
  personaId: string
  rol: RolJurado
  orden: number
  apellidoNombre: string
  cuil: string
  hospitalId: string | null
  hospitalNombre: string | null
  puesto: string | null
  especialidad: string | null
  ambito: 'hospital' | 'sistema'
  reglaAplicada: number | null
  cumpleEspecialidad: boolean
  esConduccion: boolean
  antiguedadAnios: number | null
  createdAt: string
}

// Snapshot de criterios usados, guardado en el acta (SorteoJurado.criterios).
export interface CriteriosSorteoJurado {
  cantTitulares: number
  cantSuplentes: number
  antiguedadMinimaAnios: number
  escalafonId: string
  escalafonNombre: string | null
  hospitalId: string
  hospitalNombre: string | null
  especialidadConcurso: string | null
  // Especialidades extra que también cuentan como "cumple especialidad" +
  // expediente que las respalda (obligatorio si hay al menos una).
  especialidadesAdicionales?: string[]
  expedienteEspecialidades?: string | null
  // Tipo de gestión del concurso al momento de sortear (centralizado =
  // regla única en toda la base; descentralizado = cascada por modalidad).
  // Ausente en actas generadas antes de esta distinción: tratar como
  // 'descentralizado'.
  tipoGestion?: 'centralizado' | 'descentralizado' | null
  // Modalidad del cargo a concursar (guardia = POU, planta = POF) — define
  // qué set de reglas se aplicó en un concurso descentralizado (ver
  // sorteoJurado.service.ts). `null` si el concurso es centralizado (no
  // aplica distinción POF/POU ahí). Ausente en actas generadas antes de
  // esta distinción: tratar como 'pof'.
  modalidadConcurso?: 'pou' | 'pof' | null
  totalCandidatos: number
  candidatosMismoHospital: number
  // Cascada de reglas: hasta qué regla se bajó (1|2|3 en POF, 1|2|3|4 en POU)
  // y cuántos candidatos por regla.
  reglaUsada?: number
  candidatosPorRegla?: Record<number, number>
}

export interface SorteoJurado {
  id: string
  concursoCphId: string
  fechaSorteo: string
  semilla: string
  criterios: CriteriosSorteoJurado
  ambito: AmbitoJurado
  observaciones: string | null
  confirmado: boolean
  confirmadoAt: string | null
  confirmadoPorId: string | null
  generadoPorId: string | null
  createdAt: string
  miembros: MiembroJuradoSorteado[]
}

// Jurado confirmado vigente (reutilizable) — SorteoJurado + fecha de
// vencimiento (fechaSorteo + 6 meses) + datos del concurso de origen.
export interface JuradoVigente extends SorteoJurado {
  fechaVencimiento: string
  // true si el sorteo está dentro de los 6 meses de vigencia (reutilizable).
  vigente: boolean
  concursoCph?: {
    id: string
    especialidadSolicitada: string | null
    concurso?: {
      cargo?: {
        codigo: string | null
        literalPuesto: string | null
        especialidadLegacy: string | null
        escalafonId: string
        hospital?: { sigla: string | null; nombre: string | null } | null
      } | null
    } | null
  } | null
}

// Integrante de una orden de mérito (documento reutilizable).
export interface OrdenMeritoIntegrante {
  id: string
  ordenMeritoId: string
  personaId: string | null
  cuil: string
  apellidoNombre: string
  especialidad: string | null
  posicion: number
  designado: boolean
  concursoCphDesignadoId: string | null
  anulado: boolean
  motivoAnulado: string | null
  createdAt: string
}

// Orden de mérito vigente (reutilizable) con sus integrantes y el concurso
// de origen. `disponibles` = integrantes ni designados ni anulados.
export interface OrdenMeritoVigente {
  id: string
  concursoCphId: string
  especialidad: string
  puesto: string | null
  expediente: string | null
  fechaPublicacion: string
  fechaVencimiento: string
  fechaProrroga: string | null
  estado: 'vigente' | 'prorrogada' | 'vencida'
  observaciones: string | null
  disponibles: number
  integrantes: OrdenMeritoIntegrante[]
  concursoCph?: {
    id: string
    especialidadSolicitada: string | null
    concurso?: {
      cargo?: {
        codigo: string | null
        literalPuesto: string | null
        especialidadLegacy: string | null
        escalafonId: string
        hospital?: { sigla: string | null; nombre: string | null } | null
      } | null
    } | null
  } | null
}

// Candidato de OM reservado para un concurso (Etapa 4) + disponibles restantes.
export interface CandidatoOmReservado {
  integrante: OrdenMeritoIntegrante & { ordenMerito: OrdenMeritoVigente | Record<string, unknown> }
  disponiblesRestantes: number
}

// Etapa 3 — Inscriptos al concurso CPH.
export interface InscriptoConcurso {
  id: string
  concursoCphId: string
  apellido: string
  nombre: string
  dni: string | null
  cuil: string | null
  sexo: string | null
  fechaNacimiento: string | null
  nacionalidad: string | null
  telefono: string | null
  email: string | null
  titulo: string | null
  matricula: string | null
  especialidad: string | null
  presentoExamen: boolean
  // Nota del examen (0-10) — fuente del orden de mérito, calculado y
  // persistido desde el frontend cada vez que cambia (ver ConcursoCphWizard).
  nota: number | null
  ordenMerito: number | null
  observaciones: string | null
  createdAt: string
  updatedAt: string
}

// POST/PATCH /api/v1/concursos-cph/:id/inscriptos
export interface InscriptoRequest {
  apellido: string
  nombre: string
  dni?: string | null
  cuil?: string | null
  sexo?: string | null
  fechaNacimiento?: string | null
  nacionalidad?: string | null
  telefono?: string | null
  email?: string | null
  titulo?: string | null
  matricula?: string | null
  especialidad?: string | null
  presentoExamen?: boolean
  nota?: number | null
  ordenMerito?: number | null
  observaciones?: string | null
}

// Resultado de POST /api/v1/concursos-cph/:id/inscriptos/importar
export interface ImportarInscriptosResult {
  creados: number
  ignorados: number
  total: number
}

// S16 — POST /api/v1/concursos-cph/:id/designar y /concursos-ceetps/:id/designar
export interface DesignarConcursoRequest {
  personaId: string
  personaDesignadaId?: string
  fechaDesde?: string | null
  idSialRol?: string | null
  resolucionDesignacion?: string | null
  fechaResolucion?: string | null
  cargoSial?: string | null
  observaciones?: string | null
}

// ---- SPRINT 18 — Retención de cargos ----

export const TipoOrigen = {
  R: 'R',     // remplazante de ejecución
  TTR: 'TTR', // remplazante de conducción (Titular Transitorio por Reemplazo)
} as const
export type TipoOrigen = typeof TipoOrigen[keyof typeof TipoOrigen] | null

// Nodo de una cadena de retención — distinto de `NodoCadena` (useCadenaMando.ts,
// feature no relacionada de "cadena de mando"/jerarquía org).
export interface NodoCadenaRetencion {
  id: string
  codigo: string | null
  literalPuesto: string | null
  tipoOrigen: TipoOrigen
  estado: EstadoCargo
  estaOcupado: boolean
  ocupanteNombre?: string
  ocupanteCuil?: string
  periodoDesde?: string | null
  periodoHasta?: string | null
  cargoRetenidoId?: string | null
}

// Devuelto por GET /api/v1/retenciones/cadena/:cargoId
export interface CadenaRetencion {
  cargoBaseId: string
  nodos: NodoCadenaRetencion[] // ordenados base → más reciente
}

// POST /api/v1/retenciones
export interface RegistrarRetencionRequest {
  cargoId: string
  srDocRespaldo: string
  srComentario?: string
  periodoDesde?: string
  periodoHasta?: string
}

// POST /api/v1/retenciones/titular-cesa
export interface TitularCesaRequest {
  cargoId: string
  ocupanteRId: string
  docRespaldo: string
}

// Cargo dentro de un candidato de GET /api/v1/retenciones/validacion — forma
// distinta a NodoCadenaRetencion (no viene de una cadena, viene de las
// ocupaciones activas simultáneas de una persona)
export interface CargoValidacionRetencion {
  id: string
  codigo: string | null
  literalPuesto: string | null
  tipoOrigen: TipoOrigen
  estado: EstadoCargo
  hospital: { sigla: string; nombre: string }
  escalafon: { nombre: string }
  situacionRevista: string | null
}

// GET /api/v1/retenciones/validacion — personas con 2+ cargos activos
// simultáneos sin que ninguno esté formalizado como retención ni comisión
export interface CandidatoRetencion {
  persona: Pick<Persona, 'id' | 'apellidoNombre' | 'cuil'>
  cargos: CargoValidacionRetencion[]
}

// GET /api/v1/retenciones/retenidos — cargos ya retenidos
// (situacionRevista = 'Retencion de Cargo'), con su remplazante R/TTR si existe.
// Agrupado por PERSONA: una persona puede retener más de un cargo.
export interface CargoRetenidoItem {
  persona: Pick<Persona, 'id' | 'apellidoNombre' | 'cuil'>
  // Cargos que esta persona retiene (situacionRevista = 'Retencion de Cargo').
  retenidos: {
    ocupacionId: string
    id: string
    codigo: string | null
    literalPuesto: string | null
    tipoOrigen: TipoOrigen
    hospitalSigla: string
    escalafon: string
    srDocRespaldo: string | null
  }[]
  // Cargo(s) que la persona ejerce actualmente (ocupaciones activas no
  // retenidas), con su vencimiento (venceEl) si lo tienen (solo TTR vencen).
  cargosActuales: {
    id: string
    codigo: string | null
    literalPuesto: string | null
    tipoOrigen: TipoOrigen
    situacionRevista: string | null
    hospitalSigla: string
    escalafon: string
    // true si es jefatura/conducción — su vencimiento es inicio + 4 años.
    esConduccion: boolean
    venceEl: string | null
  }[]
}

// ─── Sprint 19 — Vencimientos, renovación y comisión ────────────────────────

export type UrgenciaVencimiento = 'ok' | 'aviso' | 'recordatorio' | 'critico' | 'vencido'

// Fila de la vista de vencimientos de conducción (frontend arma la urgencia a
// partir de diasRestantes; el backend puede enviarla ya calculada).
export interface VencimientoCargo {
  id: string
  codigo: string | null
  literalPuesto: string | null
  hospitalSigla: string
  ocupanteNombre?: string
  ocupanteCuil?: string
  periodoHasta: string
  diasRestantes: number
  urgencia: UrgenciaVencimiento
  periodoRenovado: boolean
}

// PATCH /api/v1/retenciones/:cargoId/renovar
export interface RenovarPeriodoRequest {
  periodoHasta: string // 'YYYY-MM-DD'
}

// POST /api/v1/comisiones — registrar una comisión sobre una ocupación activa
export interface ComisionInput {
  ocupacionId: string
  comision: string      // motivo / descripción
  repaComision: string  // repartición / hospital de destino
  crComentario?: string
}
