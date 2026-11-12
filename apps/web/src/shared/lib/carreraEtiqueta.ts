import { CR_POR_CODIGO_ESCALAFON_GESTIONADO } from '@srrhh/types'

/**
 * Código a mostrar: el código de registro principal si el escalafón lo tiene
 * definido (la CPH es un único escalafón '22' cuyo CR principal es 37); si no,
 * el propio `escalafones.codigo`. Solo cambia la etiqueta, no el valor enviado.
 */
export function codigoMostradoCarrera(codigo: string): string {
  const c = codigo.trim()
  return CR_POR_CODIGO_ESCALAFON_GESTIONADO[c] ?? c
}

/** Nombres mostrados que prevalecen sobre `escalafones.nombre` (solo etiqueta, igual que en el Excel). */
const NOMBRE_MOSTRADO_POR_CODIGO: Readonly<Record<string, string>> = {
  '37': 'Nueva Carrera Profesional Hospitalaria',
}

/** Etiqueta 'CÓDIGO — Nombre' con el código de registro principal. */
export function etiquetaCarrera(c: { codigo: string; nombre: string }): string {
  const mostrado = codigoMostradoCarrera(c.codigo)
  return `${mostrado} — ${NOMBRE_MOSTRADO_POR_CODIGO[mostrado] ?? c.nombre}`
}

/** Etiqueta 'CÓDIGO — Literal' con el código de registro real (Reportes: 22 y 37 van separados). */
export function etiquetaCarreraCR(c: { codigo: string; literal: string }): string {
  return `${c.codigo.trim()} — ${c.literal}`
}

/** Carreras de código de registro ordenadas por etiqueta (numérico, es), sin unificar códigos. */
export function ordenarCarrerasCR<T extends { codigo: string; literal: string }>(carreras: T[]): T[] {
  return [...carreras].sort((a, b) =>
    etiquetaCarreraCR(a).localeCompare(etiquetaCarreraCR(b), 'es', { numeric: true }),
  )
}

/**
 * Opciones 'CÓDIGO — Nombre' para un selector de carrera a partir de escalafones,
 * ordenadas por código (numérico). Misma etiqueta que /cargos/alta. `valor` elige
 * qué se emite (por defecto el id).
 */
export function opcionesCarreraEscalafon(
  escalafones: { id: string; codigo: string; nombre: string }[],
  valor: (e: { id: string; codigo: string; nombre: string }) => string = (e) => e.id,
): { value: string; label: string }[] {
  return [...escalafones]
    .sort((a, b) =>
      codigoMostradoCarrera(a.codigo).localeCompare(codigoMostradoCarrera(b.codigo), 'es', { numeric: true }),
    )
    .map((e) => ({ value: valor(e), label: etiquetaCarrera(e) }))
}
