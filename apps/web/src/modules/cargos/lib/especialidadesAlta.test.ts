import { describe, expect, it } from 'vitest'
import { esPuestoEnfermeria, especialidadesPermitidasAlta } from './especialidadesAlta'

const esp = (nombre: string) => ({ id: nombre, nombre })

describe('esPuestoEnfermeria', () => {
  it.each([
    'Enfermeria', 'enfermeria atp', 'Enfermero profesional', 'licenciado en enfermeria',
    'Licenciada en Enfermería', 'lic. en enfermeria', 'enfermero/a', 'Enfermero de Planta', 'Enfermero Jefe',
  ])('detecta %s', (n) => expect(esPuestoEnfermeria(n)).toBe(true))
  it.each(['auxiliar de enfermeria', 'cuidador enfermero de animales', 'medico', 'licenciado en kinesiologia', '', null])(
    'no detecta %s', (n) => expect(esPuestoEnfermeria(n)).toBe(false))
})

describe('especialidadesPermitidasAlta', () => {
  const conAtpAtc = [esp('Enfermeros ATP'), esp('Enfermeros ATC'), esp('enfermeria'), esp('otra')]

  it.each(['Enfermero/a', 'Licenciado en enfermería'])(
    '%s con ATP/ATC en catálogo: solo esas dos y obligatoria', (puesto) => {
      const r = especialidadesPermitidasAlta(puesto, conAtpAtc)
      expect(r.opciones.map((e) => e.id)).toEqual(['Enfermeros ATP', 'Enfermeros ATC'])
      expect(r).toMatchObject({ esEnfermeria: true, faltanAtpAtc: false, obligatoria: true })
    })

  it('tolera acentos, mayúsculas, singular y orden', () => {
    const r = especialidadesPermitidasAlta('Enfermeria', [esp('enfermero atc'), esp('ATP Enfermeros'), esp('ENFERMERÍA ATC'), esp('x')])
    expect(r.opciones).toHaveLength(3)
  })

  it('enfermería sin ATP/ATC cargadas: sin opciones, aviso y alta permitida', () => {
    const r = especialidadesPermitidasAlta('Enfermero/a', [esp('enfermeria'), esp('otra')])
    expect(r).toEqual({ opciones: [], esEnfermeria: true, faltanAtpAtc: true, obligatoria: false })
  })

  it('no enfermería: sin cambios', () => {
    const r = especialidadesPermitidasAlta('medico', conAtpAtc)
    expect(r.opciones).toBe(conAtpAtc)
    expect(r).toMatchObject({ esEnfermeria: false, faltanAtpAtc: false, obligatoria: true })
    expect(especialidadesPermitidasAlta('medico', []).obligatoria).toBe(false)
  })
})
