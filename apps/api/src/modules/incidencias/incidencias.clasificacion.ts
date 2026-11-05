// Núcleo PURO (sin Prisma) de la pestaña "Baja sin concurso": clasificación de
// cargos en grupos mutuamente excluyentes y resolución de "cómo / desde cuándo
// se detectó". La query SQL solo aporta HECHOS; la decisión de grupo la toma
// siempre `clasificarCargo` (única fuente de verdad). Ver
// .agents/tasks/incidencias-tabs/design.md §3, §4 y §8.

export type GrupoCargo =
  | 'no_vigente'
  | 'ocupado'
  | 'en_concurso'
  | 'alta_pendiente'
  | 'baja_sin_concurso'
  | 'sin_clasificar'

export const GRUPOS_CARGO: GrupoCargo[] = [
  'no_vigente',
  'ocupado',
  'en_concurso',
  'alta_pendiente',
  'baja_sin_concurso',
  'sin_clasificar',
]

export interface CargoFacts {
  // string para tolerar valores inesperados -> sin_clasificar.
  estado: 'vigente' | 'validacion_vacante' | 'no_vigente' | string
  tieneOcupanteVigente: boolean
  concursoActivo: boolean
  altaPendiente: boolean
  enBajaSial: boolean
  ausenteUltimoPadron: boolean
  // NO hay subEstado: la clasificación no lo usa (design §3.2).
}

// Cascada: gana el primer grupo que aplica. Es total (el residual nunca es null).
export function clasificarCargo(f: CargoFacts): GrupoCargo {
  if (f.estado === 'no_vigente') return 'no_vigente'
  if (f.estado !== 'vigente' && f.estado !== 'validacion_vacante') return 'sin_clasificar'
  if (f.estado === 'vigente' && f.tieneOcupanteVigente) return 'ocupado'
  if (f.concursoActivo) return 'en_concurso'
  if (f.altaPendiente) return 'alta_pendiente'
  if (
    !f.tieneOcupanteVigente &&
    (f.enBajaSial || f.ausenteUltimoPadron || f.estado === 'validacion_vacante')
  ) {
    return 'baja_sin_concurso'
  }
  return 'sin_clasificar'
}

export function contarGrupos(lista: CargoFacts[]): Record<GrupoCargo, number> {
  const out = Object.fromEntries(GRUPOS_CARGO.map((g) => [g, 0])) as Record<GrupoCargo, number>
  for (const f of lista) out[clasificarCargo(f)]++
  return out
}

// ¿El id_sial_rol de un diff del padrón pertenece al cargo con ese id_sial?
// Réplica TS de la condición SQL
//   d.id_sial_rol = c.id_sial OR starts_with(d.id_sial_rol, c.id_sial || '-')
// de la query de incidencias.baja-sin-concurso.ts (mantener alineadas).
export function idSialRolCoincide(idSialRol: string, idSial: string): boolean {
  if (!idSial) return false
  return idSialRol === idSial || idSialRol.startsWith(idSial + '-')
}

// ─── Detección: cómo y desde cuándo ──────────────────────────────────────────

export type OrigenDeteccion = 'baja_sial' | 'padron'
export type FuenteFechaPadron = 'padron_diff' | 'estado_desde' | 'ocupacion_hasta' | 'desconocida'

// Todas las fechas son 'YYYY-MM-DD' (comparables como string) o null.
export interface DeteccionInput {
  estado: string
  estadoDesde: string | null
  fechaBajaPadronDiff: string | null // max fecha_asignada de 'eliminado' con campo NULL
  ocupacionDesdeUlt: string | null // max ocupaciones.desde
  ocupacionHasta: string | null // max ocupaciones.hasta
  enBajaSial: boolean
  bsCargoHasta: string | null
  bsPrimeraFecha: string | null
  bsFechaArchivoUltima: string | null
  ausenteUltimoPadron: boolean
}

export interface Deteccion {
  origen: OrigenDeteccion
  fechaDeteccion: string | null
  fechaBaja: string | null
  fechaPadron: string | null
  fuenteFechaPadron: FuenteFechaPadron
  enBajaSial: boolean
  ausentePadron: boolean
}

function diffVigente(diff: string | null, ocupacionDesdeUlt: string | null): boolean {
  if (!diff) return false
  return ocupacionDesdeUlt == null || diff >= ocupacionDesdeUlt
}

