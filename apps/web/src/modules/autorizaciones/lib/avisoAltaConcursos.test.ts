import { describe, it, expect } from 'vitest'
import { mensajeAvisoAlta } from './avisoAltaConcursos'

describe('mensajeAvisoAlta', () => {
  it('1 concurso creado (singular)', () => {
    expect(mensajeAvisoAlta({ concursosCreados: 1, concursosSinTipo: 0 })).toBe('Se creó 1 concurso pendiente de caratular.')
  })
  it('varios concursos creados (plural)', () => {
    expect(mensajeAvisoAlta({ concursosCreados: 3 })).toBe('Se crearon 3 concursos pendientes de caratular.')
  })
  it('cargos sin tipo: se informa que quedaron sin concurso', () => {
    expect(mensajeAvisoAlta({ concursosCreados: 0, concursosSinTipo: 2 })).toBe(
      '2 cargos no tienen tipo de concurso definido y quedaron sin concurso.',
    )
    expect(mensajeAvisoAlta({ concursosCreados: 2, concursosSinTipo: 1 })).toContain('1 cargo no tiene tipo de concurso definido')
  })
  it('otros tipos de autorización (sin esos campos) => sin aviso', () => {
    expect(mensajeAvisoAlta({ id: 'x', estado: 'aprobada' })).toBeNull()
    expect(mensajeAvisoAlta(undefined)).toBeNull()
  })
})
