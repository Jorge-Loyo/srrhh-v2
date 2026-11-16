import { describe, it, expect } from 'vitest'
import { itemGestionActivo, bajasActivo, organigramaActivo } from './sidebarActivo'

describe('itemGestionActivo', () => {
  it.each([
    ['/cargos/concurso', 'gestion-cargos'],
    ['/cargos/alta', 'gestion-cargos'],
    ['/cargos/nuevos-cargos', 'gestion-cargos'],
    ['/concursos/cph/12/wizard', 'gestion-cargos'],
    ['/concursos/cph/12', 'gestion-cargos'],
    ['/concursos/cph/nuevo/wizard', 'gestion-cargos'],
    ['/concursos/ceetps/7', 'concursos-ceetps'],
    ['/concursos/ceetps/7/wizard', 'gestion-cargos'],
    ['/concursos/ceetps/7/etapas', 'concursos-ceetps'],
    ['/concursos/cph', 'concursos-cph'],
    ['/concursos/cph/', 'concursos-cph'],
    ['/concursos/ceetps', 'concursos-ceetps'],
    ['/cargos', null],
    ['/incidencias', null],
  ])('%s → %s', (ruta, esperado) => {
    expect(itemGestionActivo(ruta)).toBe(esperado)
  })
})

describe('bajasActivo / organigramaActivo (no se pisan con Importación)', () => {
  it.each([
    ['/bajas', true],
    ['/bajas/vinculacion', true],
    ['/bajas-consolidadas', false],
    ['/bajas-consolidadas/5', false],
  ])('bajas %s → %s', (ruta, esperado) => expect(bajasActivo(ruta)).toBe(esperado))

  it.each([
    ['/organigrama', true],
    ['/organigrama/HGAPP', true],
    ['/organigrama/areas-programaticas', true],
    ['/organigrama/arbol', false],
  ])('organigrama %s → %s', (ruta, esperado) => expect(organigramaActivo(ruta)).toBe(esperado))
})
