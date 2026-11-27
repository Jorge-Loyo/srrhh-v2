import { describe, expect, it } from 'vitest'
import { asignarDesignadoCeetpsSchema } from '../modules/concursos-ceetps/concursos-ceetps.schema.js'

describe('asignarDesignadoCeetpsSchema', () => {
  it('acepta una referencia y normaliza el CUIL a dígitos', () => {
    const r = asignarDesignadoCeetpsSchema.parse({ refCuil: '20-40677526-8', refNombre: ' Marquez, Christian ' })
    expect(r).toEqual({ refCuil: '20406775268', refNombre: 'Marquez, Christian' })
  })
  it('acepta una persona existente', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    expect(asignarDesignadoCeetpsSchema.parse({ personaId: id })).toEqual({ personaId: id })
  })
  it('rechaza CUIL de largo incorrecto o sin nombre', () => {
    expect(() => asignarDesignadoCeetpsSchema.parse({ refCuil: '123', refNombre: 'X' })).toThrow()
    expect(() => asignarDesignadoCeetpsSchema.parse({ refCuil: '20406775268', refNombre: ' ' })).toThrow()
  })
})
