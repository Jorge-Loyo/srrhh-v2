// ─── S4-4: calcSubEstado / calcEstado — 18 niveles calculados automáticamente ──
//
// Puerto a TypeScript de `calcEstado`/`calcSubEstado`/`calcSubEstado3` del
// sistema legacy (dotacion-rrhh/app/src/modules/seguimiento-cph/seguimientoCphCalc.js).
// Ahí el cliente podía mandar `estado`/`sub_estado` a mano en el PUT (el
// backend no los recalculaba) — acá es al revés a propósito, ver criterio de
// éxito de Sprint 4 ("sub-estado calculado automáticamente, no editable
// manualmente"): concursos-cph.schema.ts no acepta estos 3 campos en el PATCH,
// y concursosCph.service.ts los recalcula y persiste en cada create/update.
//
// Mismos nombres de nivel que el legacy (con su prefijo de letra) para no
// perder trazabilidad frente a los datos históricos que puedan migrarse más
// adelante — solo cambian los nombres de campo (camelCase, los del schema
// nuevo) y los 3 campos que no existían en el legacy con este tipo
// (sorteoJurado es fecha acá, no boolean).

export interface ConcursoCphCalcInput {
  suspendido: boolean
  // Baja / apertura del concurso
  eeBaja: string | null
  fechaBaja: Date | null
  eeConcurso: string | null
  fechaEeConcurso: Date | null
  // Autorización
  fechaAutorizacion: Date | null
  sorteoJurado: Date | null
  disposicion: string | null
  // Inscripción / examen / orden de mérito
  fechaInscHasta: Date | null
  fechaExamen: Date | null
  fechaOrdenMerito: Date | null
  // IFACS / INSAL
  fechaIfacs: Date | null
  fechaInsal: Date | null
  // Designación
  eeDesignacion: string | null
  cargaDocumentacion: boolean | null
  fechaAptoMedico: Date | null
  fechaIte: Date | null
  proyectoResolucion: boolean | null
  resoALaFirma: boolean | null
  resolucionDesignacion: string | null
  fechaResolucion: Date | null
  cargoSial: string | null
  // Desierto
  dispoDesierta: string | null
  fechaDispoDesierta: Date | null
}

// String literal en vez del enum de @srrhh/types o @prisma/client a propósito:
// son dos tipos nominalmente distintos aunque compartan los mismos valores, y
// asignar uno donde se espera el otro es un error de TS. El caller (service)
// castea al enum de Prisma en el único punto donde hace falta (el write).
export type EstadoConcursoCphCalc = 'no_iniciado' | 'activo' | 'finalizado' | 'suspendido' | 'desierto'

export interface ConcursoCphCalcResult {
  estado: EstadoConcursoCphCalc
  subEstado: string
  subEstado3: string
}

function calcEstadoBase(row: ConcursoCphCalcInput): EstadoConcursoCphCalc {
  if (row.resolucionDesignacion) return 'finalizado'
  if (row.eeBaja && row.eeConcurso && row.fechaBaja && row.fechaEeConcurso) return 'activo'
  return 'no_iniciado'
}

function calcSubEstado(row: ConcursoCphCalcInput): string {
  if (row.fechaDispoDesierta && row.dispoDesierta) return 'Q-DESIERTO'
  if (row.cargoSial) return 'O-ALTA SIAL'
  if (row.fechaResolucion && row.resolucionDesignacion) return 'N-DESIGNADO'
  if (row.resoALaFirma) return 'M-RESO A LA FIRMA'
  if (row.proyectoResolucion) return 'L-PYCTO DE RESO'
  if (row.fechaIte) return 'K-ITE'
  if (row.fechaAptoMedico) return 'J-APTO MED'
  if (row.cargaDocumentacion) return 'I-CARGA DOCU'
  if (row.eeDesignacion) return 'H-TAD'
  if (row.fechaInsal) return 'G-INSAL'
  if (row.fechaIfacs) return 'F-IFACS'
  if (row.fechaOrdenMerito) return 'E-ORDEN DE MERITO'
  if (row.fechaExamen) return 'D-EXAMEN PUBLICADO'
  if (row.disposicion) return 'C-DISPO DE LLAMADO'
  if (row.sorteoJurado) return 'B-SORTEO JUR'
  if (row.fechaAutorizacion) return 'A-AUTZN'
  if (row.eeConcurso && row.eeBaja) return 'A-CARATULADO'
  if (!row.eeBaja && !row.eeConcurso) return 'VACANTE'
  return 'NO INICIADO'
}

