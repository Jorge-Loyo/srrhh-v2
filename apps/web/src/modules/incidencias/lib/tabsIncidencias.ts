import type { Usuario } from '@srrhh/types'
import { can } from '@/shared/lib/can'

// Registro del lado web de las pestañas de Incidencias. El permiso de cada una
// es `incidencias/tab:<slug>` (ver migración 20261107000000_permisos_incidencias_tabs).
// Agregar un tipo de incidencia nuevo = una entrada acá + su permiso + su TAB_LABEL.
export type TabIncidenciasId = 'todo' | 'sial-sin-cargo' | 'baja-sin-concurso'

export interface TabIncidencias {
  id: TabIncidenciasId
  slug: TabIncidenciasId
  label: string
}

export const TABS_INCIDENCIAS: TabIncidencias[] = [
  { id: 'todo', slug: 'todo', label: 'Todo' },
  { id: 'sial-sin-cargo', slug: 'sial-sin-cargo', label: 'SIAL sin cargo' },
  { id: 'baja-sin-concurso', slug: 'baja-sin-concurso', label: 'Baja sin concurso' },
]

export function pestanasVisibles(user: Usuario | null | undefined): TabIncidencias[] {
  return TABS_INCIDENCIAS.filter((t) => can(user, 'incidencias', 'tab:' + t.slug))
}

// Pestaña activa derivada: la elegida si sigue visible; si no, la primera visible.
export function pestanaActiva(
  visibles: TabIncidencias[],
  elegida: TabIncidenciasId | null,
): TabIncidenciasId | undefined {
  return visibles.some((t) => t.id === elegida) ? (elegida as TabIncidenciasId) : visibles[0]?.id
}

// 'YYYY-MM-DD' -> 'dd/mm/aaaa'
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
