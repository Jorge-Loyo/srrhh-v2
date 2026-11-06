import type { Permiso } from '@srrhh/types'

// ──────────────────────────────────────────────────────────────────────────
// Lógica pura de la grilla de permisos (/configuracion/permisos).
//
// La grilla se arma SIEMPRE desde el catálogo real (usePermisosCatalogo).
// El orden del sidebar (AppShell.tsx) se usa SOLO para ordenar y agrupar,
// nunca para inventar permisos. Esta capa no monta React y es testeable.
// ──────────────────────────────────────────────────────────────────────────

// Grupo de nivel superior del panel (cabecera que agrupa varias secciones).
// Replica los 3 grupos del sidebar (AppShell.tsx) + la familia Sistema.
export type GrupoPanel = 'visualizacion' | 'gestion' | 'admin' | 'sistema'

// Título legible de cada grupo (cabecera que se pinta antes de sus secciones).
export const GRUPO_LABEL: Record<GrupoPanel, string> = {
  visualizacion: 'Visualización',
  gestion: 'Gestión',
  admin: 'Vista Admin',
  sistema: 'Sistema / Transversales',
}

// Orden de los grupos en el panel.
export const GRUPO_ORDEN: GrupoPanel[] = ['visualizacion', 'gestion', 'admin', 'sistema']

// Una sección de la grilla. El orden replica los NavLink del sidebar.
export type SeccionPermisos = {
  id: string // clave estable para React y para el estado de expand
  label: string // título del grupo (texto del botón del sidebar)
  icono?: string // emoji opcional, mismo del sidebar, decorativo
  modulos: string[] // módulos del catálogo que agrupa (vacío si informativo)
  grupo?: GrupoPanel // grupo de nivel superior al que pertenece (cabecera)
  // Filtro opcional de acciones: cuando está presente, la sección solo toma los
  // permisos del/los módulo(s) cuya `accion` esté incluida (whitelist). Permite
  // partir un mismo módulo en 2 secciones de distinto grupo (p.ej. 'cargos':
  // Ver bajo Visualización vs. Gestión de Cargos bajo Gestión). Los permisos del
  // módulo NO incluidos en ninguna whitelist caen por el catch-all (robustez).
  acciones?: string[]
  informativo?: boolean // true => sin checkboxes, etiqueta "acceso abierto"
}

