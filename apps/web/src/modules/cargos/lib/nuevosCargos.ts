// Paso 4 — helpers de la pestaña "Nuevos cargos" (concursos de cargo nuevo sin
// iniciar). Tipos espejo de GET /api/v1/cargos/nuevos (nuevos-cargos.service.ts).

export type TipoConcursoNuevo = 'cph' | 'ceetps'

export interface NuevoCargoItem {
  concursoId: string
  /** ConcursoCph.id o ConcursoCeetps.id, según `tipo`. */
  detalleId: string
  tipo: TipoConcursoNuevo
  expediente: string | null
  hospital: { id: string; sigla: string } | null
  puesto: string | null
  especialidad: string | null
  carrera: string | null
  cargo: { id: string; codigo: string | null; idSial: string | null }
  etiquetas: { id: string; nombre: string; color: string | null }[]
  fechaAlta: string
}

export interface NuevoCargoGrupo {
  expediente: string | null
  cantidad: number
  fechaAlta: string
  items: NuevoCargoItem[]
}

export interface NuevoCargoSinConcurso {
  cargoId: string
  codigo: string | null
  idSial: string | null
  expediente: string | null
  hospital: { id: string; sigla: string } | null
  puesto: string | null
  especialidad: string | null
  carrera: string | null
  codigoRegistro: string | null
  motivo: 'sin_tipo' | 'sin_concurso'
  fechaAlta: string
}

export interface NuevosCargosResponse {
  data: NuevoCargoGrupo[]
  sinConcurso: NuevoCargoSinConcurso[]
  meta: { total: number; grupos: number; sinConcurso: number }
}

/**
 * Destino del botón "Caratular": abre el concurso existente en su Etapa 1
 * ("Apertura / Autorización"); no crea nada. CPH: el wizard abre en la primera
 * etapa activa (la 1 mientras no haya expediente). CEETPS: detalle del concurso.
 */
export function rutaCaratular(item: Pick<NuevoCargoItem, 'tipo' | 'detalleId'>): string {
  return item.tipo === 'ceetps'
    ? `/concursos/ceetps/${item.detalleId}`
    : `/concursos/cph/${item.detalleId}/wizard`
}

export const ETIQUETA_TIPO: Record<TipoConcursoNuevo, string> = { cph: 'CPH', ceetps: 'CEETPS' }

/** Leyenda de cada cargo nuevo que todavía no tiene concurso. */
export function textoSinConcurso(motivo: NuevoCargoSinConcurso['motivo']): string {
  return motivo === 'sin_tipo'
    ? 'Sin tipo de concurso definido'
    : 'Sin concurso (alta anterior a la creación automática)'
}
