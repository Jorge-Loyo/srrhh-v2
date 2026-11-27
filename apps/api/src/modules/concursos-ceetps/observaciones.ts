// Las observaciones de un concurso CEETPS son notas de personas. La carga masiva
// (ETL) solía agregar una línea "[ETL] ..." con trazas internas que no aportan
// nada: se quita al leer y al guardar, y no se vuelve a escribir.
export function quitarTrazasEtl(texto: string | null | undefined): string | null {
  if (texto == null) return null
  const limpio = texto
    .split(/\r?\n/)
    .filter((linea) => !linea.trimStart().startsWith('[ETL]'))
    .join('\n')
    .trim()
  return limpio === '' ? null : limpio
}
