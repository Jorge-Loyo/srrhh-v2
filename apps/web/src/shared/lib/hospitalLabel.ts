import type { Hospital } from '@srrhh/types'

// Muestra "SIGLA — Nombre" cuando el nombre aporta info extra.
// Si nombre === sigla (organismos sin nombre descriptivo aún), muestra solo la sigla.
export function hospitalLabel(h: Pick<Hospital, 'sigla' | 'nombre'>): string {
  if (!h.nombre || h.nombre.trim() === h.sigla.trim()) return h.sigla
  return `${h.sigla} — ${h.nombre}`
}
