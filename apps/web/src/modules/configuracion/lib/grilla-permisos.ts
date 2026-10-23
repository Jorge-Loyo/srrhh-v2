import type { Permiso } from '@srrhh/types'

// ──────────────────────────────────────────────────────────────────────────
// Lógica pura de la grilla de permisos (/configuracion/permisos).
//
// La grilla se arma SIEMPRE desde el catálogo real (usePermisosCatalogo).
// El orden del sidebar (AppShell.tsx) se usa SOLO para ordenar y agrupar,
// nunca para inventar permisos. Esta capa no monta React y es testeable.
// ──────────────────────────────────────────────────────────────────────────

// Una sección de la grilla. El orden replica los NavLink del sidebar.
export type SeccionPermisos = {
  id: string // clave estable para React y para el estado de expand
  label: string // título del grupo (texto del botón del sidebar)
  icono?: string // emoji opcional, mismo del sidebar, decorativo
  modulos: string[] // módulos del catálogo que agrupa (vacío si informativo)
  informativo?: boolean // true => sin checkboxes, etiqueta "acceso abierto"
}

// Orden 1:1 con los NavLink del sidebar (AppShell.tsx), de arriba a abajo.
export const SECCIONES: SeccionPermisos[] = [
  { id: 'inicio', label: 'Inicio', icono: '🏠', modulos: ['inicio'] },
  { id: 'reportes', label: 'Reportes', icono: '📈', modulos: ['reportes'] },
  { id: 'kpis', label: 'Tablero KPIs', icono: '📊', modulos: ['kpis'] },
  { id: 'dotacion', label: 'Dotación', icono: '🩺', modulos: ['dotacion'] },
  { id: 'organigrama', label: 'Organigrama', icono: '🏢', modulos: [], informativo: true },
  { id: 'pou', label: 'POU', icono: '🧮', modulos: [], informativo: true },
  { id: 'personas', label: 'Personas', icono: '👤', modulos: ['personas'] },
  { id: 'cargos', label: 'Cargos', icono: '🗂️', modulos: ['cargos'] },
  { id: 'bajas', label: 'Bajas', icono: '🗑️', modulos: ['bajas'] },
  { id: 'retenciones', label: 'Retenciones', icono: '🔁', modulos: ['retenciones'] },
  { id: 'concursos-cph', label: 'Concursos CPH', icono: '⚖️', modulos: ['concursos-cph'] },
  { id: 'concursos-ceetps', label: 'Concursos CEETPS', icono: '🏥', modulos: ['concursos-ceetps'] },
  { id: 'importacion', label: 'Importación', icono: '📥', modulos: ['padron', 'bajas-sial'] },
  { id: 'configuracion', label: 'Configuración', icono: '⚙️', modulos: ['configuracion'] },
]

// Módulos transversales/sistema que no son botón del sidebar (son badges del
// <header> o flujos internos). Van en una sección final fija, en este orden.
//  - autorizaciones: badge 🔐 del <header>, no del <nav>.
//  - notificaciones: badge 🔔 del <header>, no del <nav>.
//  - solicitudes-alta: flujo interno, sin entrada de navegación.
export const MODULOS_SISTEMA = ['autorizaciones', 'notificaciones', 'solicitudes-alta']

// Orden canónico de acciones dentro de cada sub-grupo. "Ver" siempre primero.
// Las acciones no listadas (índice -1) van después, alfabéticas por slug.
export const ACCION_ORDEN = [
  'ver',
  'crear',
  'editar',
  'subir',
  'aprobar',
  'aprobar_padron',
  'eliminar_snap',
  'autorizar',
  'resolver',
  'resolver_sgrasv',
  // acciones de 'configuracion':
  'gestionar_usuarios',
  'gestionar_permisos',
  'gestionar_organigrama',
  'gestionar_pou',
  'gestionar_referencias',
  'ver_auditoria',
  'purgar_auditoria',
]

const MODULO_LABEL: Record<string, string> = {
  'inicio':             'Inicio',
  'reportes':           'Reportes',
  'kpis':               'Tablero KPIs',
  'personas':           'Personas',
  'dotacion':           'Dotación',
  'cargos':             'Cargos',
  'bajas':              'Baja de cargo / Alta por baja',
  'bajas-sial':         'Bajas Consolidadas',
  'retenciones':        'Retenciones',
  'concursos-cph':      'Concursos CPH',
  'concursos-ceetps':   'Concursos CEETPS',
  'padron':             'Padrón Semanal',
  'configuracion':      'Configuración',
  'notificaciones':     'Notificaciones',
  'autorizaciones':     'Autorizaciones (sistema)',
  'solicitudes-alta':   'Solicitudes Alta',
  // Labels huérfanos (no presentes en el catálogo real). Se dejan inertes:
  // la grilla se arma solo desde el catálogo, así que nunca se renderizan.
  'etiquetas':          'Etiquetas',
  'ordenes_merito':     'Órdenes de Mérito',
  'postulantes':        'Postulantes',
}

