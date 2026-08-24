// =============================================================================
// SRRHH v2 — Tipos compartidos entre API y Web
// =============================================================================
// Fuente de verdad para los contratos de datos entre frontend y backend.
// Cualquier cambio aquí se refleja automáticamente en ambos lados.
// =============================================================================

// -----------------------------------------------------------------------------
// ENUMS
// -----------------------------------------------------------------------------

export enum EstadoCargo {
  VIGENTE = 'vigente',
  NO_VIGENTE = 'no_vigente',
}

export enum EstadoSnapshot {
  PENDIENTE = 'pendiente',
  APROBADO = 'aprobado',
  RECHAZADO = 'rechazado',
}

export enum TipoDiff {
  NUEVO = 'nuevo',
  MODIFICADO = 'modificado',
  ELIMINADO = 'eliminado',
}

export enum TipoConcurso {
  CPH = 'cph',
  CEETPS = 'ceetps',
  SIN_CONCURSO = 'sin_concurso',
}

export enum EstadoConcursoCph {
  NO_INICIADO = 'no_iniciado',
  ACTIVO = 'activo',
  FINALIZADO = 'finalizado',
  SUSPENDIDO = 'suspendido',
  DESIERTO = 'desierto',
}

export enum EstadoConcursoCeetps {
  SIN_AUTORIZAR = 'sin_autorizar',
  AUTORIZADO = 'autorizado',
  EN_PROCESO = 'en_proceso',
  FINALIZADO = 'finalizado',
  DESIERTO = 'desierto',
}

export enum RolUsuario {
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer',
  DIRECTOR = 'director',
  CONCURSALES_CPH = 'concursales_cph',
  CONCURSALES_CEETPS = 'concursales_ceetps',
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

export interface Cargo {
  id: string
  idSial: string
  hospitalId: string
  escalafonId: string
  codigoRegistroId: string | null
  literalPuesto: string | null
  especialidad: string | null
  agrupador: string | null
  unificadorPuesto: string | null
  regimen: string | null
  estado: EstadoCargo
  createdAt: string
  updatedAt: string
  // Relaciones expandidas (opcionales)
  hospital?: Hospital
  escalafon?: Escalafon
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
  // Relaciones expandidas (opcionales)
  persona?: Persona
  cargo?: Cargo
}

export interface PadronSnapshot {
  id: string
  fechaAsignada: string
  filename: string
  totalRegistros: number
  estado: EstadoSnapshot
  aprobadoAt: string | null
  createdAt: string
  // Devuelto por GET /padron/snapshots (listSnapshotsService) — null si nadie
  // procesó/aprobó todavía ese snapshot (procesadoPorId/aprobadoPorId son
  // opcionales en el schema).
  procesadoPor: { username: string } | null
  aprobadoPor: { username: string } | null
}

export interface PadronDiff {
  id: string
  snapshotId: string
  tipo: TipoDiff
  idSialRol: string
  campo: string | null
  valorAnterior: string | null
  valorNuevo: string | null
  aprobado: boolean
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
  createdAt: string
  // Relaciones expandidas
  persona?: Persona
  cargo?: Cargo
  hospital?: Hospital
}

export interface ConcursoCph {
  id: string
  concursoId: string
  estado: EstadoConcursoCph
  subEstado: string | null
  especialidadSolicitada: string | null
  eeConcurso: string | null
  fechaAutorizacion: string | null
  disposicion: string | null
  fechaInscDesde: string | null
  fechaInscHasta: string | null
  fechaExamen: string | null
  // ... más campos según necesidad
  createdAt: string
  updatedAt: string
}

export interface ConcursoCeetps {
  id: string
  concursoId: string
  escalafonId: string
  estado: EstadoConcursoCeetps
  expedienteConcurso: string | null
  puestoSolicitado: string | null
  fechaIfacs: string | null
  fechaInsal: string | null
  // ... más campos según necesidad
  createdAt: string
  updatedAt: string
}

export interface Usuario {
  id: string
  username: string
  email: string
  rol: RolUsuario
  hospitalId: string | null
  activo: boolean
  createdAt: string
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
  rol: RolUsuario
  hospitalId?: string
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
  camposModificados: number
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

// -----------------------------------------------------------------------------
// FILTROS
// -----------------------------------------------------------------------------

export interface PersonaFilters {
  search?: string
  activo?: boolean
  hospitalId?: string
  escalafonId?: string
  page?: number
  limit?: number
}

export interface CargoFilters {
  search?: string
  hospitalId?: string
  escalafonId?: string
  estado?: EstadoCargo
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
