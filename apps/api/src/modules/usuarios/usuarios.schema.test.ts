import { describe, it, expect } from 'vitest'
import { createUsuarioSchema, updateUsuarioSchema } from './usuarios.schema.js'

// Lógica PURA de los schemas Zod de usuarios (sin BD): CUIL obligatorio de 11
// dígitos en el alta, update parcial que valida CUIL y rechaza body vacío.

const validCreate = {
  username: 'nuevo.user',
  email: 'nuevo@gcba.gob.ar',
  nombre: 'Nombre',
  apellido: 'Apellido',
  cuil: '20345678901',
  password: 'secret123',
  roleId: '11111111-1111-1111-1111-111111111111',
}

describe('createUsuarioSchema — CUIL obligatorio de 11 dígitos', () => {
  it('rechaza el alta sin cuil', () => {
    const { cuil, ...sinCuil } = validCreate
    expect(createUsuarioSchema.safeParse(sinCuil).success).toBe(false)
  })

  it('rechaza CUILs malformados', () => {
    for (const cuil of ['123', '1234567890', '123456789012', '2034A567890']) {
      expect(createUsuarioSchema.safeParse({ ...validCreate, cuil }).success).toBe(false)
    }
  })

  it('acepta un alta completa válida y expone nombre/apellido parseados', () => {
    const parsed = createUsuarioSchema.parse(validCreate)
    expect(parsed.cuil).toBe('20345678901')
    expect(parsed.nombre).toBe('Nombre')
    expect(parsed.apellido).toBe('Apellido')
  })
})

describe('updateUsuarioSchema — parcial', () => {
  it('acepta un cambio parcial de cuil', () => {
    expect(updateUsuarioSchema.parse({ cuil: '20345678901' }).cuil).toBe('20345678901')
  })

  it('rechaza un cuil malformado', () => {
    expect(updateUsuarioSchema.safeParse({ cuil: '2034A567890' }).success).toBe(false)
  })

  it('rechaza un body vacío (no hay cambios para guardar)', () => {
    expect(updateUsuarioSchema.safeParse({}).success).toBe(false)
  })

  it('acepta hospitalId null (desvincular hospital)', () => {
    expect(updateUsuarioSchema.parse({ hospitalId: null }).hospitalId).toBeNull()
  })
})
