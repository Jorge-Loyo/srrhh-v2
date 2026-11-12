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

/** Etiqueta 'CÓDIGO — Literal' para carreras de código de registro (Reportes). */
export function etiquetaCarreraCR(c: { codigo: string; literal: string }): string {
  return `${codigoMostradoCarrera(c.codigo)} — ${c.literal}`
}

/**
 * Unifica carreras cuyo código se muestra igual (22 → 37): una sola opción por
 * código mostrado, conservando el literal de la fila cuyo código original ya era
 * el mostrado. Ordenadas por etiqueta (numérico, es).
 */
export function unificarCarrerasCph(
  carreras: { codigo: string; literal: string }[],
): { codigo: string; literal: string }[] {
  const porMostrado = new Map<string, { codigo: string; literal: string; propio: boolean }>()
  for (const c of carreras) {
    const mostrado = codigoMostradoCarrera(c.codigo)
    const propio = c.codigo.trim() === mostrado
    const previo = porMostrado.get(mostrado)
    if (!previo || (propio && !previo.propio)) {
      porMostrado.set(mostrado, { codigo: mostrado, literal: c.literal, propio })
    }
  }
  return [...porMostrado.values()]
    .map(({ codigo, literal }) => ({ codigo, literal }))
    .sort((a, b) =>
      etiquetaCarreraCR(a).localeCompare(etiquetaCarreraCR(b), 'es', { numeric: true }),
    )
}

/**
 * Códigos a enviar al backend: si se eligió 37 se agrega 22 (sin duplicar) para
 * que los cargos con CR 22 sigan contando. Cualquier otra selección queda igual.
 */
export function expandirCarrerasParaConsulta(codigos: string[]): string[] {
  const extra: string[] = []
  for (const [original, principal] of Object.entries(CR_POR_CODIGO_ESCALAFON_GESTIONADO)) {
    if (original !== principal && codigos.includes(principal) && !codigos.includes(original) && !extra.includes(original)) {
      extra.push(original)
    }
  }
  return extra.length ? [...codigos, ...extra] : codigos
}
