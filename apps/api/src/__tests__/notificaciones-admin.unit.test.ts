import { describe, it, expect, vi, beforeEach } from 'vitest'

// =============================================================================
// Gobernanza admin — PIEZA B:
// listNotificacionesService y countNoLeidasService, para el rol `admin`,
// devuelven/cuentan TODAS las notificaciones (de todos los rolSlug); para el
// resto de los roles, solo las dirigidas a su propio rol (filtro exacto).
//
// Se mockea el cliente Prisma (patrón del repo): no se toca la base de datos.
// Lo que se verifica es el WHERE con el que se consulta.
// =============================================================================

const notificacion = {
  count: vi.fn(),
  findMany: vi.fn(),
}

vi.mock('../shared/prisma.js', () => ({
  prisma: { notificacion },
}))

const { listNotificacionesService, countNoLeidasService } = await import(
  '../modules/notificaciones/notificaciones.service.js'
)

const baseQuery = { page: 1, limit: 20 } as const

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listNotificacionesService — gobernanza admin', () => {
  it('admin: query SIN filtro por rolSlug (ve todas)', async () => {
    notificacion.count.mockResolvedValue(3)
    notificacion.findMany.mockResolvedValue([
      { id: 'n1', rolSlug: 'director' },
      { id: 'n2', rolSlug: 'sgrasv_5ac494e' },
      { id: 'n3', rolSlug: 'admin' },
    ])

    const res = await listNotificacionesService('admin', baseQuery)

    expect(res.data).toHaveLength(3)
    // El where NO lleva rolSlug para admin
    const whereCount = notificacion.count.mock.calls[0]![0].where
    const whereFind = notificacion.findMany.mock.calls[0]![0].where
    expect(whereCount).not.toHaveProperty('rolSlug')
    expect(whereFind).not.toHaveProperty('rolSlug')
  })

  it('no-admin: query filtra por su rolSlug exacto', async () => {
    notificacion.count.mockResolvedValue(1)
    notificacion.findMany.mockResolvedValue([{ id: 'n1', rolSlug: 'director' }])

    await listNotificacionesService('director', baseQuery)

    const whereFind = notificacion.findMany.mock.calls[0]![0].where
    expect(whereFind).toMatchObject({ rolSlug: 'director' })
  })
})

describe('countNoLeidasService — gobernanza admin', () => {
  it('admin: cuenta no leídas de todos los roles (sin filtro rolSlug)', async () => {
    notificacion.count.mockResolvedValue(5)

    const n = await countNoLeidasService('admin')

    expect(n).toBe(5)
    const where = notificacion.count.mock.calls[0]![0].where
    expect(where).toMatchObject({ leida: false })
    expect(where).not.toHaveProperty('rolSlug')
  })

  it('no-admin: cuenta solo las de su rol', async () => {
    notificacion.count.mockResolvedValue(2)

    await countNoLeidasService('director')

    const where = notificacion.count.mock.calls[0]![0].where
    expect(where).toMatchObject({ leida: false, rolSlug: 'director' })
  })
})
