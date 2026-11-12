import { describe, expect, it } from 'vitest'
import type { Usuario } from '@srrhh/types'
import {
  avisoCorreccionExitosa,
  codigoRegistroPreseleccionado,
  etapa1CompletaParaAutorizar,
  requiereCodigoRegistro,
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
    expect(textoConfirmacionCambio('cph')).toBe('Este concurso pasará de CPH a CEETPS y quedará AUTORIZADO en este acto.')
    expect(textoConfirmacionCambio('ceetps', false)).toBe('Este concurso pasará de CEETPS a CPH y quedará sin autorizar hasta cargar el expediente.')
    expect(avisoCorreccionExitosa('cph')).toContain('CPH')
  })
  it('ruta del concurso nuevo según tipo', () => {
    expect(rutaConcurso('cph', 'abc')).toBe('/concursos/cph/abc/wizard')
    expect(rutaConcurso('ceetps', 'xyz')).toBe('/concursos/ceetps/xyz')
  })
})
describe('código de registro al pasar a CEETPS', () => {
  it('selector solo para destino CEETPS', () => {
    expect(requiereCodigoRegistro('ceetps')).toBe(true)
    expect(requiereCodigoRegistro('cph')).toBe(false)
  })
  it('preselecciona 87 si el puesto es de enfermería (con o sin tildes/mayúsculas), 85 en otro caso', () => {
    expect(codigoRegistroPreseleccionado('Licenciado en Enfermería')).toBe('87')
    expect(codigoRegistroPreseleccionado(null, 'ENFERMERO PROFESIONAL')).toBe('87')
    expect(codigoRegistroPreseleccionado('Médico', undefined)).toBe('85')
    expect(codigoRegistroPreseleccionado()).toBe('85')
  })
  it('autoriza solo con expediente (el IF es opcional)', () => {
    expect(etapa1CompletaParaAutorizar({ eeConcurso: 'EE-1', ifAutorizacion: 'IF-1' })).toBe(true)
    expect(etapa1CompletaParaAutorizar({ expedienteConcurso: 'EE-1', ifAutorizacion: 'IF-1' })).toBe(true)
    expect(etapa1CompletaParaAutorizar({ eeConcurso: 'EE-1', ifAutorizacion: null })).toBe(true)
    expect(etapa1CompletaParaAutorizar({ ifAutorizacion: 'IF-1' })).toBe(false)
    expect(etapa1CompletaParaAutorizar(undefined)).toBe(false)
  })
  it('aviso de resultado: autorizado o no', () => {
    expect(avisoCorreccionExitosa('ceetps', true)).toContain('AUTORIZADO')
    expect(avisoCorreccionExitosa('ceetps', false)).toContain('sin autorizar')
  })
})
