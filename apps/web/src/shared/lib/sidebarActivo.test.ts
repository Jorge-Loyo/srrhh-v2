import { describe, it, expect } from 'vitest'
import { itemGestionActivo } from './sidebarActivo'

describe('itemGestionActivo', () => {
  it.each([
    ['/cargos/concurso', 'gestion-cargos'],
    ['/cargos/alta', 'gestion-cargos'],
    ['/cargos/nuevos-cargos', 'gestion-cargos'],
    ['/concursos/cph/12/wizard', 'gestion-cargos'],
    ['/concursos/cph/12', 'gestion-cargos'],
    ['/concursos/cph/nuevo/wizard', 'gestion-cargos'],
    ['/concursos/ceetps/7', 'gestion-cargos'],
    ['/concursos/cph', 'concursos-cph'],
    ['/concursos/cph/', 'concursos-cph'],
    ['/concursos/ceetps', 'concursos-ceetps'],
    ['/cargos', null],
    ['/incidencias', null],
  ])('%s → %s', (ruta, esperado) => {
    expect(itemGestionActivo(ruta)).toBe(esperado)
  })
})
