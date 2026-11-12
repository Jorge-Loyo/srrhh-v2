import { describe, it, expect, vi, beforeEach } from 'vitest'
// GET /puestos-cargo con y sin incluirAmbos. Escalafón 87: 'pof' propios +
// puestos 'ambos'. Sin el parámetro rige la heurística de propios (solo pof);
// con incluirAmbos=true vuelven los 'ambos'. Se mockea Prisma (patrón *.unit.test.ts).
const ESC = '11111111-1111-4111-8111-111111111111'
const filas = [
  { id: 'a', nombre: 'enfermeria', modalidad: 'pof', tipoPuesto: 'ejecucion', escalafonId: ESC, escalafon: { nombre: 'Enf' } },
  { id: 'b', nombre: 'enfermeria atp', modalidad: 'pof', tipoPuesto: 'ejecucion', escalafonId: ESC, escalafon: { nombre: 'Enf' } },
  { id: 'c', nombre: 'enfermero profesional', modalidad: 'ambos', tipoPuesto: 'ejecucion', escalafonId: ESC, escalafon: { nombre: 'Enf' } },
  { id: 'd', nombre: 'licenciado en enfermeria', modalidad: 'ambos', tipoPuesto: 'ejecucion', escalafonId: ESC, escalafon: { nombre: 'Enf' } },
]
const count = vi.fn()
const findMany = vi.fn()
vi.mock('../shared/prisma.js', () => ({ prisma: { puestoCargo: { count, findMany } } }))
vi.mock('../shared/middleware/auth.middleware.js', () => ({ authenticate: async () => {} }))
vi.mock('../shared/middleware/permisos.middleware.js', () => ({ requirePermiso: () => async () => {} }))

const { default: Fastify } = await import('fastify')
const { puestosCargoRoutes } = await import('../modules/puestos-cargo/puestos-cargo.routes.js')

async function get(qs: string) {
  const app = Fastify()
  await app.register(puestosCargoRoutes, { prefix: '/api/v1/puestos-cargo' })
  const res = await app.inject({ method: 'GET', url: `/api/v1/puestos-cargo?${qs}` })
  await app.close()
  return res
}

beforeEach(() => {
  vi.clearAllMocks()
  count.mockResolvedValue(2) // hay 'pof' propios
  findMany.mockImplementation(async ({ where }: { where: { modalidad?: string | { in: string[] } } }) => {
    const m = where.modalidad
    return filas.filter((f) => (m === undefined ? true : typeof m === 'string' ? f.modalidad === m : m.in.includes(f.modalidad)))
  })
})

describe('GET /puestos-cargo incluirAmbos', () => {
  it('sin incluirAmbos: comportamiento histórico (solo pof propios, sin ambos)', async () => {
    const res = await get(`escalafonId=${ESC}&modalidad=pof`)
    expect(res.statusCode).toBe(200)
    expect(res.json().data.map((d: { id: string }) => d.id)).toEqual(['a', 'b'])
  })
  it('incluirAmbos=false equivale a omitirlo', async () => {
    const res = await get(`escalafonId=${ESC}&modalidad=pof&incluirAmbos=false`)
    expect(res.json().data.map((d: { id: string }) => d.id)).toEqual(['a', 'b'])
  })
  it('incluirAmbos=true: modalidad + ambos siempre, sin consultar propios', async () => {
    const res = await get(`escalafonId=${ESC}&modalidad=pou&incluirAmbos=true`)
    expect(count).not.toHaveBeenCalled()
    expect(findMany.mock.calls[0]![0].where.modalidad).toEqual({ in: ['pou', 'ambos'] })
    const res2 = await get(`escalafonId=${ESC}&modalidad=pof&incluirAmbos=true`)
    expect(res2.json().data.map((d: { id: string }) => d.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(res.statusCode).toBe(200)
  })
  it('incluirAmbos=true respeta tipoPuesto=conduccion (solo ambos)', async () => {
    const res = await get(`escalafonId=${ESC}&modalidad=pof&incluirAmbos=true&tipoPuesto=conduccion`)
    expect(res.json().data.map((d: { id: string }) => d.id)).toEqual(['c', 'd'])
  })
  it('modalidad=ambos no cambia con incluirAmbos', async () => {
    await get(`escalafonId=${ESC}&modalidad=ambos&incluirAmbos=true`)
    expect(findMany.mock.calls[0]![0].where.modalidad).toBe('ambos')
  })
})
