import { describe, it, expect, vi } from 'vitest'
import { normalizarCrCphDeCargo, normalizarCrCphId, type CargoCrCphDb } from '../shared/crCph.js'
// CRs de prueba: 22 y 37 del mismo escalafón CPH; 87 de otra carrera.
const CRS = [
  { id: 'cr-22', codigo: '22', escalafonId: 'esc-cph' },
  { id: 'cr-37', codigo: '37', escalafonId: 'esc-cph' },
  { id: 'cr-87', codigo: '87', escalafonId: 'esc-enf' },
]
function mockDb(cargoCrId: string | null) {
  const update = vi.fn().mockResolvedValue({})
  const db: CargoCrCphDb = {
    codigoRegistro: {
      findUnique: async ({ where }) => CRS.find((c) => c.id === where.id) ?? null,
      findFirst: async ({ where }) =>
        CRS.find((c) => c.codigo === where.codigo && c.escalafonId === where.escalafonId) ?? null,
    },
    cargo: {
      findUnique: async () => ({ codigoRegistroId: cargoCrId }),
      update,
    },
  }
  return { db, update }
}
describe('normalizarCrCphId', () => {
  it('CR 22 → id del CR 37 del mismo escalafón', async () => {
    expect(await normalizarCrCphId(mockDb(null).db, 'cr-22')).toBe('cr-37')
  })
  it('CR 37 sin cambios', async () => {
    expect(await normalizarCrCphId(mockDb(null).db, 'cr-37')).toBe('cr-37')
  })
  it('otra carrera sin cambios', async () => {
    expect(await normalizarCrCphId(mockDb(null).db, 'cr-87')).toBe('cr-87')
  })
  it('null/undefined pasan tal cual', async () => {
    expect(await normalizarCrCphId(mockDb(null).db, null)).toBeNull()
    expect(await normalizarCrCphId(mockDb(null).db, undefined)).toBeUndefined()
  })
})
describe('normalizarCrCphDeCargo', () => {
  it('cargo CPH con CR 22 termina en 37', async () => {
    const { db, update } = mockDb('cr-22')
    expect(await normalizarCrCphDeCargo(db, 'cargo-1')).toBe(true)
    expect(update).toHaveBeenCalledWith({ where: { id: 'cargo-1' }, data: { codigoRegistroId: 'cr-37' } })
  })
  it('cargo de otra carrera no se toca', async () => {
    const { db, update } = mockDb('cr-87')
    expect(await normalizarCrCphDeCargo(db, 'cargo-1')).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })
  it('cargo CPH ya en 37 sin cambios', async () => {
    const { db, update } = mockDb('cr-37')
    expect(await normalizarCrCphDeCargo(db, 'cargo-1')).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })
  it('cargo sin CR sin cambios', async () => {
    const { db, update } = mockDb(null)
    expect(await normalizarCrCphDeCargo(db, 'cargo-1')).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })
})
