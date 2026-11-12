import { describe, expect, it } from 'vitest'
import {
  alternarValor,
  filtrarOpciones,
  quitarVisibles,
  seleccionarTodosVisibles,
  siguienteSeleccion,
  titleCase,
} from './selectorCpe'

const ops = [
  { value: 'a', label: 'Alfa' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Alfajor' },
]
const sel = { carrera: ['1'], puesto: ['p'], especialidad: ['e'] }

describe('selectorCpe', () => {
  it('titleCase', () => expect(titleCase('MEDICO CLINICO (04)')).toBe('Medico Clinico (04)'))
  it('filtrarOpciones', () => {
    expect(filtrarOpciones(ops, '  ALFA ').map((o) => o.value)).toEqual(['a', 'c'])
    expect(filtrarOpciones(ops, '')).toBe(ops)
  })
  it('alternarValor', () => {
    expect(alternarValor(['a'], 'b')).toEqual(['a', 'b'])
    expect(alternarValor(['a', 'b'], 'a')).toEqual(['b'])
  })
  it('todos/ninguno sobre filtradas conservando selección previa', () => {
    const f = filtrarOpciones(ops, 'alfa')
    expect(seleccionarTodosVisibles(['b'], f)).toEqual(['b', 'a', 'c'])
    expect(quitarVisibles(['a', 'b', 'c'], f)).toEqual(['b'])
  })
  it('siguienteSeleccion con y sin reset', () => {
    expect(siguienteSeleccion(sel, 'carrera', ['2'], { resetDependientes: false })).toEqual({
      carrera: ['2'], puesto: ['p'], especialidad: ['e'],
    })
    expect(siguienteSeleccion(sel, 'carrera', ['2'], { resetDependientes: true })).toEqual({
      carrera: ['2'], puesto: [], especialidad: [],
    })
    expect(siguienteSeleccion(sel, 'puesto', ['q'], { resetDependientes: true })).toEqual({
      carrera: ['1'], puesto: ['q'], especialidad: [],
    })
    expect(siguienteSeleccion(sel, 'especialidad', [], { resetDependientes: true }).puesto).toEqual(['p'])
  })
})
