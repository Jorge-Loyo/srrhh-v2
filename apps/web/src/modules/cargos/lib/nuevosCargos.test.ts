import { describe, it, expect } from 'vitest'
import { rutaCaratular, textoSinConcurso } from './nuevosCargos'

describe('rutaCaratular', () => {
  it('CPH abre el wizard del concurso (id de ConcursoCph), nunca la ruta muerta nuevo/wizard', () => {
    const ruta = rutaCaratular({ tipo: 'cph', detalleId: 'abc-123' })
    expect(ruta).toBe('/concursos/cph/abc-123/wizard')
    expect(ruta).not.toContain('nuevo')
  })

  it('CEETPS abre el detalle /concursos/ceetps/:id', () => {
    expect(rutaCaratular({ tipo: 'ceetps', detalleId: 'xyz' })).toBe('/concursos/ceetps/xyz')
  })
})

describe('textoSinConcurso', () => {
  it('distingue cargos sin tipo de los anteriores al paso 3', () => {
    expect(textoSinConcurso('sin_tipo')).toBe('Sin tipo de concurso definido')
    expect(textoSinConcurso('sin_concurso')).toContain('anterior')
  })
})
