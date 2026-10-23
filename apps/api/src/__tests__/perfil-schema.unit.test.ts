import { describe, it, expect } from 'vitest'

// =============================================================================
// Tests PUROS de los schemas de perfil (sin vi.mock). Ancla el mecanismo de
// rechazo de `cuil` al issue REALMENTE emitido por Zod 3.25.76 y valida las
// reglas del cambio de contraseña.
// =============================================================================

import { updatePerfilSchema, changePasswordSchema } from '../modules/perfil/perfil.schema.js'

describe('updatePerfilSchema — CUIL inmutable (barrera de validación)', () => {
  it('rechaza el body que trae `cuil` con issue invalid_type en path:[cuil]', () => {
    const r = updatePerfilSchema.safeParse({ cuil: '20111111113', nombre: 'X' })
    expect(r.success).toBe(false)
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path[0] === 'cuil')
      expect(issue).toBeDefined()
      expect(issue?.code).toBe('invalid_type')
      expect(issue?.message).toBe('El CUIL no puede editarse')
    }
  })

  it('un guardado normal sin cuil pasa', () => {
    const r = updatePerfilSchema.safeParse({ nombre: 'X' })
    expect(r.success).toBe(true)
  })

  it('ruido benigno (id, rol) se stripea sin romper el guardado', () => {
    const r = updatePerfilSchema.safeParse({ id: 'x', rol: 'y', nombre: 'X' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data).not.toHaveProperty('id')
      expect(r.data).not.toHaveProperty('rol')
      expect(r.data.nombre).toBe('X')
    }
  })

  it('normaliza el email a minúsculas', () => {
    const r = updatePerfilSchema.safeParse({ email: 'A@X.GOB.AR' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.email).toBe('a@x.gob.ar')
  })
})

describe('changePasswordSchema — reglas de cambio de contraseña', () => {
  it('nueva !== confirmación → falla en path:[passwordConfirmacion]', () => {
    const r = changePasswordSchema.safeParse({
      passwordActual: 'vieja123',
      passwordNueva: 'nuevaSegura1',
      passwordConfirmacion: 'otraDistinta1',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path[0] === 'passwordConfirmacion')
      expect(issue).toBeDefined()
      expect(issue?.message).toBe('La confirmación no coincide')
    }
  })

  it('nueva con menos de 8 caracteres → falla', () => {
    const r = changePasswordSchema.safeParse({
      passwordActual: 'vieja123',
      passwordNueva: 'corta',
      passwordConfirmacion: 'corta',
    })
    expect(r.success).toBe(false)
  })

  it('caso válido (actual + nueva>=8 + confirmación coincide) → pasa', () => {
    const r = changePasswordSchema.safeParse({
      passwordActual: 'vieja123',
      passwordNueva: 'nuevaSegura1',
      passwordConfirmacion: 'nuevaSegura1',
    })
    expect(r.success).toBe(true)
  })
})
