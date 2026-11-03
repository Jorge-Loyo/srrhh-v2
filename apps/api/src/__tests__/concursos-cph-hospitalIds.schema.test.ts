import { describe, it, expect } from 'vitest'
import { concursosCphQuerySchema } from '../modules/concursos-cph/concursos-cph.schema.js'

// Multi-sigla (efector): `hospitalIds` es un CSV de uuids que el schema
// transforma a array (mismo patrón que `etiquetaIds`), con validación uuid
// por elemento. Tests puros del parseo + convivencia con `hospitalId` single.

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

describe('concursosCphQuerySchema — hospitalIds (multi-sigla)', () => {
  it('(a) transforma el CSV en array de uuids', () => {
    const parsed = concursosCphQuerySchema.parse({ hospitalIds: `${UUID_A},${UUID_B}` })
    expect(parsed.hospitalIds).toEqual([UUID_A, UUID_B])
  })

  it('(b) falla si algún elemento del CSV no es uuid', () => {
    const res = concursosCphQuerySchema.safeParse({ hospitalIds: `${UUID_A},no-es-uuid` })
    expect(res.success).toBe(false)
  })

  it('(c) sin hospitalIds pero con hospitalId single → conserva el single', () => {
    const parsed = concursosCphQuerySchema.parse({ hospitalId: UUID_A })
    expect(parsed.hospitalId).toBe(UUID_A)
    expect(parsed.hospitalIds).toBeUndefined()
  })

  it('(d) filtra los elementos vacíos del CSV', () => {
    const parsed = concursosCphQuerySchema.parse({ hospitalIds: `${UUID_A},,` })
    expect(parsed.hospitalIds).toEqual([UUID_A])
  })
})
