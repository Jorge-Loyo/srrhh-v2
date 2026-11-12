// ─────────────────────────────────────────────────────────────────────────────
// Limpieza previa a la nueva carga (decisiones de Jorge, ronda 4): se borra TODO lo
// generado en el sistema y se conserva usuarios/roles/configuración, catálogos,
// organigrama, POU, padrón, personas y ocupaciones.
//
// - TABLAS_BORRAR es declarativa y está ORDENADA por FK (hijos antes que padres).
// - alcance 'todo'        : DELETE de la tabla entera.
// - alcance 'fuera_excel' : solo los concursos cuyo concurso base NO está en la lista
//                           `conservarConcursoIds` (los que sí están en el Excel).
// - Todo es DELETE set-based dentro de UNA transacción y es idempotente (la segunda
//   vez borra 0). No se usa TRUNCATE.
// - ejecutarLimpieza exige una URL de base local (guardaBase) y NUNCA corre en el dry-run.
// ─────────────────────────────────────────────────────────────────────────────
import { asegurarBaseLocal } from './guardaBase.js'

export type Alcance = 'todo' | 'fuera_excel'
export type Clasificacion = 'BORRAR' | 'CONSERVAR' | 'PREGUNTA'

export interface TablaBorrar {
  tabla: string
  alcance: Alcance
  /** Cláusula WHERE (texto fijo; $1 = uuid[] de concursos base a conservar). Vacía = todo. */
  donde: string
}

/** Concursos CPH/CEETPS/base que NO están en el Excel ($1 = ids de concursos base a conservar). */
const FUERA_BASE = 'concurso_id <> ALL($1::uuid[])'
const CPH_FUERA = '(SELECT id FROM concursos_cph WHERE concurso_id <> ALL($1::uuid[]))'

/** Orden FK: cada tabla se borra antes que las tablas de las que depende. */
export const TABLAS_BORRAR: readonly TablaBorrar[] = [
  // Jurados y órdenes de mérito: todo (no se guarda nada generado).
  { tabla: 'jornada_sorteo_concursos', alcance: 'todo', donde: '' },
  { tabla: 'jornadas_sorteo', alcance: 'todo', donde: '' },
  { tabla: 'miembros_jurado_sorteados', alcance: 'todo', donde: '' },
  { tabla: 'sorteos_jurado', alcance: 'todo', donde: '' },
  { tabla: 'orden_merito_integrantes', alcance: 'todo', donde: '' },
  { tabla: 'ordenes_merito', alcance: 'todo', donde: '' },
  // Concursos fuera del Excel y su historia.
  { tabla: 'concursos_cph_desiertos', alcance: 'fuera_excel', donde: `concurso_cph_id IN ${CPH_FUERA}` },
  // Decision de Jorge (12-nov): los inscriptos son datos generados; se borran TODOS, tambien los de concursos que estan en el Excel.
  // Para volver a conservar los de concursos del Excel: cambiar a { alcance: 'fuera_excel', donde: `concurso_cph_id IN ${CPH_FUERA}` }.
  { tabla: 'inscriptos_concurso', alcance: 'todo', donde: '' },
  { tabla: 'etiquetas_concurso_cph', alcance: 'fuera_excel', donde: `concurso_cph_id IN ${CPH_FUERA}` },
  { tabla: 'concursos_cph', alcance: 'fuera_excel', donde: FUERA_BASE },
  { tabla: 'concursos_ceetps', alcance: 'fuera_excel', donde: FUERA_BASE },
  { tabla: 'concursos', alcance: 'fuera_excel', donde: 'id <> ALL($1::uuid[])' },
  // Solicitudes de alta, bajas manuales y sus etiquetas.
  { tabla: 'etiquetas_solicitud_alta', alcance: 'todo', donde: '' },
  { tabla: 'solicitudes_alta', alcance: 'todo', donde: '' },
  { tabla: 'etiquetas_baja', alcance: 'todo', donde: '' },
  { tabla: 'bajas', alcance: 'todo', donde: '' },
  // Etiquetas de cargo, autorizaciones, tareas, notificaciones, incidencias y auditoría.
  { tabla: 'etiquetas_cargo', alcance: 'todo', donde: '' },
  { tabla: 'autorizaciones', alcance: 'todo', donde: '' },
  { tabla: 'tareas_pendientes', alcance: 'todo', donde: '' },
  { tabla: 'notificaciones', alcance: 'todo', donde: '' },
  { tabla: 'padron_incidencias', alcance: 'todo', donde: '' },
  { tabla: 'audit_logs', alcance: 'todo', donde: '' },
]

/**
 * Clasificación de TODAS las tablas del schema (nombre real, @@map). Un modelo nuevo sin
 * clasificar hace fallar limpieza.test.ts. PREGUNTA = dudosa: NO se borra hasta que Jorge decida.
 */
