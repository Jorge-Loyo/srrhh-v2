import type { SolicitudAlta, SolicitudAltaEstado } from '@srrhh/types'

// Estado AGREGADO de un grupo (expediente). "Paso 3 — Cargos Históricos":
//   - aprobado  → TODAS las solicitudes del grupo están aprobadas
//   - rechazado → TODAS rechazadas
//   - pendiente → TODAS pendientes
//   - parcial   → mezcla (ej. algunas aprobadas y otras pendientes/rechazadas)
export type EstadoGrupo = SolicitudAltaEstado | 'parcial'

export interface GrupoExpediente {
  // Clave de agrupación. Las solicitudes sin expediente se agrupan bajo '' y se
  // muestran como "(sin expediente)" en la vista.
  expediente: string
  // Fecha de creación del grupo = la más antigua de sus solicitudes (el lote se
  // envía junto, así que todas suelen compartir createdAt; tomamos la mínima).
  createdAt: string
  // Usuario que solicitó el lote (de la primera solicitud; comparten solicitante).
  solicitante: string | null
  // Suma de `cantidad` de todas las solicitudes del grupo (total de cargos).
  totalCargos: number
  // Estado agregado del grupo (ver EstadoGrupo).
  estado: EstadoGrupo
  // Las solicitudes del grupo, para el detalle expandible (solo lectura).
  solicitudes: SolicitudAlta[]
}

// Calcula el estado agregado a partir de los estados individuales del grupo.
// Si no hay solicitudes devuelve 'pendiente' (caso defensivo; no debería pasar).
export function estadoAgregado(estados: SolicitudAltaEstado[]): EstadoGrupo {
  if (estados.length === 0) return 'pendiente'
  const primero = estados[0]!
  return estados.every((e) => e === primero) ? primero : 'parcial'
}

// Agrupa un array plano de SolicitudAlta por `expediente`. Devuelve una fila por
// grupo con fecha mínima, solicitante, total de cargos y estado agregado.
// Ordena los grupos por fecha de creación descendente (lo más nuevo primero).
export function agruparPorExpediente(solicitudes: SolicitudAlta[]): GrupoExpediente[] {
  const mapa = new Map<string, SolicitudAlta[]>()
  for (const s of solicitudes) {
    const clave = s.expediente ?? ''
    const lista = mapa.get(clave)
    if (lista) lista.push(s)
    else mapa.set(clave, [s])
  }

  const grupos: GrupoExpediente[] = []
  for (const [expediente, lista] of mapa) {
    const createdAt = lista.reduce((min, s) => (s.createdAt < min ? s.createdAt : min), lista[0]!.createdAt)
    const totalCargos = lista.reduce((acc, s) => acc + s.cantidad, 0)
    const solicitante = lista.find((s) => s.solicitadoPor?.username)?.solicitadoPor?.username ?? null
    grupos.push({
      expediente,
      createdAt,
      solicitante,
      totalCargos,
      estado: estadoAgregado(lista.map((s) => s.estado)),
      solicitudes: lista,
    })
  }

  grupos.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  return grupos
}
