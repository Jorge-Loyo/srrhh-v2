import { describe, it, expect } from 'vitest'
import type { Permiso } from '@srrhh/types'
import {
  construirGrupos,
  construirGruposPanel,
  SECCIONES,
  type GrupoPanel,
} from './grilla-permisos'

// ──────────────────────────────────────────────────────────────────────────
// Catálogo de prueba. Refleja el catálogo real tras la migración
// 20261108000000 (pou/ver + organigrama/ver creados). Un id sintético por par
// (modulo, accion); la lógica solo usa id para el consumo y modulo/accion para
// agrupar.
// ──────────────────────────────────────────────────────────────────────────
function permiso(modulo: string, accion: string): Permiso {
  return { id: `${modulo}:${accion}`, modulo, accion, descripcion: `${modulo} ${accion}` } as Permiso
}

const CATALOGO: Permiso[] = [
  permiso('inicio', 'ver'),
  permiso('reportes', 'ver'),
  permiso('kpis', 'ver'),
  permiso('dotacion', 'ver'),
  permiso('organigrama', 'ver'),
  permiso('organigrama', 'tab:estructura'),
  permiso('organigrama', 'tab:areas-programaticas'),
  permiso('pou', 'ver'),
  permiso('personas', 'ver'),
  // cargos: 6 permisos — se parten entre Visualización (ver-cargos) y Gestión.
  permiso('cargos', 'ver'),
  permiso('cargos', 'crear'),
  permiso('cargos', 'tab:ver-cargos'),
  permiso('cargos', 'tab:alta-cargo'),
  permiso('cargos', 'tab:baja-cargo'),
  permiso('cargos', 'tab:cobertura-vacantes'),
  permiso('bajas', 'ver'),
  permiso('bajas', 'tab:bajas'),
  permiso('retenciones', 'ver'),
  permiso('concursos-cph', 'ver'),
  permiso('concursos-ceetps', 'ver'),
  permiso('incidencias', 'ver'),
  permiso('incidencias', 'gestionar'),
  permiso('padron', 'ver'),
  permiso('bajas-sial', 'ver'),
  permiso('configuracion', 'ver'),
  // Sistema / transversales.
  permiso('autorizaciones', 'ver'),
  permiso('notificaciones', 'ver'),
  permiso('solicitudes-alta', 'ver'),
]

// Mapa seccion.id -> grupo esperado, a partir de las secciones declaradas.
function grupoDeSeccion(id: string): GrupoPanel | undefined {
  return SECCIONES.find((s) => s.id === id)?.grupo
}

describe('construirGrupos — asignación de grupos', () => {
  const grupos = construirGrupos(CATALOGO)
  const porId = new Map(grupos.map((g) => [g.seccion.id, g]))

  it('coloca cada sección de Visualización en el grupo visualizacion', () => {
    for (const id of ['inicio', 'reportes', 'kpis', 'dotacion', 'organigrama', 'pou', 'personas', 'cargos-ver', 'bajas', 'retenciones']) {
      expect(porId.get(id)?.grupo, id).toBe('visualizacion')
      expect(grupoDeSeccion(id), id).toBe('visualizacion')
    }
  })

  it('coloca cada sección de Gestión en el grupo gestion', () => {
    for (const id of ['cargos-gestion', 'concursos-cph', 'concursos-ceetps', 'incidencias']) {
      expect(porId.get(id)?.grupo, id).toBe('gestion')
    }
  })

  it('coloca Importación y Configuración en el grupo admin', () => {
    expect(porId.get('importacion')?.grupo).toBe('admin')
    expect(porId.get('configuracion')?.grupo).toBe('admin')
  })

  it('coloca la sección Sistema / Transversales en el grupo sistema', () => {
    expect(porId.get('sistema')?.grupo).toBe('sistema')
  })
})

