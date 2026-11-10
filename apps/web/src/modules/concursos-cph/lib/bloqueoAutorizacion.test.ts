import { describe, expect, it } from 'vitest'
import {
  aplicarBloqueoPorAutorizacion,
  avisoAutorizacionNuevoCargo,
  esNuevoCargoSinAutorizar,
  omitirCamposCeetpsBloqueados,
} from './bloqueoAutorizacion'

const etapas = [
  { id: 'baja', estado: 'completada' },
  { id: 'autorizacion', estado: 'activa' },
  { id: 'inscripcion', estado: 'pendiente' },
  { id: 'ifacs_insal', estado: 'pendiente' },
  { id: 'designacion', estado: 'pendiente' },
]

describe('bloqueo de etapas por autorización (nuevo_cargo)', () => {
  it('nuevo_cargo sin autorizar: Etapas 2–5 bloqueadas y Etapa 1 activa', () => {
    const r = aplicarBloqueoPorAutorizacion(etapas, { motivoConcurso: 'nuevo_cargo', autorizadoAt: null })
    expect(r.map((e) => e.estado)).toEqual(['activa', 'bloqueada', 'bloqueada', 'bloqueada', 'bloqueada'])
  })
  it('nuevo_cargo autorizado: sin cambios', () => {
    const c = { motivoConcurso: 'nuevo_cargo', autorizadoAt: '2026-11-10T00:00:00Z' }
    expect(aplicarBloqueoPorAutorizacion(etapas, c)).toBe(etapas)
  })
  it('concurso existente (motivo null u otro): sin cambios', () => {
    expect(aplicarBloqueoPorAutorizacion(etapas, { motivoConcurso: null, autorizadoAt: null })).toBe(etapas)
    expect(aplicarBloqueoPorAutorizacion(etapas, { motivoConcurso: 'vacante' })).toBe(etapas)
    expect(aplicarBloqueoPorAutorizacion(etapas, undefined)).toBe(etapas)
    expect(esNuevoCargoSinAutorizar(null)).toBe(false)
  })
  it('aviso: pendiente / autorizado / null', () => {
    expect(avisoAutorizacionNuevoCargo({ motivoConcurso: 'nuevo_cargo', autorizadoAt: null })).toBe(
      'Pendiente de autorización de SGRASV',
    )
    expect(avisoAutorizacionNuevoCargo({ motivoConcurso: 'nuevo_cargo', autorizadoAt: '2026-11-10' })).toBe('Autorizado')
    expect(avisoAutorizacionNuevoCargo({ motivoConcurso: null })).toBeNull()
  })
})

describe('bloqueo CEETPS (nuevo_cargo)', () => {
  const body = { expedienteConcurso: 'EX-1', ifAutorizacion: 'IF-1', dispoLlamado: 'D', fechaIfacs: '2026-01-01', codigoSial: 'X', altaSial: false, observaciones: 'o' }
  it('nuevo_cargo sin autorizar: omite campos de Etapa 2+ y conserva el resto', () => {
    const r = omitirCamposCeetpsBloqueados(body, { motivoConcurso: 'nuevo_cargo', autorizadoAt: null })
    expect(r).toEqual({ expedienteConcurso: 'EX-1', ifAutorizacion: 'IF-1', observaciones: 'o' })
  })
  it('autorizado o no nuevo_cargo: devuelve el body intacto', () => {
    expect(omitirCamposCeetpsBloqueados(body, { motivoConcurso: 'nuevo_cargo', autorizadoAt: '2026-11-10' })).toBe(body)
    expect(omitirCamposCeetpsBloqueados(body, { motivoConcurso: null })).toBe(body)
  })
})
