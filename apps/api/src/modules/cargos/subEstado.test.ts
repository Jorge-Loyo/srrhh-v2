import { calcularSubEstado, type SubEstadoFacts } from './subEstado.js'

const facts = (over: Partial<SubEstadoFacts> = {}): SubEstadoFacts => ({
  estado: 'vigente',
  tieneOcupanteVigente: false,
  tieneConcursoActivo: false,
  ...over,
})

describe('calcularSubEstado', () => {
  it('no_vigente -> null (sin importar ocupante/concurso)', () => {
    expect(calcularSubEstado(facts({ estado: 'no_vigente' }))).toBeNull()
    expect(
      calcularSubEstado(facts({ estado: 'no_vigente', tieneOcupanteVigente: true, tieneConcursoActivo: true })),
    ).toBeNull()
  })

  it('validacion_vacante -> null', () => {
    expect(calcularSubEstado(facts({ estado: 'validacion_vacante' }))).toBeNull()
    expect(
      calcularSubEstado(facts({ estado: 'validacion_vacante', tieneConcursoActivo: true })),
    ).toBeNull()
  })

  it('cualquier estado desconocido -> null', () => {
    expect(calcularSubEstado(facts({ estado: 'otro_estado' }))).toBeNull()
  })

  it('vigente + ocupante vigente -> ocupado (aunque tenga concurso activo)', () => {
    expect(calcularSubEstado(facts({ tieneOcupanteVigente: true }))).toBe('ocupado')
    expect(
      calcularSubEstado(facts({ tieneOcupanteVigente: true, tieneConcursoActivo: true })),
    ).toBe('ocupado')
  })

  it('vigente sin ocupante con concurso activo -> concurso', () => {
    expect(calcularSubEstado(facts({ tieneConcursoActivo: true }))).toBe('concurso')
  })

  it('vigente sin ocupante sin concurso activo -> vacante', () => {
    expect(calcularSubEstado(facts())).toBe('vacante')
  })
})
