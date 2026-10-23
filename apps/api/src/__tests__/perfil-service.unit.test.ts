import { describe, it, expect } from 'vitest'
import bcrypt from 'bcrypt'

// =============================================================================
// Tests PUROS del service de perfil (sin vi.mock): la barrera DURA del CUIL
// (independiente del schema) y la verificación de la contraseña actual.
// =============================================================================

import { buildUpdatePerfilData, verificarPasswordActual } from '../modules/perfil/perfil.service.js'

describe('buildUpdatePerfilData — barrera dura del CUIL inmutable', () => {
  it('nunca mapea `cuil` al data del update, aunque venga en la entrada', () => {
    const data = buildUpdatePerfilData({ nombre: 'X', cuil: '20111111113' } as never)
    expect(data).not.toHaveProperty('cuil')
    expect(data).toEqual({ nombre: 'X' })
  })

  it('solo toma los campos editables (nombre/apellido/email/username)', () => {
    const data = buildUpdatePerfilData({
      nombre: 'N',
      apellido: 'A',
      email: 'e@x.gob.ar',
      username: 'user1',
    })
    expect(data).toEqual({ nombre: 'N', apellido: 'A', email: 'e@x.gob.ar', username: 'user1' })
  })

  it('PATCH vacío produce un data vacío', () => {
    const data = buildUpdatePerfilData({})
    expect(Object.keys(data)).toHaveLength(0)
  })
})

describe('verificarPasswordActual — verificación contra el hash', () => {
  const hash = bcrypt.hashSync('laClaveCorrecta', 12)

  it('acepta la contraseña correcta', async () => {
    expect(await verificarPasswordActual('laClaveCorrecta', hash)).toBe(true)
  })

  it('rechaza una contraseña que no corresponde al hash', async () => {
    expect(await verificarPasswordActual('otraClave', hash)).toBe(false)
  })
})
