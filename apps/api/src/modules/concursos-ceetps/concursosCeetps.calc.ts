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

export interface ConcursoCeetpsCalcInput {
  expedienteConcurso: string | null
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

export function calcEstadoCeetps(row: ConcursoCeetpsCalcInput): EstadoConcursoCeetpsCalc {
  if (row.resolucionDesignacion) return 'finalizado'
  if (row.dispoDesignacion || row.expedienteDesignacion) return 'en_proceso'
  if (row.dispoLlamado || row.fechaIfacs || row.fechaInsal) return 'en_proceso'
  if (row.puestoSolicitado) return 'autorizado'
  return 'sin_autorizar'
}
