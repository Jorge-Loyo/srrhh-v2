import { describe, it, expect } from 'vitest'

// =============================================================================
// Test de la función PURA de precedencia del resolutor del identificador de
// login. Cubre la garantía dura de la Prioridad #1 (no romper el login por
// username): si existe un usuario con ese username, SIEMPRE gana aunque exista
// otro que matchea por cuil/email. Patrón del repo: lógica pura sin vi.mock.
// =============================================================================

import { resolverUsuarioLogin } from '../modules/auth/auth.service.js'

describe('resolverUsuarioLogin — precedencia de username', () => {
  // resolverUsuarioLogin es genérica: ambos argumentos deben ser del mismo
  // tipo T (en runtime son dos filas Usuario de Prisma). Los fixtures usan una
  // forma común { id, identificador } — el test solo lee `.id` y la identidad
  // del objeto (toBe), así que la forma concreta de las columnas no importa;
  // lo que importa es que compartan tipo para que la inferencia de T no falle.
  const porUsername = { id: 'A', identificador: '99000000001' }
  const porCuilOEmail = { id: 'B', identificador: '99000000001' }

  it('(a) si hay match por username, gana ese usuario aunque exista otro por cuil/email', () => {
    const r = resolverUsuarioLogin(porUsername, porCuilOEmail)
    expect(r).toBe(porUsername)
    expect(r?.id).toBe('A')
  })

  it('(b) si no hay match por username, resuelve por cuil/email', () => {
    const r = resolverUsuarioLogin(null, porCuilOEmail)
    expect(r).toBe(porCuilOEmail)
    expect(r?.id).toBe('B')
  })

  it('(c) si no hay ninguno, no resuelve (null)', () => {
    const r = resolverUsuarioLogin(null, null)
    expect(r).toBeNull()
  })
})
