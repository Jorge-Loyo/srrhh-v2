import { describe, it, expect } from 'vitest'
import { dotacionEvolucionQuerySchema } from './kpis.schema.js'

// Lógica PURA del schema Zod de evolución (sin BD): el filtro de situación de
// revista (punto 2) y el predicado de vacío del perfil de indicador (punto 3).

describe('dotacionEvolucionQuerySchema — situaciones (punto 2)', () => {
  it('normaliza string/CSV/array a string[] y nulo/ausente → []', () => {
    expect(dotacionEvolucionQuerySchema.parse({ situaciones: 'activo' }).situaciones).toEqual(['activo'])
    expect(dotacionEvolucionQuerySchema.parse({ situaciones: 'activo,comision' }).situaciones).toEqual([
      'activo',
      'comision',
    ])
    expect(
      dotacionEvolucionQuerySchema.parse({ situaciones: ['activo', 'retencion de cargo'] }).situaciones,
    ).toEqual(['activo', 'retencion de cargo'])
    // Sin z.enum: un 4º valor desconocido no rompe (el SQL simplemente no matchea).
    expect(dotacionEvolucionQuerySchema.parse({ situaciones: 'suspendido' }).situaciones).toEqual([
      'suspendido',
    ])
    expect(dotacionEvolucionQuerySchema.parse({}).situaciones).toEqual([])
  })
})

describe('dotacionEvolucionQuerySchema — indicadores (punto 3)', () => {
  it('retiene un perfil con alguna dimensión y conserva id/situaciones/labels', () => {
    const q = dotacionEvolucionQuerySchema.parse({
      indicadores: JSON.stringify([{ id: 'a', carreras: ['37'], situaciones: ['activo'], labels: ['37 · Activo'] }]),
    })
    expect(q.indicadores).toEqual([
      { id: 'a', carreras: ['37'], situaciones: ['activo'], labels: ['37 · Activo'] },
    ])
  })

  it('un perfil que SOLO trae labels (sin dimensión ni situaciones) se descarta (no match-all)', () => {
    const q = dotacionEvolucionQuerySchema.parse({
      indicadores: JSON.stringify([{ id: 'x', labels: ['solo presentación'] }]),
    })
    expect(q.indicadores).toBeUndefined()
  })

  it('retiene un perfil que solo trae situaciones (es dimensión del predicado)', () => {
    const q = dotacionEvolucionQuerySchema.parse({
      indicadores: JSON.stringify([{ id: 'y', situaciones: ['comision'] }]),
    })
    expect(q.indicadores).toEqual([{ id: 'y', situaciones: ['comision'] }])
  })

  it('JSON inválido produce error de validación', () => {
    const r = dotacionEvolucionQuerySchema.safeParse({ indicadores: '{no-json' })
    expect(r.success).toBe(false)
  })

  it('ausencia de indicadores → undefined', () => {
    expect(dotacionEvolucionQuerySchema.parse({}).indicadores).toBeUndefined()
  })
})
