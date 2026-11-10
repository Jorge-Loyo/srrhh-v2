// Resaltado del menú lateral para el grupo GESTIÓN.
// La bandeja "Gestión de Concursos" vive en /cargos/concurso y de ahí se entra
// a cada concurso individual, por eso ambos resaltan "Gestión de Cargos".
// Solo los LISTADOS (/concursos/cph, /concursos/ceetps) resaltan su propio ítem.

export type ItemGestionActivo = 'gestion-cargos' | 'concursos-cph' | 'concursos-ceetps' | null

const RUTAS_GESTION_CARGOS = [
  '/cargos/alta',
  '/cargos/baja',
  '/cargos/alta-por-baja',
  '/cargos/concurso',
  '/cargos/nuevos-cargos',
]

function empiezaCon(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`)
}

export function itemGestionActivo(pathname: string): ItemGestionActivo {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (RUTAS_GESTION_CARGOS.some((r) => empiezaCon(p, r))) return 'gestion-cargos'
  if (p === '/concursos/cph') return 'concursos-cph'
  if (p === '/concursos/ceetps') return 'concursos-ceetps'
  // Concurso individual (detalle / wizard): se llega desde la bandeja de Gestión de Cargos.
  if (empiezaCon(p, '/concursos/cph') || empiezaCon(p, '/concursos/ceetps')) return 'gestion-cargos'
  return null
}
