import { describe, it, expect, vi, beforeEach } from 'vitest'

// esTransferencia llega como string desde la URL: 'false' no debe coercionar a
// true (bug z.coerce.boolean) y el listado debe filtrar con el valor correcto.
const solicitudAlta = { count: vi.fn(), findMany: vi.fn() }
vi.mock('../shared/prisma.js', () => ({ prisma: { solicitudAlta } }))

const { solicitudesAltaQuerySchema } = await import('../modules/solicitudes-alta/solicitudes-alta.schema.js')
const { listSolicitudesAltaService } = await import('../modules/solicitudes-alta/solicitudes-alta.service.js')

describe('solicitudesAltaQuerySchema.esTransferencia', () => {
  it("'false' → false", () => {
    expect(solicitudesAltaQuerySchema.parse({ esTransferencia: 'false' }).esTransferencia).toBe(false)
  })
  it("'true' → true", () => {
    expect(solicitudesAltaQuerySchema.parse({ esTransferencia: 'true' }).esTransferencia).toBe(true)
  })
  it('ausente → undefined', () => {
    expect(solicitudesAltaQuerySchema.parse({}).esTransferencia).toBeUndefined()
  })
  it('boolean real se acepta', () => {
    expect(solicitudesAltaQuerySchema.parse({ esTransferencia: false }).esTransferencia).toBe(false)
  })
  it('valor inválido se rechaza', () => {
    expect(() => solicitudesAltaQuerySchema.parse({ esTransferencia: 'abc' })).toThrow()
  })
})

describe('listSolicitudesAltaService con esTransferencia=false', () => {
  beforeEach(() => {
    solicitudAlta.count.mockReset().mockResolvedValue(1)
    solicitudAlta.findMany.mockReset().mockResolvedValue([{ id: 's1', estado: 'pendiente', esTransferencia: false }])
  })

  it('filtra esTransferencia=false (excluye transferencias) e incluye pendientes', async () => {
    const query = solicitudesAltaQuerySchema.parse({ esTransferencia: 'false', limit: '100' })
    const res = await listSolicitudesAltaService(query)
    expect(solicitudAlta.findMany.mock.calls[0][0].where).toEqual({ esTransferencia: false })
    expect(solicitudAlta.findMany.mock.calls[0][0].take).toBe(100)
    expect(res.data[0].estado).toBe('pendiente')
  })

  it('sin parámetro no filtra por esTransferencia', async () => {
    await listSolicitudesAltaService(solicitudesAltaQuerySchema.parse({}))
    expect(solicitudAlta.findMany.mock.calls[0][0].where).toEqual({})
  })
})
