import { describe, it, expect } from 'vitest'
import { resolverSeleccionAlta } from './altaSelector'
import { opcionesCarreraAlta, filtrarPuestosAlta, pideIncluirAmbosAlta } from './carrerasGestionadas'
import { especialidadesPermitidasAlta } from './especialidadesAlta'
import { siguienteSeleccion } from '@/shared/lib/selectorCpe'

describe('selector de Alta', () => {
  it('opcionesCarreraAlta no trae 22 y trae 37 — Nueva Carrera Profesional Hospitalaria', () => {
    const o = opcionesCarreraAlta([{ id: 'cph', codigo: '22', nombre: 'Nueva Carrera Prof. Hosp' }], 'pof')
    expect(o.some((x) => x.label.startsWith('22'))).toBe(false)
    expect(o[0]!.label).toBe('37 — Nueva Carrera Profesional Hospitalaria')
  })
  it('87 filtra puestos y activa incluirAmbos; 85/37/83/23 sin restriccion', () => {
    const ps = [{ nombre: 'Enfermero Profesional' }, { nombre: 'Licenciado en Enfermería' }, { nombre: 'Otro' }]
    expect(filtrarPuestosAlta(ps, '87', 'pof').map((p) => p.nombre)).toEqual(['Enfermero Profesional', 'Licenciado en Enfermería'])
    expect(pideIncluirAmbosAlta('87', 'pof')).toBe(true)
    for (const c of ['85', '37', '83', '23']) {
      expect(filtrarPuestosAlta(ps, c, 'pof')).toHaveLength(3)
      expect(pideIncluirAmbosAlta(c, 'pof')).toBe(false)
    }
  })
  it('enfermeria deja solo ATP/ATC', () => {
    const r = especialidadesPermitidasAlta('Enfermero Profesional', [
      { id: '1', nombre: 'Enfermeros ATP' }, { id: '2', nombre: 'Enfermeros ATC' }, { id: '3', nombre: 'Otra' },
    ] as never)
    expect(r.opciones.map((e: { id: string }) => e.id)).toEqual(['1', '2'])
  })
  it('modo unico resetea dependientes', () => {
    const v = { carrera: ['a'], puesto: ['p'], especialidad: ['e'] }
    expect(siguienteSeleccion(v, 'carrera', ['b'], { resetDependientes: true })).toEqual({ carrera: ['b'], puesto: [], especialidad: [] })
    expect(siguienteSeleccion(v, 'puesto', ['q'], { resetDependientes: true })).toEqual({ carrera: ['a'], puesto: ['q'], especialidad: [] })
  })
  it('resolverSeleccionAlta devuelve el id real con puestos homonimos', () => {
    const ps = [{ id: 'p1', nombre: 'Medico' }, { id: 'p2', nombre: 'Medico' }]
    expect(resolverSeleccionAlta(['p2'], ps)?.id).toBe('p2')
    expect(resolverSeleccionAlta([], ps)).toBeNull()
    expect(resolverSeleccionAlta(['x'], ps)).toBeNull()
  })
})
