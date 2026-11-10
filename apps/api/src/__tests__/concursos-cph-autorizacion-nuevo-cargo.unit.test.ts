import { describe, it, expect } from 'vitest'
// =============================================================================
// Paso 2a — reglas puras de autorización obligatoria para concursos nuevo_cargo.
// Se importan las funciones REALES (sin Prisma). Aplica SOLO a motivo 'nuevo_cargo'.
// =============================================================================
import {
  CAMPOS_ETAPA_2_EN_ADELANTE,
  MENSAJE_BLOQUEO_ETAPA_2,
  camposEtapa2EnBody,
  debeSolicitarAperturaNuevoCargo,
  esNuevoCargoSinAutorizar,
  validarBloqueoEtapa2,
  validarIfAutorizacionNuevoCargo,
} from '../modules/concursos-cph/autorizacionNuevoCargo.js'

const nuevoSinAut = { motivoConcurso: 'nuevo_cargo', autorizadoAt: null }
const nuevoAut = { motivoConcurso: 'nuevo_cargo', autorizadoAt: new Date('2026-11-10') }
const existente = { motivoConcurso: null, autorizadoAt: null }
const otroMotivo = { motivoConcurso: 'vacante', autorizadoAt: null }

describe('bloqueo de Etapa 2+ en nuevo_cargo sin autorizar', () => {
  it('rechaza (409) campos de Etapa 2+ sin autorizado_at', () => {
    for (const body of [
      { fechaAutorizacion: '2026-11-10' },
      { sorteoJurado: '2026-11-10' },
      { tipoGestion: 'centralizado' as const },
      { disposicion: 'D-1' },
      { fechaInscDesde: '2026-11-10' },
      { fechaExamen: null },
      { fechaIfacs: '2026-11-10' },
      { insalAceptado: true },
      { eeDesignacion: 'EE-1' },
      { resolucionDesignacion: 'R-1' },
      { dispoDesierta: 'X' },
    ]) {
      expect(() => validarBloqueoEtapa2(nuevoSinAut, body)).toThrow(MENSAJE_BLOQUEO_ETAPA_2)
    }
  })

  it('permite campos de Etapa 1 aun sin autorizar', () => {
    expect(() =>
      validarBloqueoEtapa2(nuevoSinAut, { eeConcurso: 'EE-1', ifAutorizacion: 'IF-1', observaciones: 'x' }),
    ).not.toThrow()
  })

  it('con autorizado_at permite campos de Etapa 2+', () => {
    expect(() => validarBloqueoEtapa2(nuevoAut, { fechaAutorizacion: '2026-11-10' })).not.toThrow()
  })

  it('concursos que NO son nuevo_cargo: siempre permitido (sin cambio)', () => {
    const body = { fechaAutorizacion: '2026-11-10', fechaIfacs: '2026-11-11', eeDesignacion: 'E' }
    expect(() => validarBloqueoEtapa2(existente, body)).not.toThrow()
    expect(() => validarBloqueoEtapa2(otroMotivo, body)).not.toThrow()
    expect(() => validarBloqueoEtapa2(undefined, body)).not.toThrow()
    expect(esNuevoCargoSinAutorizar(existente)).toBe(false)
  })

  it('camposEtapa2EnBody ignora undefined y lista los presentes', () => {
    expect(camposEtapa2EnBody({ disposicion: undefined, fechaExamen: '2026-01-01' })).toEqual(['fechaExamen'])
    expect(CAMPOS_ETAPA_2_EN_ADELANTE).toContain('personaDesignadaId')
  })
})

describe('IF obligatorio y solicitud de autorización en nuevo_cargo', () => {
  const base = {
    concurso: nuevoSinAut,
    eeConcurso: 'EE-1' as string | null,
    ifAutorizacion: 'IF-1' as string | null,
    tocaEtapa1: true,
    pendienteAutorizacion: false,
    requiereAutorizacionDoble: false,
    tieneCambioProtegido: false,
  }

  it('sin IF junto al expediente → error 400', () => {
    expect(() => validarIfAutorizacionNuevoCargo({ ...base, ifAutorizacion: null })).toThrow(/IF de autorización/)
  })
  it('con IF → ok; guardado ajeno a la Etapa 1 → no valida; no nuevo_cargo → no exige IF', () => {
    expect(() => validarIfAutorizacionNuevoCargo(base)).not.toThrow()
    expect(() => validarIfAutorizacionNuevoCargo({ ...base, ifAutorizacion: null, tocaEtapa1: false })).not.toThrow()
    expect(() => validarIfAutorizacionNuevoCargo({ ...base, concurso: existente, ifAutorizacion: null })).not.toThrow()
  })

  it('solicita cuando la Etapa 1 queda completa y no hay pendiente (no depende de "primera vez")', () => {
    expect(debeSolicitarAperturaNuevoCargo(base)).toBe(true)
  })
  it('no duplica: con pendiente no vuelve a solicitar', () => {
    expect(debeSolicitarAperturaNuevoCargo({ ...base, pendienteAutorizacion: true })).toBe(false)
  })
  it('no solicita si ya está autorizado, si falta IF/expediente o si no se tocó la Etapa 1', () => {
    expect(debeSolicitarAperturaNuevoCargo({ ...base, concurso: nuevoAut })).toBe(false)
    expect(debeSolicitarAperturaNuevoCargo({ ...base, ifAutorizacion: null })).toBe(false)
    expect(debeSolicitarAperturaNuevoCargo({ ...base, eeConcurso: null })).toBe(false)
    expect(debeSolicitarAperturaNuevoCargo({ ...base, tocaEtapa1: false })).toBe(false)
  })
  it('respeta la cadena director→SGRASV y el cambio protegido (esas ramas crean su propia autorización)', () => {
    expect(debeSolicitarAperturaNuevoCargo({ ...base, requiereAutorizacionDoble: true })).toBe(false)
    expect(debeSolicitarAperturaNuevoCargo({ ...base, tieneCambioProtegido: true })).toBe(false)
  })
  it('concurso existente (no nuevo_cargo): nunca usa la regla nueva', () => {
    expect(debeSolicitarAperturaNuevoCargo({ ...base, concurso: existente })).toBe(false)
  })
})
