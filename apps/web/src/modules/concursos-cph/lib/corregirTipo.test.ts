import { describe, expect, it } from 'vitest'
import type { Usuario } from '@srrhh/types'
import {
  avisoCorreccionExitosa,
  puedeCorregirTipo,
  rutaConcurso,
  textoConfirmacionCambio,
  tipoDestinoDe,
} from './corregirTipo'

const userCon = (permisos: { modulo: string; accion: string }[]) => ({ permisos }) as unknown as Usuario
const autorizador = userCon([{ modulo: 'autorizaciones', accion: 'resolver_sgrasv' }])
const supervision = userCon([{ modulo: 'concursos-cph', accion: 'editar' }])
const nuevo = { estado: 'no_iniciado', concurso: { motivoConcurso: 'nuevo_cargo', autorizadoAt: null } }

describe('puedeCorregirTipo', () => {
  it('autorizador + nuevo_cargo sin autorizar: sí', () => {
    expect(puedeCorregirTipo(autorizador, nuevo)).toBe(true)
  })
  it('supervisión sin el permiso de autorizar: no', () => {
    expect(puedeCorregirTipo(supervision, nuevo)).toBe(false)
    expect(puedeCorregirTipo(null, nuevo)).toBe(false)
  })
  it('concurso ya autorizado: no', () => {
    expect(puedeCorregirTipo(autorizador, { ...nuevo, concurso: { motivoConcurso: 'nuevo_cargo', autorizadoAt: '2026-11-10T00:00:00Z' } })).toBe(false)
  })
  it('otros motivos o sin concurso base: no', () => {
    expect(puedeCorregirTipo(autorizador, { ...nuevo, concurso: { motivoConcurso: 'alta_por_baja', autorizadoAt: null } })).toBe(false)
    expect(puedeCorregirTipo(autorizador, { ...nuevo, concurso: { motivoConcurso: null } })).toBe(false)
    expect(puedeCorregirTipo(autorizador, undefined)).toBe(false)
  })
  it('finalizado o desierto: no', () => {
    expect(puedeCorregirTipo(autorizador, { ...nuevo, estado: 'finalizado' })).toBe(false)
    expect(puedeCorregirTipo(autorizador, { ...nuevo, estado: 'desierto' })).toBe(false)
  })
})

describe('textos y rutas', () => {
  it('destino y mensaje de confirmación', () => {
    expect(tipoDestinoDe('cph')).toBe('ceetps')
    expect(tipoDestinoDe('ceetps')).toBe('cph')
    expect(textoConfirmacionCambio('cph')).toBe('Este concurso pasará de CPH a CEETPS.')
    expect(avisoCorreccionExitosa('cph')).toContain('CPH')
  })
  it('ruta del concurso nuevo según tipo', () => {
    expect(rutaConcurso('cph', 'abc')).toBe('/concursos/cph/abc/wizard')
    expect(rutaConcurso('ceetps', 'xyz')).toBe('/concursos/ceetps/xyz')
  })
})
