import { prisma } from '../../../shared/prisma.js'
import { ANEXO_II_83 } from '../../padron/derivarRegimen.js'
import { normalizarTexto } from '@srrhh/utils'

export type TipoConcursoDim = 'CPH' | 'CEETPS'

interface FilaGestionable {
  codigoRegistro: string
  tipoConcurso: string | null
  regimenOverride: string | null
}

let cache: FilaGestionable[] | null = null

async function cargarGestionables(): Promise<FilaGestionable[]> {
  if (cache) return cache
  cache = await prisma.dimGestionables.findMany({
    where: { activo: true },
    select: { codigoRegistro: true, tipoConcurso: true, regimenOverride: true },
  })
  return cache
}

/** Invalida el cache (útil en tests o si se modifica dim_gestionables en runtime) */
export function invalidarCacheGestionables() {
  cache = null
}

/**
 * Fuente de verdad: ¿el par (codigoRegistro, literalPuesto) genera concurso?
 * Consulta dim_gestionables. El CR 83 solo es gestionable si el literal ∈ ANEXO_II_83.
 * Devuelve 'CPH' | 'CEETPS' | null.
 */
export async function tipoConcursoDeCargoDb({
  codigoRegistro,
  literalPuesto,
}: {
  codigoRegistro: string | null | undefined
  literalPuesto: string | null | undefined
}): Promise<TipoConcursoDim | null> {
  const codigo = (codigoRegistro ?? '').trim()
  if (!codigo) return null

  const gestionables = await cargarGestionables()
  const fila = gestionables.find((g) => g.codigoRegistro === codigo)
  if (!fila) return null

  // CR 83: solo gestionable si el literal normalizado está en ANEXO_II_83
  if (codigo === '83') {
    const litNorm = normalizarTexto(literalPuesto ?? '')
    if (!litNorm || !ANEXO_II_83.has(litNorm)) return null
  }

  return (fila.tipoConcurso as TipoConcursoDim) ?? null
}

/**
 * Versión bulk: dado un array de pares, devuelve un Map id → TipoConcursoDim | null.
 * Carga dim_gestionables una sola vez para todo el lote.
 */
export async function clasificarGestionablesBulk(
  items: { id: string; codigoRegistro: string | null; literalPuesto: string | null }[],
): Promise<Map<string, TipoConcursoDim | null>> {
  const gestionables = await cargarGestionables()
  const mapaGest = new Map(gestionables.map((g) => [g.codigoRegistro, g]))
  const resultado = new Map<string, TipoConcursoDim | null>()

  for (const item of items) {
    const codigo = (item.codigoRegistro ?? '').trim()
    if (!codigo) { resultado.set(item.id, null); continue }

    const fila = mapaGest.get(codigo)
    if (!fila) { resultado.set(item.id, null); continue }

    if (codigo === '83') {
      const litNorm = normalizarTexto(item.literalPuesto ?? '')
      resultado.set(item.id, (litNorm && ANEXO_II_83.has(litNorm)) ? (fila.tipoConcurso as TipoConcursoDim) : null)
    } else {
      resultado.set(item.id, (fila.tipoConcurso as TipoConcursoDim) ?? null)
    }
  }

  return resultado
}
