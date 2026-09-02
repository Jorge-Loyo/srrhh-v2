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
export type EstadoCargo = typeof EstadoCargo[keyof typeof EstadoCargo]

export const EstadoSnapshot = {
  PROCESANDO: 'procesando',
  PENDIENTE: 'pendiente',
  APROBADO: 'aprobado',
  RECHAZADO: 'rechazado',
  ERROR: 'error',
} as const
export type EstadoSnapshot = typeof EstadoSnapshot[keyof typeof EstadoSnapshot]

export const TipoDiff = {
  NUEVO: 'nuevo',
  MODIFICADO: 'modificado',
  ELIMINADO: 'eliminado',
} as const
export type TipoDiff = typeof TipoDiff[keyof typeof TipoDiff]

export const TipoConcurso = {
  CPH: 'cph',
  CEETPS: 'ceetps',
  SIN_CONCURSO: 'sin_concurso',
} as const
export type TipoConcurso = typeof TipoConcurso[keyof typeof TipoConcurso]

export const EstadoConcursoCph = {
  NO_INICIADO: 'no_iniciado',
  ACTIVO: 'activo',
  FINALIZADO: 'finalizado',
  SUSPENDIDO: 'suspendido',
  DESIERTO: 'desierto',
} as const
export type EstadoConcursoCph = typeof EstadoConcursoCph[keyof typeof EstadoConcursoCph]

export const EstadoConcursoCeetps = {
  SIN_AUTORIZAR: 'sin_autorizar',
  AUTORIZADO: 'autorizado',
  EN_PROCESO: 'en_proceso',
  FINALIZADO: 'finalizado',
  DESIERTO: 'desierto',
} as const
export type EstadoConcursoCeetps = typeof EstadoConcursoCeetps[keyof typeof EstadoConcursoCeetps]

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
  especialidad: string | null
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
  // S7-1/S7-2: campos de trazabilidad de alta manual
  expediente: string | null
  fechaDesde: string | null
  // Persona que ocupa el cargo actualmente (solo en listado, null si vacante)
  personaOcupante: Pick<Persona, 'id' | 'apellidoNombre' | 'cuil'> & { idSialRol: string } | null
  createdAt: string
  updatedAt: string
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
  eeBaja: string | null
  fechaBaja: string | null
  eeConcurso: string | null
  fechaEeConcurso: string | null
  fechaAutorizacion: string | null
  sorteoJurado: string | null
  disposicion: string | null
  fechaInscDesde: string | null
  fechaInscHasta: string | null
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
  personaDesignadaId: string | null
  suspendido: boolean
  observaciones: string | null
  createdAt: string
  updatedAt: string
  // Relaciones expandidas (GET /:id y listado)
  concurso?: Concurso
  hospital?: Hospital
  personaDesignada?: Persona
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
  CONCURSO_ESTANCADO:     'concurso_estancado',
  BAJA_PENDIENTE:         'baja_pendiente',
  AUTORIZACION_PENDIENTE: 'autorizacion_pendiente',
  AUTORIZACION_RESUELTA:  'autorizacion_resuelta',
} as const
export type TipoNotificacion = typeof TipoNotificacion[keyof typeof TipoNotificacion]

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

export const EstadoBaja = {
  PENDIENTE: 'pendiente',
  CONFIRMADA: 'confirmada',
  ANULADA: 'anulada',
} as const
export type EstadoBaja = typeof EstadoBaja[keyof typeof EstadoBaja]

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
  eeBaja?: string | null
  fechaBaja?: string | null
  eeConcurso?: string | null
  fechaEeConcurso?: string | null
  fechaAutorizacion?: string | null
  sorteoJurado?: string | null
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
  porCarrera: { escalafonId: string; codigo: string; nombre: string; vigentes: number; vacantes: number }[]
  porEfector: { hospitalId: string; sigla: string; nombre: string; vigentes: number; vacantes: number }[]
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
  escalafones: string[]  // nombres canónicos presentes en los datos
  puntos: {
    fecha: string
    total: number
    porEscalafon: Record<string, number>  // escalafon.nombre -> personas acumuladas
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
  }[]
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
  page?: number
  limit?: number
}

export interface CargoFilters {
  search?: string
  hospitalId?: string
  escalafonId?: string
  puesto?: string
  estado?: EstadoCargo
  ocupado?: boolean
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
  // S8C-2: historial completo en padrón semanal
  padronHistorico: PadronHistoricoItem[]
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
}
