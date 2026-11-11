import { describe, expect, it } from 'vitest'
import { esPuestoEnfermeria, especialidadesPermitidasAlta } from './especialidadesAlta'

const esp = (nombre: string) => ({ id: nombre, nombre })

describe('esPuestoEnfermeria', () => {
  it.each(['Enfermeria', 'enfermeria atp', 'Enfermero profesional', 'licenciado en enfermeria', 'enfermero/a'])(
    'detecta %s', (n) => expect(esPuestoEnfermeria(n)).toBe(true))
  it.each(['auxiliar de enfermeria', 'cuidador enfermero de animales', 'medico', '', null])(
    'no detecta %s', (n) => expect(esPuestoEnfermeria(n)).toBe(false))
})

describe('especialidadesPermitidasAlta', () => {
  const lista = [esp('enfermeros atp'), esp('Enfermeros ATC'), esp('enfermeria'), esp('otra')]
  it('en enfermería deja solo ATP y ATC', () => {
    expect(especialidadesPermitidasAlta('Enfermeria', lista).map((e) => e.id)).toEqual(['enfermeros atp', 'Enfermeros ATC'])
  })
  it('en enfermería sin ATP/ATC en catálogo devuelve vacío', () => {
    expect(especialidadesPermitidasAlta('Enfermeria', [esp('otra')])).toEqual([])
  })
  it('otros puestos no cambian', () => {
    expect(especialidadesPermitidasAlta('medico', lista)).toBe(lista)
  })
})
