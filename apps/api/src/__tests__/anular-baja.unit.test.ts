import { describe, it, expect, vi, beforeEach } from 'vitest'

// =============================================================================
// Tests de anularBajaService: anular un BORRADOR (resolucion_a_la_firma) lleva
// la baja a 'anulada' SIN tocar el cargo ni crear concurso. Anular una baja en
// otro estado (ej. 'confirmada') lanza conflict.
//
// Se mockea el cliente Prisma: no se toca la base de datos.
// =============================================================================

const baja = {
  findUnique: vi.fn(),
  update: vi.fn(),
}
const cargo = { update: vi.fn() }
const concurso = { create: vi.fn() }

// tx expuesto en $transaction para verificar qué tablas se tocan
const tx = { baja, cargo, concurso }

vi.mock('../shared/prisma.js', () => ({
  prisma: {
    baja,
    cargo,
    concurso,
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}))

// Import después del mock
const { anularBajaService } = await import('../modules/bajas/bajas.service.js')
const { AppError } = await import('../shared/errors/AppError.js')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('anularBajaService', () => {
  it('anula una baja en resolucion_a_la_firma → queda anulada, no toca cargo ni crea concurso', async () => {
    baja.findUnique.mockResolvedValue({ id: 'b1', estado: 'resolucion_a_la_firma', cargoId: 'c1' })
    baja.update.mockResolvedValue({ id: 'b1', estado: 'anulada', cargoId: 'c1' })

    const res = await anularBajaService('b1', 'u1')

    expect(res.estado).toBe('anulada')
    // La única escritura es baja.update con estado 'anulada'
    expect(baja.update).toHaveBeenCalledTimes(1)
    expect(baja.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'b1' }, data: { estado: 'anulada' } })
    )
    // NO toca el cargo ni crea concurso
    expect(cargo.update).not.toHaveBeenCalled()
    expect(concurso.create).not.toHaveBeenCalled()
  })

  it('lanza conflict al anular una baja confirmada', async () => {
    baja.findUnique.mockResolvedValue({ id: 'b2', estado: 'confirmada', cargoId: 'c2' })

    await expect(anularBajaService('b2', 'u1')).rejects.toBeInstanceOf(AppError)
    await expect(anularBajaService('b2', 'u1')).rejects.toMatchObject({ statusCode: 409 })

    // No escribe nada
    expect(baja.update).not.toHaveBeenCalled()
    expect(cargo.update).not.toHaveBeenCalled()
    expect(concurso.create).not.toHaveBeenCalled()
  })

  it('lanza notFound cuando la baja no existe', async () => {
    baja.findUnique.mockResolvedValue(null)

    await expect(anularBajaService('nope', 'u1')).rejects.toMatchObject({ statusCode: 404 })
    expect(baja.update).not.toHaveBeenCalled()
  })
})