export const CLASIFICACION: Readonly<Record<string, Clasificacion>> = {
  // BORRAR (ver TABLAS_BORRAR)
  jornada_sorteo_concursos: 'BORRAR', jornadas_sorteo: 'BORRAR', miembros_jurado_sorteados: 'BORRAR',
  sorteos_jurado: 'BORRAR', orden_merito_integrantes: 'BORRAR', ordenes_merito: 'BORRAR',
  concursos_cph_desiertos: 'BORRAR', inscriptos_concurso: 'BORRAR', etiquetas_concurso_cph: 'BORRAR',
  concursos_cph: 'BORRAR', concursos_ceetps: 'BORRAR', concursos: 'BORRAR',
  etiquetas_solicitud_alta: 'BORRAR', solicitudes_alta: 'BORRAR', etiquetas_baja: 'BORRAR', bajas: 'BORRAR',
  etiquetas_cargo: 'BORRAR', autorizaciones: 'BORRAR', tareas_pendientes: 'BORRAR',
  notificaciones: 'BORRAR', padron_incidencias: 'BORRAR', audit_logs: 'BORRAR',
  // CONSERVAR: usuarios, roles, permisos y configuración
  usuarios: 'CONSERVAR', roles: 'CONSERVAR', permisos: 'CONSERVAR', role_permisos: 'CONSERVAR',
  role_jerarquias: 'CONSERVAR', refresh_tokens: 'CONSERVAR',
  // CONSERVAR: catálogos y referencias
  hospitales: 'CONSERVAR', escalafones: 'CONSERVAR', codigos_registro: 'CONSERVAR', regimenes: 'CONSERVAR',
  puestos_cargo: 'CONSERVAR', especialidades_puesto: 'CONSERVAR', etiquetas: 'CONSERVAR',
  areas_programaticas: 'CONSERVAR', cesacs: 'CONSERVAR', unidades_fijas_apayc: 'CONSERVAR',
  jcat_cargo_jefatura: 'CONSERVAR', ref_agrupadores: 'CONSERVAR', ref_unificadores_puesto: 'CONSERVAR',
  ref_especialidades_cuil: 'CONSERVAR', ref_abreviaturas_tecnicas: 'CONSERVAR', ref_abreviaturas_titulo: 'CONSERVAR',
  ref_correcciones_lit_puesto: 'CONSERVAR', ref_correcciones_especialidad: 'CONSERVAR',
  ref_especialidad_por_puesto: 'CONSERVAR', ref_conectores_minuscula: 'CONSERVAR', ref_sufijos_ordinales: 'CONSERVAR',
  // CONSERVAR: organigrama y POU
  organigramas: 'CONSERVAR', organigrama_uploads: 'CONSERVAR', pou: 'CONSERVAR',
  // CONSERVAR: padrón, snapshots e histórico
  padron_snapshots: 'CONSERVAR', padron_diff: 'CONSERVAR', padron_historico: 'CONSERVAR',
  baja_sial_snapshots: 'CONSERVAR', baja_sial_diffs: 'CONSERVAR', baja_sial_registros: 'CONSERVAR',
  // CONSERVAR: personas, ocupaciones y cargos (los cargos los transforma la sincronización, no la limpieza)
  personas: 'CONSERVAR', ocupaciones: 'CONSERVAR', roles_persona: 'CONSERVAR', cargos: 'CONSERVAR',
  // Bitácora del propio sync
  sync_corridas: 'CONSERVAR',
  // PREGUNTA: derivada de cargos/concursos; quedaría desactualizada, pero no es "generada por usuarios"
  kpis_dotacion_snapshot: 'PREGUNTA',
}

/** Tablas creadas por SQL crudo (no están en schema.prisma): se conservan. */
export const TABLAS_SQL_CRUDO_CONSERVAR: readonly string[] = ['pou_cargas', 'ayc_mes', 'desdoblado_mapeo_cargos']

export interface FilaPlanBorrado {
  tabla: string
  alcance: Alcance
  /** Filas que se borrarían. */
  filas: number
  /** true = conteo exacto; false = total de la tabla (cota superior, alcance fuera_excel). */
  exacto: boolean
  /** Filas totales de la tabla hoy. */
  total: number
}

/**
 * Plan de borrado (solo cálculo). `conteos` = count(*) por tabla; `fueraExcel` = conteos exactos
 * de los concursos que NO están en el Excel (concursos_cph, concursos_ceetps, concursos), tomados del cruce.
 */
export function construirPlanBorrado(
  conteos: Readonly<Record<string, number>>,
  fueraExcel: Readonly<Partial<Record<string, number>>> = {},
): FilaPlanBorrado[] {
  return TABLAS_BORRAR.map((t) => {
    const total = conteos[t.tabla] ?? 0
    if (t.alcance === 'todo') return { tabla: t.tabla, alcance: t.alcance, filas: total, exacto: true, total }
    const exacta = fueraExcel[t.tabla]
    if (exacta !== undefined) return { tabla: t.tabla, alcance: t.alcance, filas: Math.min(exacta, total), exacto: true, total }
    return { tabla: t.tabla, alcance: t.alcance, filas: total, exacto: false, total }
  })
}

/** Subconjunto de la transacción de Prisma usado acá (permite simularla en tests). */
export interface TxEscritura {
  $executeRawUnsafe(sql: string, ...valores: unknown[]): Promise<number>
}

export interface OpcionesLimpieza {
  /** DATABASE_URL de la base destino: se valida con asegurarBaseLocal (se niega con Neon). */
  databaseUrl: string
  /** Ids de concursos base que están en el Excel y se conservan. */
  conservarConcursoIds: readonly string[]
}

/** DELETE set-based en el orden de TABLAS_BORRAR. Devuelve filas borradas por tabla. Llamar dentro de UNA transacción. */
export async function ejecutarLimpieza(tx: TxEscritura, opciones: OpcionesLimpieza): Promise<Record<string, number>> {
  asegurarBaseLocal(opciones.databaseUrl)
  const borradas: Record<string, number> = {}
  const conservar = [...opciones.conservarConcursoIds]
  for (const t of TABLAS_BORRAR) {
    const sql = `DELETE FROM ${t.tabla}${t.donde ? ` WHERE ${t.donde}` : ''}`
    borradas[t.tabla] = Number(t.alcance === 'todo' ? await tx.$executeRawUnsafe(sql) : await tx.$executeRawUnsafe(sql, conservar))
  }
  return borradas
}