function resolverFechaPadron(i: DeteccionInput): {
  fecha: string | null
  fuente: FuenteFechaPadron
} {
  const diffOk = diffVigente(i.fechaBajaPadronDiff, i.ocupacionDesdeUlt)
  if (i.estado === 'validacion_vacante') {
    if (i.estadoDesde) return { fecha: i.estadoDesde, fuente: 'estado_desde' }
    if (diffOk) return { fecha: i.fechaBajaPadronDiff, fuente: 'padron_diff' }
    if (i.ocupacionHasta) return { fecha: i.ocupacionHasta, fuente: 'ocupacion_hasta' }
    return { fecha: null, fuente: 'desconocida' }
  }
  // vigente (sin ocupante)
  if (diffOk) return { fecha: i.fechaBajaPadronDiff, fuente: 'padron_diff' }
  if (i.ocupacionHasta) return { fecha: i.ocupacionHasta, fuente: 'ocupacion_hasta' }
  if (i.estadoDesde) return { fecha: i.estadoDesde, fuente: 'estado_desde' }
  return { fecha: null, fuente: 'desconocida' }
}

export function resolverDeteccion(i: DeteccionInput): Deteccion {
  // La ausencia del padrón solo se calcula si hay señal (ausente del último
  // padrón) o si el cargo está en validación de vacante (origen: el padrón).
  const calcularPadron = i.ausenteUltimoPadron || i.estado === 'validacion_vacante'
  const padron = calcularPadron
    ? resolverFechaPadron(i)
    : { fecha: null, fuente: 'desconocida' as FuenteFechaPadron }
  const origen: OrigenDeteccion = i.enBajaSial ? 'baja_sial' : 'padron'
  const fechaBaja = i.enBajaSial ? (i.bsCargoHasta ?? i.ocupacionHasta) : i.ocupacionHasta
  const fechaDeteccion = i.enBajaSial ? (i.bsPrimeraFecha ?? i.bsFechaArchivoUltima) : padron.fecha
  return {
    origen,
    fechaDeteccion,
    fechaBaja,
    fechaPadron: padron.fecha,
    fuenteFechaPadron: padron.fuente,
    enBajaSial: i.enBajaSial,
    ausentePadron: i.ausenteUltimoPadron,
  }
}