const ACCION_LABEL: Record<string, string> = {
  'ver':                   'Ver',
  'crear':                 'Crear / Alta',
  'editar':                'Editar',
  'subir':                 'Subir archivo',
  'aprobar':               'Aprobar / Rechazar',
  'aprobar_padron':        'Aprobar padrón',
  'eliminar_snap':         'Eliminar snapshot',
  'autorizar':             'Autorizar',
  'resolver':              'Resolver',
  'resolver_director':     'Resolver Director',
  'resolver_sgrasv':       'Resolver Sgrasv',
  'gestionar_usuarios':    'Gestionar usuarios',
  'gestionar_permisos':    'Gestionar permisos y roles',
  'gestionar_organigrama': 'Gestionar Organigrama',
  'gestionar_pou':         'Gestionar Pou',
  'gestionar_referencias': 'Gestionar Referencias',
  'purgar_auditoria':      'Purgar Auditoría',
  'ver_auditoria':         'Ver Auditoría',
}

export function accionLabel(accion: string) {
  return ACCION_LABEL[accion] ?? accion.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function moduloLabel(modulo: string) {
  return MODULO_LABEL[modulo] ?? modulo.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export type SubgrupoRender = { modulo: string; label: string; permisos: Permiso[] }

export type GrupoRender = {
  seccion: SeccionPermisos // o una sección sintética para Sistema/catch-all
  subgrupos: SubgrupoRender[] // en el orden declarado en seccion.modulos
  permisosPlanos: Permiso[] // para el conteo por grupo y para iterar el toggle
}

// Ordena los permisos de un sub-grupo por ACCION_ORDEN; las acciones no
// listadas van al final, alfabéticas por slug. Sort estable (comparador total).
function ordenarPermisos(permisos: Permiso[]): Permiso[] {
  const indice = (accion: string) => {
    const i = ACCION_ORDEN.indexOf(accion)
    return i === -1 ? Number.POSITIVE_INFINITY : i
  }
  return [...permisos].sort((a, b) => {
    const ia = indice(a.accion)
    const ib = indice(b.accion)
    if (ia !== ib) return ia - ib
    return a.accion.localeCompare(b.accion)
  })
}

// Resuelve una lista de módulos contra el índice del catálogo, conservando el
// orden declarado y omitiendo los que no existan o no tengan permisos.
function resolverSubgrupos(modulos: string[], indice: Map<string, Permiso[]>): SubgrupoRender[] {
  const subgrupos: SubgrupoRender[] = []
  for (const modulo of modulos) {
    const permisos = indice.get(modulo)
    if (!permisos || permisos.length === 0) continue
    subgrupos.push({ modulo, label: moduloLabel(modulo), permisos: ordenarPermisos(permisos) })
  }
  return subgrupos
}

function planos(subgrupos: SubgrupoRender[]): Permiso[] {
  return subgrupos.flatMap((s) => s.permisos)
}

// Construye la lista de grupos renderizables desde el catálogo real.
export function construirGrupos(catalogo: Permiso[]): GrupoRender[] {
  // 1. Indexar el catálogo por módulo una sola vez.
  const indice = new Map<string, Permiso[]>()
  for (const p of catalogo) {
    if (!indice.has(p.modulo)) indice.set(p.modulo, [])
    indice.get(p.modulo)!.push(p)
  }

  const grupos: GrupoRender[] = []
  const consumidos = new Set<string>()

  // 2. Recorrer SECCIONES en orden.
  for (const seccion of SECCIONES) {
    if (seccion.informativo) {
      // 3. Secciones informativas: sin sub-módulos ni permisos, siempre visibles.
      grupos.push({ seccion, subgrupos: [], permisosPlanos: [] })
      continue
    }
    const subgrupos = resolverSubgrupos(seccion.modulos, indice)
    // Omitir sección-botón NO informativa que quede sin ningún sub-módulo.
    if (subgrupos.length === 0) continue
    for (const sg of subgrupos) consumidos.add(sg.modulo)
    grupos.push({ seccion, subgrupos, permisosPlanos: planos(subgrupos) })
  }

  // 4. Sección Sistema / Transversales (sintética), desde MODULOS_SISTEMA.
  const subgruposSistema = resolverSubgrupos(MODULOS_SISTEMA, indice)
  if (subgruposSistema.length > 0) {
    for (const sg of subgruposSistema) consumidos.add(sg.modulo)
    grupos.push({
      seccion: { id: 'sistema', label: 'Sistema / Transversales', icono: '🧩', modulos: MODULOS_SISTEMA },
      subgrupos: subgruposSistema,
      permisosPlanos: planos(subgruposSistema),
    })
  }

  // 5. Catch-all de robustez: módulos del catálogo no consumidos por ninguna
  // sección ni por Sistema => grupo propio al final, uno por módulo.
  for (const [modulo, permisos] of indice) {
    if (consumidos.has(modulo)) continue
    if (!permisos || permisos.length === 0) continue
    const label = moduloLabel(modulo)
    const subgrupo: SubgrupoRender = { modulo, label, permisos: ordenarPermisos(permisos) }
    grupos.push({
      seccion: { id: modulo, label, modulos: [modulo] },
      subgrupos: [subgrupo],
      permisosPlanos: subgrupo.permisos,
    })
  }

  return grupos
}
