// ─────────────────────────────────────────────────────────────────────────────
// Recodificación (Fase D, datos): el acrónimo del Excel REEMPLAZA el prefijo del código
// y se conserva el número del sistema:
//   CPH-POF-000123 -> CPH-P-000123          CPH-POU-R-000123 -> R-CPH-G-000123 (R- adelante)
//
// Colisión: si dos cargos terminan con el mismo código, UNO conserva el número (el que ya
// tiene ese código; si ninguno, el de menor código/id) y el otro recibe el siguiente número
// libre del acrónimo. El código viejo queda en cargos.codigo_legacy.
// Idempotente: con los códigos ya recodificados no hay cambios.
// ─────────────────────────────────────────────────────────────────────────────
import { ACRONIMOS_MSGC, recodificarCodigo } from './acronimoMsgc.js'
import { partirCodigo } from './cargar.js'

export interface CargoCodigo {
  id: string
  codigo: string
  /** Acrónimo nuevo del cargo; null = sin regla (no se toca). */
  acronimo: string | null
  /** Marca de reemplazante decidida (true agrega R- adelante, false la quita); undefined = conserva la actual. */
  reemplazante?: boolean
}

export interface CambioCodigo {
  id: string
  desde: string
  hasta: string
}

export interface PlanRecodificacion {
  cambios: CambioCodigo[]
  /** Cargos que perdieron el número y recibieron el siguiente libre. */
  colisiones: number
  /** Cargos sin regla de recodificación cuyo prefijo no es un acrónimo del Excel, por prefijo. */
  sin_regla: Record<string, number>
}

const ACRONIMOS = new Set<string>(ACRONIMOS_MSGC)
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Prefijo de un código sin `R-` adelante ni número: `R-CPH-G-000123` -> `CPH-G`. */
export function prefijoAcronimo(codigo: string): string | null {
  const p = partirCodigo(codigo)
  return p ? p.prefijo.replace(/^R-/, '') : null
}

export function planificarRecodificacion(cargos: CargoCodigo[]): PlanRecodificacion {
  const finalDe = new Map<string, string>()
  const sinRegla: Record<string, number> = {}
  for (const c of cargos) {
    const nuevo = c.acronimo ? recodificarCodigo(c.codigo, c.acronimo, c.reemplazante) : null
    finalDe.set(c.id, nuevo ?? c.codigo)
    if (nuevo === null) {
      const pref = prefijoAcronimo(c.codigo) ?? c.codigo
      if (!ACRONIMOS.has(pref)) sinRegla[pref] = (sinRegla[pref] ?? 0) + 1
    }
  }
  // Mayor número por prefijo entre todos los códigos finales.
  const maximos = new Map<string, number>()
  const grupos = new Map<string, CargoCodigo[]>()
  for (const c of cargos) {
    const fin = finalDe.get(c.id) as string
    const p = partirCodigo(fin)
    if (p) maximos.set(p.prefijo, Math.max(maximos.get(p.prefijo) ?? 0, p.numero))
    const g = grupos.get(fin)
    if (g) g.push(c)
    else grupos.set(fin, [c])
  }
  const cambios: CambioCodigo[] = []
  let colisiones = 0
  for (const fin of [...grupos.keys()].sort(cmp)) {
    const g = (grupos.get(fin) as CargoCodigo[]).sort((x, y) => Number(y.codigo === fin) - Number(x.codigo === fin) || cmp(x.codigo, y.codigo) || cmp(x.id, y.id))
    const [conserva, ...pierden] = g
    if (conserva.codigo !== fin) cambios.push({ id: conserva.id, desde: conserva.codigo, hasta: fin })
    if (pierden.length === 0) continue
    const p = partirCodigo(fin)
    if (!p) continue
    for (const c of pierden) {
      const n = (maximos.get(p.prefijo) ?? 0) + 1
      maximos.set(p.prefijo, n)
      cambios.push({ id: c.id, desde: c.codigo, hasta: `${p.prefijo}-${String(n).padStart(6, '0')}` })
      colisiones++
    }
  }
  return { cambios, colisiones, sin_regla: Object.fromEntries(Object.entries(sinRegla).sort(([a], [b]) => cmp(a, b))) }
}

export interface RepoRecodificacion {
  leerCodigos(): Promise<{ id: string; codigo: string }[]>
  /** Guarda el código viejo en codigo_legacy (si estaba vacío) y deja codigo en NULL (evita choques de unicidad). */
  liberarCodigos(ids: string[]): Promise<void>
  asignarCodigos(cambios: CambioCodigo[]): Promise<void>
}

/** Recodifica todos los cargos en dos fases (liberar, asignar) para no chocar con el índice único. */
export async function ejecutarRecodificacion(
  repo: RepoRecodificacion,
  /** Prefijo decidido por cargo: 'CPH-G' (no reemplazante) o 'R-CPH-G' (reemplazante); null = sin regla. */
  acronimoPorCargo: ReadonlyMap<string, string | null>,
  tamanioLote = 1000,
): Promise<PlanRecodificacion> {
  const filas = await repo.leerCodigos()
  const plan = planificarRecodificacion(
    filas.map((f) => {
      const p = acronimoPorCargo.get(f.id) ?? null
      return { id: f.id, codigo: f.codigo, acronimo: p === null ? null : p.replace(/^R-/, ''), reemplazante: p === null ? undefined : p.startsWith('R-') }
    }),
  )
  for (let i = 0; i < plan.cambios.length; i += tamanioLote) await repo.liberarCodigos(plan.cambios.slice(i, i + tamanioLote).map((c) => c.id))
  for (let i = 0; i < plan.cambios.length; i += tamanioLote) await repo.asignarCodigos(plan.cambios.slice(i, i + tamanioLote))
  return plan
}
