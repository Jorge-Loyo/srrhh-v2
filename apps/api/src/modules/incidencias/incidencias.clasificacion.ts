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
  const fechaDeteccion = i.enBajaSial
    ? (i.bsPrimeraFecha ?? i.bsFechaArchivoUltima)
    : padron.fecha
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
