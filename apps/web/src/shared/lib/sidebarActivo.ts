// Resaltado del menú lateral para el grupo GESTIÓN.
// La bandeja "Gestión de Concursos" vive en /cargos/concurso y de ahí se entra
// a cada concurso CPH individual, por eso ambos resaltan "Gestión de Cargos".
// /concursos/cph (Jurados / OM / Jornadas) resalta su propio ítem. En CEETPS el
// listado y el detalle de cada concurso resaltan "Concursos CEETPS".

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
  // Wizard CEETPS: se abre desde la bandeja de Gestión de Cargos (igual que el de CPH).
  if (/^\/concursos\/ceetps\/[^/]+\/wizard$/.test(p)) return 'gestion-cargos'
  if (empiezaCon(p, '/concursos/ceetps')) return 'concursos-ceetps'
  // Concurso CPH individual (detalle / wizard): se llega desde la bandeja de Gestión de Cargos.
  if (empiezaCon(p, '/concursos/cph')) return 'gestion-cargos'
  return null
}

// Ítems con rutas "vecinas" que viven bajo otro ítem del menú (Importación):
// un prefijo a secas los resaltaría a los dos a la vez.
export function bajasActivo(pathname: string): boolean {
  return empiezaCon(pathname, '/bajas') // no incluye /bajas-consolidadas (Importación)
}

export function organigramaActivo(pathname: string): boolean {
  return empiezaCon(pathname, '/organigrama') && !empiezaCon(pathname, '/organigrama/arbol') // /arbol es de Importación
}
