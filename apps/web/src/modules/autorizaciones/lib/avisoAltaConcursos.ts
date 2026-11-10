// Paso 3 — al aprobar un alta de cargo el backend crea solo un concurso "sin
// iniciar" por cada cargo nuevo. Esta función arma el aviso que se muestra en
// /autorizaciones a partir de lo que devuelve la aprobación (null = no hay nada
// que avisar, p. ej. al aprobar otros tipos de autorización).
export interface ResultadoAprobacionAlta {
  concursosCreados?: number
  concursosSinTipo?: number
}

export function mensajeAvisoAlta(resultado: unknown): string | null {
  const r = (resultado ?? {}) as ResultadoAprobacionAlta
  const creados = r.concursosCreados ?? 0
  const sinTipo = r.concursosSinTipo ?? 0
  const partes: string[] = []
  if (creados > 0) {
    partes.push(
      creados === 1
        ? 'Se creó 1 concurso pendiente de caratular.'
        : `Se crearon ${creados} concursos pendientes de caratular.`,
    )
  }
  if (sinTipo > 0) {
    partes.push(
      sinTipo === 1
        ? '1 cargo no tiene tipo de concurso definido y quedó sin concurso.'
        : `${sinTipo} cargos no tienen tipo de concurso definido y quedaron sin concurso.`,
    )
  }
  return partes.length > 0 ? partes.join(' ') : null
}