describe('construirGrupos — split de Cargos', () => {
  const grupos = construirGrupos(CATALOGO)
  const verCargos = grupos.find((g) => g.seccion.id === 'cargos-ver')!
  const gestion = grupos.find((g) => g.seccion.id === 'cargos-gestion')!

  it('Cargos (consulta) solo contiene tab:ver-cargos y vive en Visualización', () => {
    expect(verCargos.grupo).toBe('visualizacion')
    const acciones = verCargos.permisosPlanos.map((p) => p.accion)
    expect(acciones).toEqual(['tab:ver-cargos'])
  })

  it('Gestión de Cargos contiene las acciones de gestión y vive en Gestión', () => {
    expect(gestion.grupo).toBe('gestion')
    const acciones = gestion.permisosPlanos.map((p) => p.accion).sort()
    expect(acciones).toEqual(['crear', 'tab:alta-cargo', 'tab:baja-cargo', 'tab:cobertura-vacantes', 'ver'])
  })

  it('las dos secciones de cargos son disjuntas y cubren los 6 permisos sin duplicar', () => {
    const ids = [...verCargos.permisosPlanos, ...gestion.permisosPlanos].map((p) => p.id)
    const unicos = new Set(ids)
    expect(ids).toHaveLength(6)
    expect(unicos.size).toBe(6)
  })
})

describe('construirGrupos — POU asignable (no informativo)', () => {
  const grupos = construirGrupos(CATALOGO)
  const pou = grupos.find((g) => g.seccion.id === 'pou')!

  it('la sección POU ya no es informativa', () => {
    expect(pou.seccion.informativo).toBeFalsy()
  })

  it('la sección POU expone el permiso pou/ver asignable', () => {
    expect(pou.permisosPlanos.map((p) => p.accion)).toContain('ver')
  })
})

describe('construirGrupos — Organigrama muestra su permiso ver', () => {
  const grupos = construirGrupos(CATALOGO)
  const org = grupos.find((g) => g.seccion.id === 'organigrama')!

  it('expone organigrama/ver junto a los tab:*', () => {
    const acciones = org.permisosPlanos.map((p) => p.accion)
    expect(acciones).toContain('ver')
    expect(acciones).toContain('tab:estructura')
    expect(acciones).toContain('tab:areas-programaticas')
  })
})

describe('construirGrupos — catch-all de robustez', () => {
  it('un módulo no referenciado por ninguna sección se renderiza igual', () => {
    const catalogo = [...CATALOGO, permiso('modulo-fantasma', 'ver'), permiso('modulo-fantasma', 'editar')]
    const grupos = construirGrupos(catalogo)
    const fantasma = grupos.find((g) => g.seccion.id === 'modulo-fantasma')
    expect(fantasma).toBeDefined()
    expect(fantasma!.permisosPlanos.map((p) => p.accion).sort()).toEqual(['editar', 'ver'])
  })

  it('una acción de un módulo partido que no entra en ninguna whitelist cae por el catch-all', () => {
    // 'cargos/accion-huerfana' no está en la whitelist de Visualización ni de
    // Gestión -> no se pierde: aparece en un grupo catch-all de cargos.
    const catalogo = [...CATALOGO, permiso('cargos', 'accion-huerfana')]
    const grupos = construirGrupos(catalogo)
    const todosLosIds = grupos.flatMap((g) => g.permisosPlanos.map((p) => p.id))
    expect(todosLosIds).toContain('cargos:accion-huerfana')
    // y no se duplica en ningún otro grupo
    expect(todosLosIds.filter((id) => id === 'cargos:accion-huerfana')).toHaveLength(1)
  })

  it('no hay permisos duplicados entre secciones para el catálogo real', () => {
    const grupos = construirGrupos(CATALOGO)
    const ids = grupos.flatMap((g) => g.permisosPlanos.map((p) => p.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('construirGruposPanel — cabeceras de grupo en orden', () => {
  it('emite los grupos en el orden Visualización, Gestión, Vista Admin, Sistema', () => {
    const panel = construirGruposPanel(CATALOGO)
    expect(panel.map((g) => g.grupo)).toEqual(['visualizacion', 'gestion', 'admin', 'sistema'])
    expect(panel.map((g) => g.label)).toEqual(['Visualización', 'Gestión', 'Vista Admin', 'Sistema / Transversales'])
  })

  it('no emite un grupo que quede sin ninguna sección', () => {
    // Catálogo mínimo: solo inicio/ver -> solo el grupo Visualización.
    const panel = construirGruposPanel([permiso('inicio', 'ver')])
    expect(panel.map((g) => g.grupo)).toEqual(['visualizacion'])
  })
})
