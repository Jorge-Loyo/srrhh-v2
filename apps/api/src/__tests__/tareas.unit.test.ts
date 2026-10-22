import { describe, it, expect } from 'vitest'

// =============================================================================
// Tests de lógica PURA del módulo de tareas pendientes. Se importan las
// funciones REALES del service (no se replican) y se ejercitan sin Prisma ni
// vi.mock, igual que autorizaciones.unit.test.ts. Cubren la resolución de roles
// descendientes en la jerarquía, el núcleo de visibilidad y el builder del
// mensaje de la tarea de rechazo.
// =============================================================================

import {
  descendientesDeJerarquia,
  esVisibleParaNucleo,
  mensajeTareaRechazo,
} from '../modules/tareas/tareas.service.js'

describe('descendientesDeJerarquia — recorrido BFS de la jerarquía de roles', () => {
  it('árbol simple: padre → hijos → nietos devuelve toda la descendencia sin la raíz', () => {
    const filas = [
      { rolHijoSlug: 'hijo_a', rolPadreSlug: 'raiz' },
      { rolHijoSlug: 'hijo_b', rolPadreSlug: 'raiz' },
      { rolHijoSlug: 'nieto_a1', rolPadreSlug: 'hijo_a' },
      { rolHijoSlug: 'nieto_b1', rolPadreSlug: 'hijo_b' },
    ]
    const r = descendientesDeJerarquia(filas, 'raiz')
    expect(r.sort()).toEqual(['hijo_a', 'hijo_b', 'nieto_a1', 'nieto_b1'])
    expect(r).not.toContain('raiz')
  })

  it('diamante: un nodo alcanzable por dos caminos se devuelve una sola vez', () => {
    const filas = [
      { rolHijoSlug: 'izq', rolPadreSlug: 'raiz' },
      { rolHijoSlug: 'der', rolPadreSlug: 'raiz' },
      { rolHijoSlug: 'fondo', rolPadreSlug: 'izq' },
      { rolHijoSlug: 'fondo', rolPadreSlug: 'der' },
    ]
    const r = descendientesDeJerarquia(filas, 'raiz')
    expect(r.sort()).toEqual(['der', 'fondo', 'izq'])
    expect(r.filter((s) => s === 'fondo')).toHaveLength(1)
  })

  it('ciclo: no se cuelga, corta por el visited-set', () => {
    const filas = [
      { rolHijoSlug: 'b', rolPadreSlug: 'a' },
      { rolHijoSlug: 'c', rolPadreSlug: 'b' },
      { rolHijoSlug: 'a', rolPadreSlug: 'c' }, // cierra el ciclo a → b → c → a
    ]
    const r = descendientesDeJerarquia(filas, 'a')
    // la raíz nunca se incluye aunque el ciclo apunte de vuelta a ella.
    expect(r.sort()).toEqual(['b', 'c'])
    expect(r).not.toContain('a')
    // cada nodo una sola vez (no hay repetidos por el ciclo)
    expect(new Set(r).size).toBe(r.length)
  })

  it('raíz sin hijos: devuelve []', () => {
    const filas = [{ rolHijoSlug: 'hijo', rolPadreSlug: 'otra_raiz' }]
    expect(descendientesDeJerarquia(filas, 'raiz')).toEqual([])
  })
})

describe('esVisibleParaNucleo — núcleo puro de visibilidad jerárquica', () => {
  it('destinatario directo (es el propio usuario) → true', () => {
    expect(esVisibleParaNucleo('u1', [], 'u1', ['rol_dest'])).toBe(true)
  })

  it('rol del destinatario cae en los descendientes → true', () => {
    expect(esVisibleParaNucleo('u2', ['rol_hijo', 'rol_nieto'], 'u1', ['rol_hijo'])).toBe(true)
  })

  it('ajeno (ni el propio usuario ni rol descendiente) → false', () => {
    expect(esVisibleParaNucleo('u2', ['rol_hijo'], 'u1', ['rol_externo'])).toBe(false)
  })
})

describe('mensajeTareaRechazo — builder del mensaje de la tarea de rechazo', () => {
  it('con observaciones incluye el motivo', () => {
    const r = mensajeTareaRechazo('falta el expediente')
    expect(r).toContain('Motivo: falta el expediente')
  })

  it('sin observaciones usa el texto por defecto', () => {
    expect(mensajeTareaRechazo()).toBe('Autorizacion rechazada. Corregi y reenvia.')
    expect(mensajeTareaRechazo(null)).toBe('Autorizacion rechazada. Corregi y reenvia.')
    expect(mensajeTareaRechazo('')).toBe('Autorizacion rechazada. Corregi y reenvia.')
  })
})
