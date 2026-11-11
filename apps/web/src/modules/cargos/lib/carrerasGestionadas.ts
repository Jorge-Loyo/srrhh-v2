import { CODIGOS_ESCALAFON_GESTIONADOS } from '@srrhh/types'

// Carreras (escalafones) que gestionamos: las que pueden producir concurso.
// La lista vive en @srrhh/types (CR_POR_CODIGO_ESCALAFON_GESTIONADO), compartida
// con la deducción del tipo CPH/CEETPS del backend. Se filtra por
// `escalafones.codigo` (dato real de la BD), no por nombre.

export interface CarreraCatalogo {
  id: string
  codigo: string
  nombre: string
}

export type TipoAltaCarrera = 'pof' | 'pou' | 'estructura'

/** Etiqueta 'CÓDIGO — Nombre' (mismo formato del selector de Reportes). */
export function etiquetaCarrera(c: Pick<CarreraCatalogo, 'codigo' | 'nombre'>): string {
  return `${c.codigo} — ${c.nombre}`
}

export function esCarreraGestionada(codigo: string | null | undefined): boolean {
  return !!codigo && CODIGOS_ESCALAFON_GESTIONADOS.includes(codigo.trim())
}

/**
 * Carreras a mostrar en el selector de /cargos/alta.
 * - Ejecución POF / POU: SOLO las gestionadas (siempre crean cargo con concurso).
 * - Estructura: todas, sin filtrar (queda fuera de este alcance por ahora).
 * Siempre con la etiqueta 'CÓDIGO — Nombre'.
 */
export function opcionesCarreraAlta(
  escalafones: CarreraCatalogo[],
  tipo: TipoAltaCarrera,
): { value: string; label: string }[] {
  const lista = tipo === 'estructura' ? escalafones : escalafones.filter((e) => esCarreraGestionada(e.codigo))
  return lista.map((e) => ({ value: e.id, label: etiquetaCarrera(e) }))
}

function normalizarNombre(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Puestos permitidos en el alta por carrera (escalafones.codigo), como patrones
 * sobre el nombre normalizado (minúsculas, sin acentos). `null` = sin
 * restricción (se ofrece el catálogo del escalafón tal cual).
 * Hoy solo la 87 (Nueva Carrera Enfermería) está definida; 37, 85, 83 y 23
 * quedan SIN cambios hasta que Jorge defina cada lista.
 */
const PUESTOS_PERMITIDOS_POR_CARRERA: Record<string, RegExp[]> = {
  '87': [/^enfermer[oa] profesional$/, /^licenciad[oa] en enfermeria$/],
}

export function puestosPermitidosPorCarrera(codigoEscalafon: string | null | undefined): RegExp[] | null {
  return PUESTOS_PERMITIDOS_POR_CARRERA[(codigoEscalafon ?? '').trim()] ?? null
}

/**
 * Filtra los puestos reales del catálogo (conservando sus ids) según la carrera.
 * Estructura no se toca. Sin regla para la carrera: lista intacta.
 */
export function filtrarPuestosAlta<T extends { nombre: string }>(
  puestos: T[],
  codigoEscalafon: string | null | undefined,
  tipo: TipoAltaCarrera,
): T[] {
  if (tipo === 'estructura') return puestos
  const patrones = puestosPermitidosPorCarrera(codigoEscalafon)
  if (!patrones) return puestos
  return puestos.filter((p) => {
    const n = normalizarNombre(p.nombre)
    return patrones.some((re) => re.test(n))
  })
}
