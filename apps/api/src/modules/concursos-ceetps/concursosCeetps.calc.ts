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
  // Paso 2b: estado de autorización SGRASV de un concurso nuevo_cargo. `undefined`
  // (resto de los concursos y callers que no lo pasan) = comportamiento de siempre.
  autorizacionNuevoCargo?: AutorizacionNuevoCargoCeetpsCalc
}

export type AutorizacionNuevoCargoCeetpsCalc = 'sin_solicitar' | 'pendiente' | 'autorizado'

// String literal en vez del enum de @prisma/client a propósito (mismo criterio
// que EstadoConcursoCphCalc): son tipos nominalmente distintos aunque compartan
// valores; el caller castea al enum de Prisma en el único punto del write.
export type EstadoConcursoCeetpsCalc = 'sin_autorizar' | 'autorizado' | 'en_proceso' | 'finalizado'

// Sub-estados que espean los 8 estados granulares del legacy.
// Los valores en SCREAMING_SNAKE_CASE se persisten en la columna sub_estado.
export type SubEstadoCeetps =
  | 'EXP_CARATULADO'    // expediente caratulado, sin autorización aún
  | 'A_AUTORIZACION'    // nuevo_cargo: expediente + IF enviados, esperando a SGRASV
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

  // Paso 2b (nuevo_cargo): la autorización de SGRASV manda sobre el puesto solicitado.
  const aut = row.autorizacionNuevoCargo
  if (aut === 'autorizado') {
    return { estado: 'autorizado', subEstado: null }
  }
  if (aut === 'pendiente' && (row.expedienteConcurso || row.fechaCaratulacion)) {
    return { estado: 'sin_autorizar', subEstado: 'A_AUTORIZACION' }
  }

  // autorizado: se cargó puesto solicitado (nuevo_cargo sin autorizar: no aplica)
  if (row.puestoSolicitado && aut === undefined) {
    return { estado: 'autorizado', subEstado: null }
  }

  // sin_autorizar con expediente caratulado
  if (row.expedienteConcurso || row.fechaCaratulacion) {
    return { estado: 'sin_autorizar', subEstado: 'EXP_CARATULADO' }
  }

  return { estado: 'sin_autorizar', subEstado: null }
}

// ─── Etapa (1..5) del stepper de la bandeja "Gestión de Concursos" ────────────
// El stepper de 5 pasos es el de CPH (Apertura/Autorización, Jurado/Dispo,
// Inscripción/Examen/OM, IFACS/INSAL, Designación). CEETPS no tiene los
// sub-estados de jurado/inscripción de CPH, así que su etapa se deriva de
// estado + subEstado:
//   1: sin_autorizar
//   2: autorizado — SGRASV autorizó el concurso; en esta etapa se toman los
//      jurados del sorteo de la dotación (CEETPS no sortea por su cuenta)
//   3: DISPO_LLAMADO
//   4: IFACS / INSAL
//   5: TAD / DISPO_DESIGNACION / finalizado / desierto
export type EtapaCeetps = 1 | 2 | 3 | 4 | 5

export function etapaCeetps(estado: string, subEstado: string | null): EtapaCeetps {
  if (estado === 'finalizado' || estado === 'desierto') return 5
  if (subEstado === 'TAD' || subEstado === 'DISPO_DESIGNACION') return 5
  if (subEstado === 'IFACS' || subEstado === 'INSAL') return 4
  if (subEstado === 'DISPO_LLAMADO') return 3
  if (estado === 'autorizado') return 2
  if (estado === 'en_proceso') return 3 // en_proceso sin sub_estado: piso de etapa 3
  return 1
}

// where de Prisma equivalente a etapaCeetps(...) === etapa. null = etapa fuera
// de 1..5 (el caller no consulta).
export function whereEtapaCeetps(etapa: number): Record<string, unknown> | null {
  switch (etapa) {
    case 1:
      return { estado: 'sin_autorizar' }
    case 2:
      return { estado: 'autorizado' }
    case 3:
      return {
        OR: [
          { subEstado: 'DISPO_LLAMADO' },
          { estado: 'en_proceso', subEstado: null },
        ],
      }
    case 4:
      return { subEstado: { in: ['IFACS', 'INSAL'] } }
    case 5:
      return {
        OR: [
          { estado: { in: ['finalizado', 'desierto'] } },
          { subEstado: { in: ['TAD', 'DISPO_DESIGNACION'] } },
        ],
      }
    default:
      return null
  }
}
