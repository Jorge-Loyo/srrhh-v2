import { describe, it, expect } from 'vitest'
import { clasificarGrupoAprobar } from './padron.diff.helpers.js'

// FASE 0 (FEAT-001): tras levantar el bloqueo de aprobación, un snapshot se
// puede aprobar dejando los id_sial nuevos como PENDIENTES (aprobado=null, sin
// decisión). El flujo completo de aprobarSnapshotService abre su propio
// $transaction y no es mockeable como los demás *.test.ts del módulo (que
// testean helpers puros). Por eso la clasificación del paso 4 (que decide qué
// se materializa) se expresa como un helper puro `clasificarGrupoAprobar`, y
// acá se fija la invariante central de la feature: un diff nuevo con
// aprobado=null NO cae en 'nuevos' ni 'rechazados' → no se materializa.
describe('clasificarGrupoAprobar — invariante FASE 0 (pendientes no se materializan)', () => {
  it('nuevo + aprobado=null (PENDIENTE) → null: NO cae en nuevos ni rechazados', () => {
    const r = clasificarGrupoAprobar({ tipo: 'nuevo', campo: 'cuil_y_rol', aprobado: null })
    expect(r).toBeNull()
  })

  it('nuevo desdoblado + aprobado=null (PENDIENTE) → null: tampoco se materializa', () => {
    const r = clasificarGrupoAprobar({ tipo: 'nuevo', campo: '__alta_desdoblada__', aprobado: null })
    expect(r).toBeNull()
  })

  it('nuevo + aprobado=true → nuevos (se materializa el cargo/ocupación)', () => {
    expect(clasificarGrupoAprobar({ tipo: 'nuevo', campo: 'cuil_y_rol', aprobado: true })).toBe(
      'nuevos',
    )
  })

  it('nuevo + aprobado=false → rechazados', () => {
    expect(clasificarGrupoAprobar({ tipo: 'nuevo', campo: 'cuil_y_rol', aprobado: false })).toBe(
      'rechazados',
    )
  })

  it('desdoblado (24/07) se evalúa PRIMERO: aprobado=true → nuevosDesdoblados, no nuevos', () => {
    expect(
      clasificarGrupoAprobar({ tipo: 'nuevo', campo: '__alta_desdoblada__', aprobado: true }),
    ).toBe('nuevosDesdoblados')
  })

  it('desdoblado rechazado → rechazadosDesdoblados, no rechazados', () => {
    expect(
      clasificarGrupoAprobar({ tipo: 'nuevo', campo: '__alta_desdoblada__', aprobado: false }),
    ).toBe('rechazadosDesdoblados')
  })

  it('eliminado → eliminados (independiente de aprobado)', () => {
    expect(clasificarGrupoAprobar({ tipo: 'eliminado', campo: 'x', aprobado: null })).toBe(
      'eliminados',
    )
  })

  it('modificado → modificados (independiente de aprobado)', () => {
    expect(clasificarGrupoAprobar({ tipo: 'modificado', campo: 'especialidad', aprobado: null })).toBe(
      'modificados',
    )
  })
})
