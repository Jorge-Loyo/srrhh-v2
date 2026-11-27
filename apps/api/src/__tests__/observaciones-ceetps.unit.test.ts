import { describe, expect, it } from 'vitest'
import { quitarTrazasEtl } from '../modules/concursos-ceetps/observaciones.js'

describe('quitarTrazasEtl', () => {
  it('quita la línea [ETL] y conserva lo escrito por una persona', () => {
    expect(quitarTrazasEtl('Reclamó 24/08\n[ETL] ee_baja=EX-1 | _warnings=x')).toBe('Reclamó 24/08')
  })
  it('solo trazas → null', () => {
    expect(quitarTrazasEtl('[ETL] _warnings=puesto sin match')).toBeNull()
  })
  it('sin trazas queda igual; null y vacío → null', () => {
    expect(quitarTrazasEtl('NO TOMA CARGO')).toBe('NO TOMA CARGO')
    expect(quitarTrazasEtl(null)).toBeNull()
    expect(quitarTrazasEtl('  ')).toBeNull()
  })
})
