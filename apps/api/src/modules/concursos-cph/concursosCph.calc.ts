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
  fechaInscDesde: Date | null
  fechaInscHasta: Date | null
  inscripcionCerrada: boolean | null
  ordenMeritoConfirmado: boolean | null
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
  // Validación contra el padrón (nómina legal). El alta SIAL (o-alta sial) se
  // dispara cuando la persona designada aparece en el padrón por su
  // id_sial_rol — eso enciende `validado`. `validadoIdSialRol` es informativo
  // (el rol real del padrón con el que se cerró).
  validado: boolean
  validadoIdSialRol: string | null
}

// String literal en vez del enum de @srrhh/types o @prisma/client a propósito:
// son dos tipos nominalmente distintos aunque compartan los mismos valores, y
// asignar uno donde se espera el otro es un error de TS. El caller (service)
// castea al enum de Prisma en el único punto donde hace falta (el write).
export type EstadoConcursoCphCalc = 'no_iniciado' | 'activo' | 'finalizado' | 'suspendido'

export interface ConcursoCphCalcResult {
  estado: EstadoConcursoCphCalc
  subEstado: string
  subEstado3: string
}

function calcEstadoBase(row: ConcursoCphCalcInput): EstadoConcursoCphCalc {
  if (row.resolucionDesignacion) return 'finalizado'
  // Un concurso pasa a "activo" en cuanto tiene cargado el Expediente de
  // Concurso (eeConcurso). No se exige eeBaja/fechaBaja porque los concursos
  // por cargo nuevo no tienen baja asociada — antes esa condición dejaba
  // concursos ya avanzados (p.ej. en G-INSAL) marcados como "no_iniciado".
  if (row.eeConcurso) return 'activo'
  return 'no_iniciado'
}

function calcSubEstado(row: ConcursoCphCalcInput): string {
  if (row.fechaDispoDesierta && row.dispoDesierta) return 'q-desierto'
  // o-alta sial: la persona designada apareció en el padrón (nómina legal) por
  // su id_sial_rol y quedó validada. El disparador es `validado` (no `cargoSial`,
  // que es sólo un atajo informativo): el PATCH manual enciende `validado` cuando
  // se carga `cargoSial` a mano (ver patchConcursoCphService), y el enganche
  // automático del padrón lo enciende al ocupar (ver aprobarDiffNuevoService).
  if (row.validado) return 'o-alta sial'
  // n-designado: hay persona designada con resolución de designación cargada.
  // El concurso está finalizado administrativamente y espera que la persona
  // aparezca en el padrón (nómina legal) por su id_sial_rol — ahí se completa
  // el alta SIAL (o-alta sial, vía cargoSial / vinculación del padrón).
  // La fecha de la resolución es opcional: basta el número de resolución para
  // considerar designado el concurso (regla de negocio confirmada 2026-10-29).
  if (row.resolucionDesignacion) return 'n-designado'
  if (row.resoALaFirma) return 'm-reso a la firma'
  if (row.proyectoResolucion) return 'l-pycto de reso'
  if (row.fechaIte) return 'k-ite'
  if (row.fechaAptoMedico) return 'j-apto med'
  if (row.cargaDocumentacion) return 'i-carga docu'
  if (row.eeDesignacion) return 'h-tad'
  if (row.fechaInsal) return 'g-insal'
  if (row.fechaIfacs) return 'f-ifacs'
  if (row.ordenMeritoConfirmado || row.fechaOrdenMerito) return 'e-orden de merito'
  if (row.fechaExamen) return 'd-examen publicado'
  // Inscripción cerrada (pero examen aún no publicado) → esperando publicar
  // el examen (D). El cierre del período de inscripción es lo que hace avanzar
  // desde "C — Inscripción de exámenes".
  if (row.inscripcionCerrada) return 'd-examen publicado'
  // Período de inscripción a exámenes definido (ambas fechas) pero aún abierto
  // → sub-estado intermedio entre C-Dispo y D-Publicación (inscripción en curso).
  if (row.fechaInscDesde && row.fechaInscHasta) return 'c2-inscripcion ex'
  if (row.disposicion) return 'c-dispo de llamado'
  if (row.sorteoJurado) return 'b-sorteo jur'
  if (row.fechaAutorizacion) return 'a-autzn'
  if (row.eeConcurso && row.eeBaja) return 'a-caratulado'
  if (!row.eeBaja && !row.eeConcurso) return 'vacante'
  return 'no iniciado'
}

