import { describe, expect, it } from 'vitest'
import { NOMBRE_ESCALAFON_CPH_NUEVO as NOMBRE_TYPES } from '@srrhh/types'
import { NOMBRE_ESCALAFON_CPH_NUEVO, ejecutarEscalafonCph, planificarEscalafonCph, type EscalafonFila, type RepoEscalafon } from './escalafon.js'

const VIEJO: EscalafonFila = { id: 'e1', codigo: '22', nombre: 'Nueva Carrera Prof. Hosp' }
const NUEVO: EscalafonFila = { id: 'e1', codigo: '37', nombre: 'Nueva Carrera Profesional Hospitalaria' }

function repo(filas: EscalafonFila[]) {
  const escrituras: [string, string, string][] = []
  const r: RepoEscalafon = {
    escalafonesCph: async () => filas,
    actualizarEscalafon: async (id, codigo, nombre) => void escrituras.push([id, codigo, nombre]),
  }
  return { r, escrituras }
}

describe('constantes', () => {
  it('el nombre nuevo coincide con el de @srrhh/types (el script no lo importa para no depender de la imagen del contenedor)', () => {
    expect(NOMBRE_ESCALAFON_CPH_NUEVO).toBe(NOMBRE_TYPES)
  })
})

describe('planificarEscalafonCph', () => {
  it('base actual (22, nombre viejo): actualiza codigo y nombre', () => {
    expect(planificarEscalafonCph([VIEJO])).toEqual({
      accion: 'actualizar', escalafonId: 'e1', codigoActual: '22', nombreActual: 'Nueva Carrera Prof. Hosp',
      codigoNuevo: '37', nombreNuevo: 'Nueva Carrera Profesional Hospitalaria',
    })
  })
  it('base nueva (37, nombre nuevo): ya aplicado', () => {
    expect(planificarEscalafonCph([NUEVO])).toEqual({ accion: 'ya_aplicado', escalafonId: 'e1' })
  })
  it('37 con el nombre viejo: solo corrige el nombre', () => {
    const p = planificarEscalafonCph([{ ...NUEVO, nombre: 'Nueva Carrera Prof. Hosp' }])
    expect(p).toMatchObject({ accion: 'actualizar', codigoActual: '37', codigoNuevo: '37' })
  })
  it('aborta si existen el 22 y el 37 a la vez o si no hay ninguno', () => {
    expect(() => planificarEscalafonCph([VIEJO, { ...NUEVO, id: 'e2' }])).toThrow(/ambiguo/)
    expect(() => planificarEscalafonCph([])).toThrow(/No existe el escalafon CPH/)
  })
})

describe('ejecutarEscalafonCph', () => {
  it('escribe una sola vez el UPDATE de codigo y nombre', async () => {
    const { r, escrituras } = repo([VIEJO])
    const res = await ejecutarEscalafonCph(r)
    expect(res).toEqual({ accion: 'actualizar', codigoAntes: '22', codigoDespues: '37' })
    expect(escrituras).toEqual([['e1', '37', 'Nueva Carrera Profesional Hospitalaria']])
  })
  it('es idempotente: con el escalafon ya migrado no escribe', async () => {
    const { r, escrituras } = repo([NUEVO])
    expect((await ejecutarEscalafonCph(r)).accion).toBe('ya_aplicado')
    expect(escrituras).toEqual([])
  })
})
