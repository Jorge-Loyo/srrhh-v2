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
