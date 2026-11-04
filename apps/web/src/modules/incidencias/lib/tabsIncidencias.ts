
// Registro del lado web de las pestañas de Incidencias. Son vistas, no funcionalidades:
// no tienen permisos propios (el acceso lo da `incidencias/ver`).
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

// Pestaña activa: la elegida o, por defecto, la primera (Todo).
export function pestanaActiva(elegida: TabIncidenciasId | null): TabIncidenciasId {
  return TABS_INCIDENCIAS.some((t) => t.id === elegida) ? (elegida as TabIncidenciasId) : TABS_INCIDENCIAS[0].id
}

// 'YYYY-MM-DD' -> 'dd/mm/aaaa'
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