// Igual que calcSubEstado3 del legacy, salvo por dos ramas ("hoy") que se
// recalculan también en SQL al filtrar/listar (SUB_ESTADO_3_SQL_PG) — el
// valor persistido acá queda fresco recién en el próximo write.
function calcSubEstado3(row: ConcursoCphCalcInput): string {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  if (row.fechaDispoDesierta) return 'H-DESIERTO'
  if (row.resolucionDesignacion) return 'G-RESOLUCION'
  if (row.eeDesignacion) return 'F-PROX. A DESIG'
  if (row.fechaExamen && hoy >= row.fechaExamen) return 'E-ADJUDI'
  if (row.fechaInscHasta && hoy >= row.fechaInscHasta) return 'D-ETAPA EVAL'
  if (row.disposicion) return 'C-INSCRIPCION'
  if (row.fechaAutorizacion && row.sorteoJurado) return 'B-AUTORIZADO'
  return 'A-VALID. VCTE'
}

// Punto único de entrada: dado el estado completo (post-merge de un
// create/PATCH), calcula los 3 campos derivados. `suspendido` y el
// sub-estado 'Q-DESIERTO' pisan el resultado base de calcEstadoBase — ninguno
// de los dos existía como estado de nivel superior en el legacy (ahí eran
// solo un flag aparte y un sub-estado), pero el enum EstadoConcursoCph de
// este proyecto sí distingue `suspendido`/`desierto` del resto.
export function calcConcursoCph(row: ConcursoCphCalcInput): ConcursoCphCalcResult {
  const subEstado = calcSubEstado(row)
  const subEstado3 = calcSubEstado3(row)

  let estado: EstadoConcursoCphCalc
  if (row.suspendido) {
    estado = 'suspendido'
  } else if (subEstado === 'Q-DESIERTO') {
    estado = 'desierto'
  } else {
    estado = calcEstadoBase(row)
  }

  return { estado, subEstado, subEstado3 }
}

// Réplica en SQL (Postgres) de calcSubEstado3 — usada por listConcursosCphService
// (S4-1) para filtrar por sub_estado_3 sin confiar en el valor persistido,
// que puede desactualizarse solo con el paso del tiempo (ramas E-ADJUDI/
// D-ETAPA EVAL comparan contra la fecha de hoy). Mismo patrón que
// SUB_ESTADO_3_SQL del legacy, adaptado a Postgres (CURDATE() → CURRENT_DATE,
// sorteo_jurado pasó de boolean a fecha acá → "IS NOT NULL" en vez de "= 1").
export const SUB_ESTADO_3_SQL_PG = `
  CASE
    WHEN fecha_dispo_desierta IS NOT NULL THEN 'H-DESIERTO'
    WHEN COALESCE(resolucion_designacion, '') <> '' THEN 'G-RESOLUCION'
    WHEN COALESCE(ee_designacion, '') <> '' THEN 'F-PROX. A DESIG'
    WHEN fecha_examen IS NOT NULL AND fecha_examen <= CURRENT_DATE THEN 'E-ADJUDI'
    WHEN fecha_insc_hasta IS NOT NULL AND fecha_insc_hasta <= CURRENT_DATE THEN 'D-ETAPA EVAL'
    WHEN COALESCE(disposicion, '') <> '' THEN 'C-INSCRIPCION'
    WHEN fecha_autorizacion IS NOT NULL AND sorteo_jurado IS NOT NULL THEN 'B-AUTORIZADO'
    ELSE 'A-VALID. VCTE'
  END
`
