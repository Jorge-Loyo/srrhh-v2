import type { OrganigramaNodo } from '../hooks/useOrganigrama'

// Paleta de color por tipo de unidad organizativa, compartida entre la vista
// Árbol y la vista Diagrama. Puerto literal de la app vieja
// (dotacion-rrhh/frontend/src/utils/organigramaHelpers.js) — cada tipo usa una
// familia de color de Tailwind distinta para que sean reconocibles de un vistazo.
const TIPO_COLOR: Record<string, string> = {
  Ministerio: 'bg-slate-700 text-white',
  AREA: 'bg-orange-600 text-white',
  'SSEC/DIREJE': 'bg-lime-700 text-white',
  GO: 'bg-primary-700 text-white',
  SGO: 'bg-blue-600 text-white',
  DG: 'bg-fuchsia-600 text-white',
  'F/N DG': 'bg-violet-600 text-white',
  'F/N DEJE': 'bg-teal-600 text-white',
  'F/N MSTR - GO': 'bg-emerald-600 text-white',
  DHOS: 'bg-rose-600 text-white',
  SDHOS: 'bg-cyan-600 text-white',
  'UAI DG': 'bg-red-700 text-white',
  'UAI MSTR': 'bg-red-800 text-white',
  'PLTA TRANS. DOCENTE': 'bg-orange-500 text-white',
  REGIMEN: 'bg-amber-500 text-white',
  DEPT: 'bg-indigo-600 text-white',
  'DEPT CA': 'bg-yellow-700 text-white',
  DIV: 'bg-purple-600 text-white',
  'DIV CA': 'bg-green-600 text-white',
  UNID: 'bg-pink-600 text-white',
  SECCION: 'bg-sky-600 text-white',
  SECC: 'bg-sky-600 text-white',
  'SECCION CA': 'bg-stone-600 text-white',
}

export const UMBRAL_DEPT = 8

export interface GrupoDept {
  label: string
  nodos: OrganigramaNodo[]
}

export function tipoColor(tipo: string): string {
  return TIPO_COLOR[tipo] || 'bg-gray-200 text-gray-700'
}


// El nombre largo del nodo suele repetir como prefijo la misma sigla
// estructural que ya muestra el badge de tipo (ej: "DIV Legales"). Se quita
// para no duplicar esa info. No siempre coincide literal con el badge (ej:
// badge "SECCION CA" pero el nombre arranca con "SECC"), por eso es una lista
// de prefijos conocidos en vez de derivarlo del tipo del propio nodo.
const REDUNDANT_NAME_PREFIXES = [
  'SECCION', 'SECC', 'DEPT', 'DIV', 'UNID', 'REGIMEN', 'SGO', 'GO', 'DG', 'AREA', 'DHOS', 'SDHOS',
]

export function stripRedundantPrefix(name: string | null): string {
  if (!name) return ''
  const prefix = REDUNDANT_NAME_PREFIXES.find((p) => name.startsWith(`${p} `))
  return prefix ? name.slice(prefix.length + 1) : name
}

// Agrupa hijos DEPT por su nodo cabecera "AREA PROGRAMATICA" o "HOSPITAL GENERAL".
// Usado tanto en la vista Árbol como en la vista Diagrama.
export function agruparDept(hijosDept: OrganigramaNodo[]): GrupoDept[] {
  const cabeceras: OrganigramaNodo[] = []
  const resto: OrganigramaNodo[] = []
  for (const h of hijosDept) {
    if (h.nombre?.toUpperCase().includes('AREA PROGRAMATICA') || h.nombre?.toUpperCase().includes('HOSPITAL GENERAL')) {
      cabeceras.push(h)
    } else {
      resto.push(h)
    }
  }
  if (cabeceras.length === 0) return [{ label: `Áreas Programáticas (${hijosDept.length})`, nodos: hijosDept }]
  cabeceras.sort((a, b) => a.id.localeCompare(b.id))
  const grupos = new Map<string, { cabecera: OrganigramaNodo; miembros: OrganigramaNodo[] }>(
    cabeceras.map((c) => [c.id, { cabecera: c, miembros: [] }])
  )
  const huerfanos: OrganigramaNodo[] = []
  for (const nodo of resto) {
    let mejorCabecera: OrganigramaNodo | null = null
    let mejorLen = 0
    for (const cab of cabeceras) {
      let len = 0
      for (let i = 0; i < Math.min(cab.id.length, nodo.id.length); i++) {
        if (cab.id[i] === nodo.id[i]) len++
        else break
      }
      if (len >= 4 && len > mejorLen) { mejorLen = len; mejorCabecera = cab }
    }
    if (mejorCabecera) grupos.get(mejorCabecera.id)!.miembros.push(nodo)
    else huerfanos.push(nodo)
  }
  const resultado: GrupoDept[] = []
  for (const { cabecera, miembros } of grupos.values()) {
    const label = stripRedundantPrefix(cabecera.nombre) ?? cabecera.id
    resultado.push({ label: `${label} (${1 + miembros.length})`, nodos: [cabecera, ...miembros] })
  }
  if (huerfanos.length > 0) resultado.push({ label: `Otros (${huerfanos.length})`, nodos: huerfanos })
  return resultado
}

function normalizeText(str: string): string {
  return str
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

export interface SearchMatch {
  id: string
  path: string[]
}

// Busca en todo el árbol (nombre, persona, cargo, código, tipo) y devuelve
// cada coincidencia con el camino de ids de sus ancestros — necesario para
// poder expandir el árbol/diagrama hasta llegar a cada resultado.
export function searchOrgTree(root: OrganigramaNodo, query: string): SearchMatch[] {
  const q = normalizeText(query.trim())
  if (!q) return []

  const results: SearchMatch[] = []
  function visit(node: OrganigramaNodo, path: string[]) {
    const haystack = normalizeText(
      [node.nombre, node.tipo, node.id, node.persona?.nombre, node.persona?.cargo]
        .filter((v): v is string => !!v)
        .join(' ')
    )
    if (haystack.includes(q)) results.push({ id: node.id, path })
    node.hijos.forEach((child) => visit(child, [...path, node.id]))
  }
  visit(root, [])
  return results
}

export interface Vacante {
  id: string
  tipo: string
  nombre: string
  path: string[]
  idPath: string[]
  regimenEmpleo: string
  cargoVacante: { cargoId: string; codigoCargo: string | null } | null
  razonSinCargo: import('../hooks/useOrganigrama').RazonSinCargo | null
}

// Recorre el árbol y junta todos los puestos sin persona asignada, con el
// camino jerárquico hasta cada uno. Los contenedores "REGIMEN" no cuentan
// como vacantes (son agrupadores visuales, no puestos reales).
export function collectVacantes(node: OrganigramaNodo, path: string[] = [], idPath: string[] = []): Vacante[] {
  const result: Vacante[] = []
  if (!node.persona && node.tipo !== 'REGIMEN') {
    result.push({ id: node.id, tipo: node.tipo, nombre: stripRedundantPrefix(node.nombre), path, idPath, regimenEmpleo: node.regimenEmpleo, cargoVacante: node.cargoVacante ?? null, razonSinCargo: node.razonSinCargo ?? null })
  }
  const childPath = [...path, stripRedundantPrefix(node.nombre)]
  const childIdPath = [...idPath, node.id]
  node.hijos.forEach((child) => result.push(...collectVacantes(child, childPath, childIdPath)))
  return result
}