// Igual que calcSubEstado3 del legacy, salvo por dos ramas ("hoy") que se
// recalculan también en SQL al filtrar/listar (SUB_ESTADO_3_SQL_PG) — el
// valor persistido acá queda fresco recién en el próximo write.
function calcSubEstado3(row: ConcursoCphCalcInput): string {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  if (row.fechaDispoDesierta) return 'h-desierto'
  if (row.resolucionDesignacion) return 'g-resolucion'
  if (row.eeDesignacion) return 'f-prox. a desig'
  if (row.fechaExamen && hoy >= row.fechaExamen) return 'e-adjudi'
  if (row.fechaInscHasta && hoy >= row.fechaInscHasta) return 'd-etapa eval'
  if (row.disposicion) return 'c-inscripcion'
  if (row.fechaAutorizacion && row.sorteoJurado) return 'b-autorizado'
  return 'a-valid. vcte'
}

// PS16D-2: Q-DESIERTO ya no produce estado='desierto' — el concurso sigue
// siendo 'activo' con suspendido=true. El estado 'desierto' fue eliminado
// del enum. El sub-estado Q-DESIERTO sigue existiendo como indicador.
export function calcConcursoCph(row: ConcursoCphCalcInput): ConcursoCphCalcResult {
  const subEstado = calcSubEstado(row)
  const subEstado3 = calcSubEstado3(row)

  let estado: EstadoConcursoCphCalc
  if (row.suspendido) {
    estado = 'suspendido'
  } else {
    estado = calcEstadoBase(row)
  }

  return { estado, subEstado, subEstado3 }
}

// ─── Mapeo ETAPA (stepper 1..5) ↔ sub_estado ─────────────────────────────────
// Única fuente de verdad del mapeo en el back (usada por el filtro "Etapa" de
// listConcursosCphService). Debe mantenerse en sync con SUB_ESTADOS_POR_ETAPA
// de ConcursosCphPage.tsx (front, stepper visual) — el test lo verifica.
// Etapas 2..5 enumeran sus sub_estados; la etapa 1 es el COMPLEMENTO (vacante,
// no iniciado, a-caratulado y cualquier sub_estado no listado o null).
export const SUB_ESTADOS_POR_ETAPA: Record<2 | 3 | 4 | 5, string[]> = {
  2: ['a-autzn', 'b-sorteo jur', 'c-dispo de llamado'],
  3: ['c2-inscripcion ex', 'd-examen publicado', 'e-orden de merito'],
  4: ['f-ifacs', 'g-insal'],
  5: [
    'h-tad',
    'i-carga docu',
    'j-apto med',
    'k-ite',
    'l-pycto de reso',
    'm-reso a la firma',
    'n-designado',
    'o-alta sial',
    'q-desierto',
  ],
}

// Devuelve la etapa (1..5) a la que pertenece un sub_estado. Espejo exacto de
// etapaActual() del front.
export function etapaDeSubEstado(subEstado: string | null): 1 | 2 | 3 | 4 | 5 {
  const s = (subEstado ?? '').toLowerCase()
  for (const etapa of [2, 3, 4, 5] as const) {
    if (SUB_ESTADOS_POR_ETAPA[etapa].includes(s)) return etapa
  }
  return 1
}

// Réplica en SQL (Postgres) de calcSubEstado3 — usada por listConcursosCphService
// (S4-1) para filtrar por sub_estado_3 sin confiar en el valor persistido,
// que puede desactualizarse solo con el paso del tiempo (ramas E-ADJUDI/
// D-ETAPA EVAL comparan contra la fecha de hoy). Mismo patrón que
// SUB_ESTADO_3_SQL del legacy, adaptado a Postgres (CURDATE() → CURRENT_DATE,
// sorteo_jurado pasó de boolean a fecha acá → "IS NOT NULL" en vez de "= 1").
export const SUB_ESTADO_3_SQL_PG = `
  CASE
    WHEN fecha_dispo_desierta IS NOT NULL THEN 'h-desierto'
    WHEN COALESCE(resolucion_designacion, '') <> '' THEN 'g-resolucion'
    WHEN COALESCE(ee_designacion, '') <> '' THEN 'f-prox. a desig'
    WHEN fecha_examen IS NOT NULL AND fecha_examen <= CURRENT_DATE THEN 'e-adjudi'
    WHEN fecha_insc_hasta IS NOT NULL AND fecha_insc_hasta <= CURRENT_DATE THEN 'd-etapa eval'
    WHEN COALESCE(disposicion, '') <> '' THEN 'c-inscripcion'
    WHEN fecha_autorizacion IS NOT NULL AND sorteo_jurado IS NOT NULL THEN 'b-autorizado'
    ELSE 'a-valid. vcte'
  END
`
