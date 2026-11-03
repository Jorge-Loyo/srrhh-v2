// Estado calculado server-side de un concurso CEETPS, a partir de sus campos.
//
// Puerto directo (sin cambio de comportamiento) de la función local
// `calcEstadoCeetps` que vivía en concursos-ceetps.service.ts. Se extrae a un
// módulo propio exportable para poder reutilizarla desde el script de carga
// masiva (scripts/carga-concursos) y testearla aislada, igual que
// concursosCph.calc.ts hace con `calcConcursoCph`.
//
// Flujo CEETPS (ver PLAN_SCRUM_2026.md §4.2):
//   sin_autorizar → autorizado → en_proceso → finalizado / desierto
// `desierto` NO se deriva acá: solo se setea por designación/desierto manual.
//
// subEstado: campo granular que espeja los 8 estados string del legacy
// (computeEstadoConcurso en concursalesHelpers.js), permitiendo distinguir
// qué etapa puntual alcanzó el concurso sin expandir el enum principal.

export interface ConcursoCeetpsCalcInput {
  expedienteConcurso: string | null
  fechaCaratulacion: Date | null
  puestoSolicitado: string | null
  dispoLlamado: string | null
  fechaIfacs: Date | null
  fechaInsal: Date | null
  expedienteDesignacion: string | null
  dispoDesignacion: string | null
  resolucionDesignacion: string | null
}

// String literal en vez del enum de @prisma/client a propósito (mismo criterio
// que EstadoConcursoCphCalc): son tipos nominalmente distintos aunque compartan
// valores; el caller castea al enum de Prisma en el único punto del write.
export type EstadoConcursoCeetpsCalc = 'sin_autorizar' | 'autorizado' | 'en_proceso' | 'finalizado'

// Sub-estados que espean los 8 estados granulares del legacy.
// Los valores en SCREAMING_SNAKE_CASE se persisten en la columna sub_estado.
export type SubEstadoCeetps =
  | 'EXP_CARATULADO'    // expediente caratulado, sin autorización aún
  | 'DISPO_LLAMADO'     // disposición de llamado emitida
  | 'IFACS'             // en etapa IFACS
  | 'INSAL'             // en etapa INSAL
  | 'TAD'               // expediente de designación en TAD
  | 'DISPO_DESIGNACION' // disposición de designación emitida
  | null

export interface CalcCeetpsResult {
  estado: EstadoConcursoCeetpsCalc
  subEstado: SubEstadoCeetps
}

export function calcEstadoCeetps(row: ConcursoCeetpsCalcInput): CalcCeetpsResult {
  // Terminal — ya tiene resolución de designación
  if (row.resolucionDesignacion) {
    return { estado: 'finalizado', subEstado: null }
  }

  // en_proceso: etapa de designación
  if (row.dispoDesignacion) {
    return { estado: 'en_proceso', subEstado: 'DISPO_DESIGNACION' }
  }
  if (row.expedienteDesignacion) {
    return { estado: 'en_proceso', subEstado: 'TAD' }
  }

  // en_proceso: etapas INSAL/IFACS/Dispo de llamado
  if (row.fechaInsal) {
    return { estado: 'en_proceso', subEstado: 'INSAL' }
  }
  if (row.fechaIfacs) {
    return { estado: 'en_proceso', subEstado: 'IFACS' }
  }
  if (row.dispoLlamado) {
    return { estado: 'en_proceso', subEstado: 'DISPO_LLAMADO' }
  }

  // autorizado: se cargó puesto solicitado
  if (row.puestoSolicitado) {
    return { estado: 'autorizado', subEstado: null }
  }

  // sin_autorizar con expediente caratulado
  if (row.expedienteConcurso || row.fechaCaratulacion) {
    return { estado: 'sin_autorizar', subEstado: 'EXP_CARATULADO' }
  }

  return { estado: 'sin_autorizar', subEstado: null }
}
