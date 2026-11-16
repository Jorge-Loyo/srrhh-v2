// ─── Paso 2a: autorización obligatoria en concursos de CARGO NUEVO ───────────
// Un concurso con motivoConcurso = 'nuevo_cargo' y sin `autorizadoAt` no puede
// avanzar a la Etapa 2: las Etapas 2–5 quedan bloqueadas hasta que SGRASV
// autorice. Los demás concursos (incluido motivo null) no cambian.
export const ETAPAS_BLOQUEABLES_POR_AUTORIZACION = [
  'autorizacion',
  'inscripcion',
  'ifacs_insal',
  'designacion',
]

interface ConcursoAutorizable {
  motivoConcurso?: string | null
  autorizadoAt?: string | Date | null
}

export function esNuevoCargoSinAutorizar(c: ConcursoAutorizable | null | undefined): boolean {
  return !!c && c.motivoConcurso === 'nuevo_cargo' && !c.autorizadoAt
}

/** Marca como 'bloqueada' las Etapas 2–5 de un nuevo_cargo sin autorizar; la Etapa 1 queda 'activa' (se re-edita/re-solicita). */
export function aplicarBloqueoPorAutorizacion<T extends { id: string; estado: string }>(
  etapas: T[],
  c: ConcursoAutorizable | null | undefined,
): T[] {
  if (!esNuevoCargoSinAutorizar(c)) return etapas
  return etapas.map((e) => {
    if (ETAPAS_BLOQUEABLES_POR_AUTORIZACION.includes(e.id)) return { ...e, estado: 'bloqueada' }
    if (e.id === 'baja') return { ...e, estado: 'activa' }
    return e
  })
}

/** Texto del aviso de autorización para concursos nuevo_cargo (null si no aplica). */
export function avisoAutorizacionNuevoCargo(
  c: ConcursoAutorizable | null | undefined,
): 'Pendiente de autorización de SGRASV' | 'Autorizado' | null {
  if (!c || c.motivoConcurso !== 'nuevo_cargo') return null
  return c.autorizadoAt ? 'Autorizado' : 'Pendiente de autorización de SGRASV'
}

// ─── Paso 2b: CEETPS ──────────────────────────────────────────────────────────
// Campos de Etapa 2+ (Disposición, IFACS/INSAL, Designación) que el backend rechaza
// con 409 si cambian en un nuevo_cargo sin autorizar (ver concursos-ceetps/autorizacionNuevoCargo.ts).
export const CAMPOS_CEETPS_BLOQUEADOS_POR_AUTORIZACION = [
  'fechaAutorizacion',
  'dispoLlamado',
  'tipoGestion',
  'fechaIfacs',
  'fechaInsal',
  'expedienteDesignacion',
  'dispoDesignacion',
  'resolucionDesignacion',
  'puestoDesignado',
  'estadoApto',
  'numeroAptoMedico',
  'fechaProyectoDispo',
  'altaSial',
  'codigoSial',
]

/** Copia del body sin los campos de Etapa 2+ si el concurso es nuevo_cargo sin autorizar. */
export function omitirCamposCeetpsBloqueados<T extends Record<string, unknown>>(
  body: T,
  c: ConcursoAutorizable | null | undefined,
): Partial<T> {
  if (!esNuevoCargoSinAutorizar(c)) return body
  const r: Record<string, unknown> = { ...body }
  for (const k of CAMPOS_CEETPS_BLOQUEADOS_POR_AUTORIZACION) delete r[k]
  return r as Partial<T>
}
