import { describe, it, expect } from 'vitest'
import { notificacionesQuerySchema } from '../modules/notificaciones/notificaciones.schema.js'

describe('notificacionesQuerySchema — filtro por varios tipos', () => {
  it('parsea tipos separados por coma a un array (pestañas que agrupan tipos)', () => {
    const q = notificacionesQuerySchema.parse({ tipos: 'autorizacion_pendiente, autorizacion_resuelta' })
    expect(q.tipos).toEqual(['autorizacion_pendiente', 'autorizacion_resuelta'])
  })

  it('rechaza un tipo desconocido o una lista vacía', () => {
    expect(() => notificacionesQuerySchema.parse({ tipos: 'autorizacion_pendiente,otro' })).toThrow()
    expect(() => notificacionesQuerySchema.parse({ tipos: ',' })).toThrow()
  })

  it('sin tipos sigue funcionando y el límite máximo es 100', () => {
    expect(notificacionesQuerySchema.parse({}).tipos).toBeUndefined()
    expect(() => notificacionesQuerySchema.parse({ limit: 200 })).toThrow()
    expect(notificacionesQuerySchema.parse({ limit: 100 }).limit).toBe(100)
  })
})
