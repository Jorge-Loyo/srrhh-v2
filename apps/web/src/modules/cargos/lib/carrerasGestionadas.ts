import { CODIGOS_ESCALAFON_GESTIONADOS } from '@srrhh/types'
import { codigoMostradoCarrera, etiquetaCarrera } from '@/shared/lib/carreraEtiqueta'

// Carreras (escalafones) que gestionamos: las que pueden producir concurso.
// La lista vive en @srrhh/types (CR_POR_CODIGO_ESCALAFON_GESTIONADO), compartida
// con la deducción del tipo CPH/CEETPS del backend. Se filtra por
// `escalafones.codigo` (dato real de la BD), no por nombre. La CPH es el escalafón '22' en la base actual y el
// '37' en la base nueva (sync-cargos-msgc): la lista gestionada tiene los dos códigos, y como el selector muestra
// el código de registro principal (codigoMostradoCarrera) se ve una sola opción "37" en cualquiera de los dos estados.

export interface CarreraCatalogo {
  id: string
  codigo: string
  nombre: string
}

export type TipoAltaCarrera = 'pof' | 'pou' | 'estructura'

// Movidas a shared/lib/carreraEtiqueta; se reexportan para no romper imports.
export { codigoMostradoCarrera, etiquetaCarrera }

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
  return [...lista]
    .sort((a, b) =>
      codigoMostradoCarrera(a.codigo).localeCompare(codigoMostradoCarrera(b.codigo), 'es', { numeric: true }),
    )
    .map((e) => ({ value: e.id, label: etiquetaCarrera(e) }))
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
 * ¿El alta debe pedir también los puestos de modalidad 'ambos' (incluirAmbos)?
 * Solo en POF/POU y solo si la carrera tiene regla en puestosPermitidosPorCarrera
 * (hoy la 87). Para 37, 85, 83 y 23 NO se pide: sus listas no cambian hasta que
 * Jorge defina cada carrera (agregar la regla activa el flag automáticamente).
 */
export function pideIncluirAmbosAlta(codigoEscalafon: string | null | undefined, tipo: TipoAltaCarrera): boolean {
  return tipo !== 'estructura' && puestosPermitidosPorCarrera(codigoEscalafon) !== null
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