// 'YYYY-MM-DD' -> 'dd/mm/aaaa'
export function formatearFechaISO(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function describirDeteccion(d: Deteccion): string {
  if (d.origen === 'baja_sial') {
    if (!d.fechaDeteccion) return 'Figura en la baja SIAL'
    const base = `Baja SIAL cargada el ${formatearFechaISO(d.fechaDeteccion)}`
    return d.fechaBaja ? `${base} (baja al ${formatearFechaISO(d.fechaBaja)})` : base
  }
  if (!d.fechaPadron) return 'Ausente del padrón (fecha desconocida)'
  return `Ausente del padrón desde el ${formatearFechaISO(d.fechaPadron)}`
}

// Días enteros UTC entre la referencia y hoy (>= 0). null si no hay fecha.
export function calcularDiasSinCubrir(fechaISO: string | null, hoy: Date): number | null {
  if (!fechaISO) return null
  const [y, m, d] = fechaISO.slice(0, 10).split('-').map(Number)
  const ref = Date.UTC(y, m - 1, d)
  const h = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  return Math.max(0, Math.floor((h - ref) / 86_400_000))
}

// ─── Búsqueda ────────────────────────────────────────────────────────────────

export function normalizarBusqueda(q: string | null | undefined): string {
  return (q ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export interface BusquedaCampos {
  nombre?: string | null
  cuil?: string | null
  idSial?: string | null
  codigo?: string | null
}

// ─── FASE 3 (paso 12): incidencias del ciclo de vida del cargo ──────────────
// Núcleo PURO (DB-free, testeable) de los tipos 3/4/5/6a/6b/6c. La SQL del paso
// 12 (incidencias.paso12.ts) solo aporta HECHOS; la decisión de tipo vive acá,
// igual que `clasificarCargo` es la única fuente de verdad de la pestaña
// "baja sin concurso". Ver .agents/tasks/incidencias-expansion/design.md §D/§E.
//
// A DIFERENCIA de `clasificarCargo` (cascada total, un grupo por cargo), un
// mismo cargo PUEDE disparar varias incidencias a la vez (p. ej. "cayó del
// padrón" y "cambios del puesto"): no son excluyentes. Por eso cada tipo tiene
// su propia función pura `clasificar*` que devuelve su slug o null, y el
// orquestador (construirIncidencias) evalúa las 6 y emite una fila por cada
// no-null (NO hay cascada excluyente entre tipos).

// Slugs persistidos en padron_incidencias.tipo (design §D.2).
export type TipoIncidenciaSlug =
  | 'cayo-del-padron'
  | 'cambio-situacion-revista'
  | 'cambios-del-puesto'
  | 'otras:nueva-baja'
  | 'otras:cambio-persona'
  | 'otras:reaparecio'

// Normalización del vocabulario de situación de revista (design §E.4). Reusa
// `normalizarBusqueda` (sin tildes, minúsculas, trim). Valores reales del
// padrón: 'activo', 'retencion de cargo', 'comision'.
export type SituacionRevista = 'activo' | 'comision' | 'retencion' | 'otro'
export function normalizarSituacionRevista(raw: string | null): SituacionRevista {
  const s = normalizarBusqueda(raw)
  if (s.includes('retenc')) return 'retencion'
  if (s.includes('comis')) return 'comision'
  if (s.includes('activ')) return 'activo'
  return 'otro'
}

// HECHOS (DB-free) que alimentan las reglas de §E. Todos derivan de la SQL del
// paso 12 (ocupación viva + padron_historico de S-1 + padron_diff del snapshot +
// baja SIAL + conjunto aRechazarBaja del paso 4). La clasificación no toca BD.
export interface HechosIncidencia {
  estado: 'vigente' | 'validacion_vacante' | 'no_vigente' | string
  tieneOcupanteVigente: boolean
  ausenteUltimoPadron: boolean
  enBajaSial: boolean
  enBajaSialNueva: boolean
  presentePeriodoAnterior: boolean
  situacionRevistaAnt: string | null
  situacionRevistaNue: string | null
  // Señal del diff del snapshot para cambio de puesto/especialidad (§E.5).
  cambioPuestoDiff: boolean
  // Respaldo histórico del cambio de puesto/especialidad que el diff NO ve
  // (cambio de FK sin cambio de texto; no hay marcador __puesto_cargo_id__).
  // `padron_historico` NO guarda puesto_cargo_id/especialidad_puesto_id (solo
  // el TEXTO literal_puesto/especialidad; schema PadronHistorico), así que el
  // respaldo compara el TEXTO histórico de S-1 (ant) vs el TEXTO del cargo
  // (nue), que es la única fuente disponible (design §E.5).
  literalPuestoAnt: string | null
  literalPuestoNue: string | null
  especialidadAnt: string | null
  especialidadNue: string | null
  // CUIL anterior (histórico denso, por cargo_id) vs nuevo (ocupación viva).
  cuilAnt: string | null
  cuilNue: string | null
  // Retención elegible para reemplazante (§E.4): 'R'/'TTR' + cadena armada.
  tipoOrigen: string | null
  cargoRetenidoId: string | null
  // El cargo está en el conjunto aRechazarBaja del paso 4 (validacion_vacante →
  // vigente): es la reaparición (§E.6c), leída, no reconstruida.
  esReaparicion: boolean
}

// 3 — Cayó del padrón (§E.3): estaba presente el período anterior y ahora está
// ausente del padrón (o en validación de vacante), SIN baja SIAL que lo explique.
export function clasificarCayoDelPadron(h: HechosIncidencia): 'cayo-del-padron' | null {
  if (
    h.presentePeriodoAnterior &&
    (h.ausenteUltimoPadron || h.estado === 'validacion_vacante') &&
    !h.enBajaSial &&
    !h.enBajaSialNueva
  ) {
    return 'cayo-del-padron'
  }
  return null
}

// 4 — Cambió la situación de revista (§E.4): mismo rol en ant y nue, con
// situación normalizada distinta. La comparación normalizada ant/nue es la
// regla CANÓNICA (el diff es solo refuerzo, lo aporta la SQL como ant/nue).
export function clasificarCambioSituacionRevista(
  h: HechosIncidencia,
): 'cambio-situacion-revista' | null {
  if (h.situacionRevistaAnt == null || h.situacionRevistaNue == null) return null
  if (
    normalizarSituacionRevista(h.situacionRevistaAnt) !==
    normalizarSituacionRevista(h.situacionRevistaNue)
  ) {
    return 'cambio-situacion-revista'
  }
  return null
}

// Transición activo→retención con cadena de reemplazo armada → "elegible para
// reemplazante" (§E.4). Solo para el `detalle`, no cambia el tipo.
export function esElegibleReemplazante(h: HechosIncidencia): boolean {
  return (
    normalizarSituacionRevista(h.situacionRevistaAnt) === 'activo' &&
    normalizarSituacionRevista(h.situacionRevistaNue) === 'retencion' &&
    (h.tipoOrigen === 'R' || h.tipoOrigen === 'TTR') &&
    h.cargoRetenidoId != null
  )
}

// 5 — Cambios del puesto (§E.5): unión de la señal del diff (texto SIAL +
// marcador de FK de especialidad) y el respaldo histórico (comparación del
// TEXTO literal_puesto/especialidad ant de S-1 vs el del cargo nuevo). Gobernado
// por SIAL. El respaldo captura el caso que el diff NO ve (cambio de puesto que
// re-resuelve la FK sin que el pipeline emita marcador __puesto_cargo_id__);
// como padron_historico solo guarda el TEXTO (no la FK), la única fuente
// comparable es el texto histórico vs el texto actual del cargo (design §E.5).
export function clasificarCambiosDelPuesto(h: HechosIncidencia): 'cambios-del-puesto' | null {
  if (cambioLiteralPuesto(h) || cambioEspecialidad(h) || h.cambioPuestoDiff) {
    return 'cambios-del-puesto'
  }
  return null
}

// Cambio de literal_puesto por respaldo histórico (texto ant vs nue, normalizado;
// ambos presentes y distintos). Null en cualquiera de los dos lados se deja a la
// señal del diff (el respaldo solo cubre el cambio silencioso texto→texto).
function cambioLiteralPuesto(h: HechosIncidencia): boolean {
  if (h.literalPuestoAnt == null || h.literalPuestoNue == null) return false
  return normalizarBusqueda(h.literalPuestoAnt) !== normalizarBusqueda(h.literalPuestoNue)
}

// Cambio de especialidad por respaldo histórico (texto ant vs nue, normalizado;
// ambos presentes y distintos). Null→valor o valor→null se dejan al diff.
function cambioEspecialidad(h: HechosIncidencia): boolean {
  if (h.especialidadAnt == null || h.especialidadNue == null) return false
  return normalizarBusqueda(h.especialidadAnt) !== normalizarBusqueda(h.especialidadNue)
}

// Distingue "cambio puesto" vs "cambio especialidad" para el `detalle` (§E.5).
// El cambio de puesto manda sobre el de especialidad cuando ambos aplican.
export function detalleCambioPuesto(h: HechosIncidencia): 'cambio puesto' | 'cambio especialidad' {
  return cambioLiteralPuesto(h) ? 'cambio puesto' : 'cambio especialidad'
}

// 6a — Nueva baja detectada (§E.6a): ventana "baja SIAL antes que el padrón".
export function clasificarNuevaBaja(h: HechosIncidencia): 'otras:nueva-baja' | null {
  if (
    h.enBajaSialNueva &&
    h.estado === 'vigente' &&
    h.tieneOcupanteVigente &&
    !h.ausenteUltimoPadron
  ) {
    return 'otras:nueva-baja'
  }
  return null
}

// 6b — Cambió la persona (§E.6b): mismo cargo ocupado por otro CUIL. Fallback
// histórico (roles_persona está vacía → no se programa, sería código muerto):
// cuil_nue != cuil_ant, ambos no nulos.
export function clasificarCambioPersona(h: HechosIncidencia): 'otras:cambio-persona' | null {
  if (h.tieneOcupanteVigente && h.cuilAnt != null && h.cuilNue != null && h.cuilAnt !== h.cuilNue) {
    return 'otras:cambio-persona'
  }
  return null
}

// 6c — Reapareció (§E.6c): el cargo está en aRechazarBaja del paso 4
// (validacion_vacante → vigente). Leído, no reconstruido.
export function clasificarReaparecio(h: HechosIncidencia): 'otras:reaparecio' | null {
  return h.esReaparicion ? 'otras:reaparecio' : null
}

// `qNorm` ya normalizado (normalizarBusqueda). Mínimo 2 caracteres, si no no filtra.
export function coincideBusqueda(item: BusquedaCampos, qNorm: string): boolean {
  if (qNorm.length < 2) return true
  if (normalizarBusqueda(item.nombre).includes(qNorm)) return true
  if (normalizarBusqueda(item.idSial).includes(qNorm)) return true
  if (normalizarBusqueda(item.codigo).includes(qNorm)) return true
  const digitos = qNorm.replace(/\D/g, '')
  if (digitos.length >= 2 && (item.cuil ?? '').replace(/\D/g, '').includes(digitos)) return true
  return false
}