// Orden 1:1 con los NavLink del sidebar (AppShell.tsx), agrupados en los 3
// grupos nombrados (VISUALIZACIÓN / GESTIÓN / VISTA ADMIN).
//
// SPLIT DE CARGOS (misma decisión que el sidebar): el módulo 'cargos' se parte
// en DOS secciones vía el filtro `acciones`:
//   - "Cargos (consulta)" en Visualización: solo tab:ver-cargos.
//   - "Gestión de Cargos" en Gestión: crear + los 3 tab:* de gestión.
// Ambas apuntan al mismo módulo 'cargos' pero con whitelists disjuntas, así que
// cada permiso aparece exactamente una vez, en el grupo correcto.
export const SECCIONES: SeccionPermisos[] = [
  // ── VISUALIZACIÓN ──────────────────────────────────────────────────────
  { id: 'inicio', label: 'Inicio', icono: '🏠', modulos: ['inicio'], grupo: 'visualizacion' },
  { id: 'reportes', label: 'Reportes', icono: '📈', modulos: ['reportes'], grupo: 'visualizacion' },
  { id: 'kpis', label: 'Tablero KPIs', icono: '📊', modulos: ['kpis'], grupo: 'visualizacion' },
  { id: 'dotacion', label: 'Dotación', icono: '🩺', modulos: ['dotacion'], grupo: 'visualizacion' },
  // Organigrama NO informativo: muestra su permiso ver nuevo + los tab:*
  // (estructura cosmético + areas-programaticas).
  { id: 'organigrama', label: 'Organigrama', icono: '🏢', modulos: ['organigrama'], grupo: 'visualizacion' },
  // POU deja de ser informativo: ahora tiene el checkbox Ver (pou/ver) asignable.
  { id: 'pou', label: 'POU', icono: '🧮', modulos: ['pou'], grupo: 'visualizacion' },
  { id: 'personas', label: 'Personas', icono: '👤', modulos: ['personas'], grupo: 'visualizacion' },
  { id: 'cargos-ver', label: 'Cargos (consulta)', icono: '🗂️', modulos: ['cargos'], acciones: ['tab:ver-cargos'], grupo: 'visualizacion' },
  { id: 'bajas', label: 'Bajas', icono: '🗑️', modulos: ['bajas'], grupo: 'visualizacion' },
  { id: 'retenciones', label: 'Retenciones', icono: '🔁', modulos: ['retenciones'], grupo: 'visualizacion' },
  // ── GESTIÓN ────────────────────────────────────────────────────────────
  { id: 'cargos-gestion', label: 'Gestión de Cargos', icono: '🛠️', modulos: ['cargos'], acciones: ['ver', 'crear', 'tab:alta-cargo', 'tab:baja-cargo', 'tab:cobertura-vacantes', 'tab:concurso'], grupo: 'gestion' },
  { id: 'concursos-cph', label: 'Concursos CPH', icono: '⚖️', modulos: ['concursos-cph'], grupo: 'gestion' },
  { id: 'concursos-ceetps', label: 'Concursos CEETPS', icono: '🏥', modulos: ['concursos-ceetps'], grupo: 'gestion' },
  { id: 'incidencias', label: 'Incidencias', icono: '📌', modulos: ['incidencias'], grupo: 'gestion' },
  // ── VISTA ADMIN ────────────────────────────────────────────────────────
  { id: 'importacion', label: 'Importación', icono: '📥', modulos: ['padron', 'bajas-sial'], grupo: 'admin' },
  { id: 'configuracion', label: 'Configuración', icono: '⚙️', modulos: ['configuracion'], grupo: 'admin' },
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
  'organigrama':        'Organigrama',
  'pou':                'POU',
  'incidencias':        'Incidencias',
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

// Labels fijos de los tab:* de Concursos CPH (el title-case del slug perdería
// acentos y preposiciones).
const TAB_LABEL: Record<string, string> = {
  // Pestaña "Concurso" de /cargos (bandeja mixta de inicio, paso 1 flujo concursos).
  'tab:concurso': 'Pestaña: Concurso (bandeja de inicio)',
  'tab:concursos': 'Pestaña: Concursos',
  'tab:jurados': 'Pestaña: Jurados',
  'tab:ordenes-merito': 'Pestaña: Órdenes de mérito',
  'tab:jornadas-sorteo': 'Pestaña: Jornada de sorteos',
  'tab:baja-apertura': 'Etapa 1: Baja / Apertura',
  'tab:autorizacion-jurado': 'Etapa 2: Autorización / Jurado',
  'tab:inscripcion-examen-om': 'Etapa 3: Inscripción / Examen / OM',
  'tab:ifacs-insal': 'Etapa 4: IFACS / INSAL',
  'tab:designacion': 'Etapa 5: Designación',
}
export function accionLabel(accion: string) {
  if (TAB_LABEL[accion]) return TAB_LABEL[accion]
  // Permisos de pestaña `tab:<slug>` -> "Pestaña: <Title Case del slug>".
  // El label corto deriva del slug (puede perder preposiciones/acentos); la
  // descripción legible completa viene del campo `descripcion` del permiso.
  if (accion.startsWith('tab:')) {
    const slug = accion.slice('tab:'.length)
    return 'Pestaña: ' + slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }
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
  grupo: GrupoPanel // grupo de nivel superior (cabecera) al que pertenece
}

// Cabecera de grupo renderizable + sus secciones. El panel pinta un título de
// grupo (GRUPO_LABEL) antes de las secciones que lo componen.
export type GrupoPanelRender = {
  grupo: GrupoPanel
  label: string
  grupos: GrupoRender[] // secciones de este grupo, en orden
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
// orden declarado y omitiendo los que no existan o no tengan permisos. Si
// `acciones` está presente, cada módulo se filtra a esa whitelist de acciones.
function resolverSubgrupos(
  modulos: string[],
  indice: Map<string, Permiso[]>,
  acciones?: string[]
): SubgrupoRender[] {
  const subgrupos: SubgrupoRender[] = []
  const filtro = acciones ? new Set(acciones) : null
  for (const modulo of modulos) {
    const todos = indice.get(modulo)
    if (!todos || todos.length === 0) continue
    const permisos = filtro ? todos.filter((p) => filtro.has(p.accion)) : todos
    if (permisos.length === 0) continue
    subgrupos.push({ modulo, label: moduloLabel(modulo), permisos: ordenarPermisos(permisos) })
  }
  return subgrupos
}

function planos(subgrupos: SubgrupoRender[]): Permiso[] {
  return subgrupos.flatMap((s) => s.permisos)
}

// Construye la lista de grupos (secciones) renderizables desde el catálogo real.
// El consumo se trackea POR PERMISO (no por módulo) para soportar módulos
// partidos en varias secciones (p.ej. 'cargos'): el catch-all solo recoge
// permisos que ninguna sección ni Sistema haya tomado.
export function construirGrupos(catalogo: Permiso[]): GrupoRender[] {
  // 1. Indexar el catálogo por módulo una sola vez.
  const indice = new Map<string, Permiso[]>()
  for (const p of catalogo) {
    if (!indice.has(p.modulo)) indice.set(p.modulo, [])
    indice.get(p.modulo)!.push(p)
  }

  const grupos: GrupoRender[] = []
  const consumidos = new Set<string>() // ids de permiso ya colocados

  const marcarConsumidos = (subgrupos: SubgrupoRender[]) => {
    for (const sg of subgrupos) for (const p of sg.permisos) consumidos.add(p.id)
  }

  // 2. Recorrer SECCIONES en orden.
  for (const seccion of SECCIONES) {
    const grupo = seccion.grupo ?? 'visualizacion'
    if (seccion.informativo) {
      // 3. Secciones informativas: sin sub-módulos ni permisos, siempre visibles.
      grupos.push({ seccion, subgrupos: [], permisosPlanos: [], grupo })
      continue
    }
    const subgrupos = resolverSubgrupos(seccion.modulos, indice, seccion.acciones)
    // Omitir sección-botón NO informativa que quede sin ningún sub-módulo.
    if (subgrupos.length === 0) continue
    marcarConsumidos(subgrupos)
    grupos.push({ seccion, subgrupos, permisosPlanos: planos(subgrupos), grupo })
  }

  // 4. Sección Sistema / Transversales (sintética), desde MODULOS_SISTEMA.
  const subgruposSistema = resolverSubgrupos(MODULOS_SISTEMA, indice)
  if (subgruposSistema.length > 0) {
    marcarConsumidos(subgruposSistema)
    grupos.push({
      seccion: { id: 'sistema', label: 'Sistema / Transversales', icono: '🧩', modulos: MODULOS_SISTEMA, grupo: 'sistema' },
      subgrupos: subgruposSistema,
      permisosPlanos: planos(subgruposSistema),
      grupo: 'sistema',
    })
  }

  // 5. Catch-all de robustez: permisos del catálogo no consumidos por ninguna
  // sección ni por Sistema => grupo propio al final, uno por módulo. Cae bajo
  // el grupo 'sistema' (cajón transversal). Incluye acciones de un módulo que
  // quedaron fuera de las whitelists de las secciones que lo parten.
  const catchAll = new Map<string, Permiso[]>()
  for (const [modulo, permisos] of indice) {
    for (const p of permisos) {
      if (consumidos.has(p.id)) continue
      if (!catchAll.has(modulo)) catchAll.set(modulo, [])
      catchAll.get(modulo)!.push(p)
    }
  }
  for (const [modulo, permisos] of catchAll) {
    if (permisos.length === 0) continue
    const label = moduloLabel(modulo)
    const subgrupo: SubgrupoRender = { modulo, label, permisos: ordenarPermisos(permisos) }
    grupos.push({
      seccion: { id: modulo, label, modulos: [modulo], grupo: 'sistema' },
      subgrupos: [subgrupo],
      permisosPlanos: subgrupo.permisos,
      grupo: 'sistema',
    })
  }

  return grupos
}

// Agrupa las secciones (GrupoRender) bajo sus 3 cabeceras + Sistema, en el
// orden canónico (GRUPO_ORDEN). Un grupo sin secciones no se emite. El panel
// usa esto para pintar una cabecera de grupo antes de cada bloque de secciones.
export function construirGruposPanel(catalogo: Permiso[]): GrupoPanelRender[] {
  const secciones = construirGrupos(catalogo)
  const porGrupo = new Map<GrupoPanel, GrupoRender[]>()
  for (const s of secciones) {
    if (!porGrupo.has(s.grupo)) porGrupo.set(s.grupo, [])
    porGrupo.get(s.grupo)!.push(s)
  }
  const resultado: GrupoPanelRender[] = []
  for (const grupo of GRUPO_ORDEN) {
    const items = porGrupo.get(grupo)
    if (!items || items.length === 0) continue
    resultado.push({ grupo, label: GRUPO_LABEL[grupo], grupos: items })
  }
  return resultado
}
