import { describe, expect, it } from 'vitest'
import type { OmDisponible, Usuario } from '@srrhh/types'
import {
  aplicarSaltoOm,
  debeOcultarPanelEtapa1,
  etiquetaOm,
  puedeOperarOm,
  textoNoHabilitado,
} from './saltoOm'

const userCon = (permisos: { modulo: string; accion: string }[]) => ({ permisos }) as unknown as Usuario
const conTab = userCon([{ modulo: 'concursos-cph', accion: 'tab:autorizacion-jurado' }])
const sinTab = userCon([{ modulo: 'concursos-cph', accion: 'editar' }])

const etapas = [
  { id: 'baja', estado: 'completada' },
  { id: 'autorizacion', estado: 'activa' },
  { id: 'inscripcion', estado: 'pendiente' },
  { id: 'ifacs_insal', estado: 'pendiente' },
  { id: 'designacion', estado: 'pendiente' },
]

describe('puedeOperarOm', () => {
  it('con tab:autorizacion-jurado (rol admin incluido, si tiene el permiso): sí', () => {
    expect(puedeOperarOm(conTab)).toBe(true)
  })
  it('sin el permiso de la pestaña, aunque pueda editar: no', () => {
    expect(puedeOperarOm(sinTab)).toBe(false)
  })
  it('sin usuario: no', () => {
    expect(puedeOperarOm(null)).toBe(false)
    expect(puedeOperarOm(undefined)).toBe(false)
  })
})

describe('aplicarSaltoOm', () => {
  it('con salto: Etapas 2-4 completadas y Etapa 5 activa; la 1 no cambia', () => {
    const r = aplicarSaltoOm(etapas, { saltoOmAt: '2026-11-15T10:00:00Z' })
    expect(r.map((e) => [e.id, e.estado])).toEqual([
      ['baja', 'completada'],
      ['autorizacion', 'completada'],
      ['inscripcion', 'completada'],
      ['ifacs_insal', 'completada'],
      ['designacion', 'activa'],
    ])
  })
  it('sin salto: devuelve las mismas etapas', () => {
    expect(aplicarSaltoOm(etapas, { saltoOmAt: null })).toBe(etapas)
    expect(aplicarSaltoOm(etapas, {})).toBe(etapas)
    expect(aplicarSaltoOm(etapas, null)).toBe(etapas)
  })
})

describe('textoNoHabilitado', () => {
  it('sin_tipo_gestion pide guardar el tipo de gestión', () => {
    expect(textoNoHabilitado('sin_tipo_gestion')).toBe(
      'Guardá el tipo de gestión para ver las órdenes de mérito disponibles',
    )
  })
  it('cada motivo tiene un texto propio y no vacío', () => {
    const motivos = [
      'solo_nuevo_cargo',
      'sin_tipo_gestion',
      'concurso_finalizado',
      'concurso_suspendido',
      'etapa_avanzada',
      'ya_resuelto',
      'sin_especialidad',
    ] as const
    const textos = motivos.map((m) => textoNoHabilitado(m))
    expect(new Set(textos).size).toBe(motivos.length)
    textos.forEach((t) => expect(t.length).toBeGreaterThan(10))
  })
  it('motivo nulo: texto genérico', () => {
    expect(textoNoHabilitado(null)).toMatch(/órdenes de mérito/)
  })
})

describe('etiquetaOm', () => {
  const orden = {
    id: 'om1',
    concursoOrigen: {
      id: 'c1',
      codigo: 'CPH-001',
      tipoGestion: 'centralizado',
      hospital: { sigla: 'HZ', nombre: 'Hospital Z' },
    },
    especialidad: 'enfermeria',
    puesto: 'enfermero/a',
    expediente: null,
    fechaPublicacion: '2026-05-01T00:00:00Z',
    vigenteHasta: '2026-11-01T00:00:00Z',
    advertencias: [],
    integrantes: [],
  } as OmDisponible
  it('arma código, especialidad, puesto y vigencia', () => {
    expect(etiquetaOm(orden)).toBe('CPH-001 · enfermeria · enfermero/a · vigente hasta 01/11/2026')
  })
  it('sin código ni puesto', () => {
    expect(
      etiquetaOm({ ...orden, puesto: null, concursoOrigen: { ...orden.concursoOrigen, codigo: null } }),
    ).toBe('OM · enfermeria · vigente hasta 01/11/2026')
  })
})

describe('debeOcultarPanelEtapa1', () => {
  it('solo para nuevo_cargo', () => {
    expect(debeOcultarPanelEtapa1({ motivoConcurso: 'nuevo_cargo' })).toBe(true)
    expect(debeOcultarPanelEtapa1({ motivoConcurso: 'cobertura' })).toBe(false)
    expect(debeOcultarPanelEtapa1({ motivoConcurso: null })).toBe(false)
    expect(debeOcultarPanelEtapa1(undefined)).toBe(false)
  })
})
