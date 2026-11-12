import { describe, it, expect } from 'vitest'
import {
  PASOS_RESUELTOS_POR_OM,
  coincideEspecialidadPuesto,
  evaluarElegibilidadOm,
  normalizarOm,
  omVigente,
  puedeOfrecerOm,
  reglaGestionOm,
  type DestinoOfrecibleInput,
} from '../modules/concursos-cph/omElegibilidad.js'

const d = (iso: string) => new Date(`${iso}T00:00:00`)
const HOY = d('2026-11-15')

describe('normalizarOm', () => {
  it('minúscula, sin tildes y sin espacios extremos', () => {
    expect(normalizarOm('  Enfermería Ñandú ')).toBe('enfermeria nandu')
    expect(normalizarOm(null)).toBe('')
  })
})

describe('omVigente', () => {
  it('vigente hasta el día del vencimiento inclusive', () => {
    expect(omVigente({ estado: 'vigente', fechaVencimiento: d('2026-11-15') }, HOY)).toBe(true)
    expect(omVigente({ estado: 'vigente', fechaVencimiento: d('2026-11-14') }, HOY)).toBe(false)
  })
  it('la prórroga extiende la vigencia', () => {
    const om = { estado: 'prorrogada', fechaVencimiento: d('2026-11-01'), fechaProrroga: d('2026-12-30') }
    expect(omVigente(om, HOY)).toBe(true)
    expect(omVigente({ ...om, fechaProrroga: d('2026-11-10') }, HOY)).toBe(false)
  })
  it('estado vencida nunca es vigente', () => {
    expect(omVigente({ estado: 'vencida', fechaVencimiento: d('2027-01-01') }, HOY)).toBe(false)
  })
})

describe('coincideEspecialidadPuesto', () => {
  const om = { especialidad: 'Enfermería ATP', puesto: 'Enfermero Profesional' }
  it('ignora tildes y mayúsculas', () => {
    expect(coincideEspecialidadPuesto(om, { especialidad: 'enfermeria atp', puesto: 'ENFERMERO PROFESIONAL' })).toBe(true)
  })
  it('especialidad distinta → false', () => {
    expect(coincideEspecialidadPuesto(om, { especialidad: 'Enfermeros ATC', puesto: null })).toBe(false)
  })
  it('puesto solo se compara si ambos lo tienen', () => {
    expect(coincideEspecialidadPuesto(om, { especialidad: 'enfermeria atp', puesto: null })).toBe(true)
    expect(coincideEspecialidadPuesto({ ...om, puesto: null }, { especialidad: 'enfermeria atp', puesto: 'otro' })).toBe(true)
    expect(coincideEspecialidadPuesto(om, { especialidad: 'enfermeria atp', puesto: 'Licenciado' })).toBe(false)
  })
  it('destino sin especialidad → false (aunque la OM tampoco tenga)', () => {
    expect(coincideEspecialidadPuesto(om, { especialidad: null, puesto: 'x' })).toBe(false)
    expect(coincideEspecialidadPuesto({ especialidad: '', puesto: null }, { especialidad: '  ', puesto: null })).toBe(false)
  })
})

describe('puedeOfrecerOm', () => {
  const ok: DestinoOfrecibleInput = {
    motivoConcurso: 'nuevo_cargo',
    autorizadoAt: d('2026-11-10'),
    estado: 'activo',
    suspendido: false,
    subEstado: 'b-sorteo jur',
    saltoOmAt: null,
    resolucionDesignacion: null,
    tipoGestion: 'centralizado',
    especialidad: 'Enfermeros ATP',
  }
  it('caso feliz', () => {
    expect(puedeOfrecerOm(ok)).toEqual({ ok: true, motivo: null })
    expect(puedeOfrecerOm({ ...ok, subEstado: 'a-caratulado' }).ok).toBe(true)
  })
  it.each([
    ['solo_nuevo_cargo', { motivoConcurso: 'vacante' }],
    ['solo_nuevo_cargo', { motivoConcurso: null }],
    ['solo_nuevo_cargo', { autorizadoAt: null }],
    ['concurso_finalizado', { estado: 'finalizado' }],
    ['concurso_suspendido', { suspendido: true }],
    ['concurso_suspendido', { estado: 'suspendido' }],
    ['ya_resuelto', { saltoOmAt: d('2026-11-12') }],
    ['ya_resuelto', { resolucionDesignacion: 'R-1' }],
    ['etapa_avanzada', { subEstado: 'e-orden de merito' }],
    ['etapa_avanzada', { subEstado: 'h-tad' }],
    ['sin_especialidad', { especialidad: null }],
    ['sin_especialidad', { especialidad: '   ' }],
    ['sin_tipo_gestion', { tipoGestion: null }],
  ] as const)('%s', (motivo, cambio) => {
    expect(puedeOfrecerOm({ ...ok, ...cambio })).toEqual({ ok: false, motivo })
  })
})

describe('reglaGestionOm — advierte y nunca bloquea', () => {
  const base = { tipoGestionOrigen: 'centralizado', tipoGestionDestino: 'centralizado', hospitalOrigenId: 'h1', hospitalDestinoId: 'h2' }
  it('mismo tipo centralizado, distinta repartición: sin advertencias', () => {
    expect(reglaGestionOm(base)).toEqual({ permite: true, advertencias: [] })
  })
  it('tipos distintos: advierte y permite', () => {
    const r = reglaGestionOm({ ...base, tipoGestionOrigen: 'descentralizado', hospitalOrigenId: 'h2' })
    expect(r.permite).toBe(true)
    expect(r.advertencias).toHaveLength(1)
  })
  it('origen sin tipo definido: advierte y permite', () => {
    const r = reglaGestionOm({ ...base, tipoGestionOrigen: null })
    expect(r.permite).toBe(true)
    expect(r.advertencias).toHaveLength(1)
  })
  it('origen descentralizado y otro hospital: advierte', () => {
    const r = reglaGestionOm({ ...base, tipoGestionOrigen: 'descentralizado', tipoGestionDestino: 'descentralizado' })
    expect(r.permite).toBe(true)
    expect(r.advertencias).toHaveLength(1)
  })
  it('origen descentralizado y mismo hospital: sin advertencias', () => {
    const r = reglaGestionOm({ ...base, tipoGestionOrigen: 'descentralizado', tipoGestionDestino: 'descentralizado', hospitalOrigenId: 'h2' })
    expect(r.advertencias).toEqual([])
  })
})

describe('evaluarElegibilidadOm', () => {
  const om = { concursoCphId: 'origen', estado: 'vigente', fechaVencimiento: d('2027-01-01'), fechaProrroga: null, especialidad: 'Enfermeros ATP', puesto: null }
  const destino = { concursoCphId: 'destino', especialidad: 'enfermeros atp', puesto: null, tipoGestion: 'centralizado', hospitalId: 'h1', escalafonId: 'e1' }
  const origen = { tipoGestion: 'centralizado', hospitalId: 'h1', escalafonId: 'e1' }
  it('elegible', () => {
    expect(evaluarElegibilidadOm({ om, destino, origen, hoy: HOY })).toEqual({ elegible: true, advertencias: [] })
  })
  it('la propia OM, vencida y especialidad distinta no son elegibles', () => {
    expect(evaluarElegibilidadOm({ om: { ...om, concursoCphId: 'destino' }, destino, origen, hoy: HOY })).toEqual({ elegible: false, motivo: 'propia' })
    expect(evaluarElegibilidadOm({ om: { ...om, estado: 'vencida' }, destino, origen, hoy: HOY })).toEqual({ elegible: false, motivo: 'vencida' })
    expect(evaluarElegibilidadOm({ om: { ...om, especialidad: 'otra' }, destino, origen, hoy: HOY })).toEqual({ elegible: false, motivo: 'especialidad_puesto' })
  })
  it('otro escalafón (o sin escalafón) no es elegible; mismo escalafón sí', () => {
    expect(evaluarElegibilidadOm({ om, destino, origen: { ...origen, escalafonId: 'e2' }, hoy: HOY })).toEqual({ elegible: false, motivo: 'escalafon' })
    expect(evaluarElegibilidadOm({ om, destino: { ...destino, escalafonId: null }, origen, hoy: HOY })).toEqual({ elegible: false, motivo: 'escalafon' })
    expect(evaluarElegibilidadOm({ om, destino, origen, hoy: HOY }).elegible).toBe(true)
  })
  it('centralizado/descentralizado no bloquea: solo advierte', () => {
    const r = evaluarElegibilidadOm({ om, destino: { ...destino, tipoGestion: 'descentralizado', hospitalId: 'h9' }, origen: { ...origen, tipoGestion: 'descentralizado' }, hoy: HOY })
    expect(r.elegible).toBe(true)
    expect((r as { advertencias: string[] }).advertencias.length).toBeGreaterThan(0)
  })
  it('tipo distinto: elegible con advertencia', () => {
    const r = evaluarElegibilidadOm({ om, destino, origen: { ...origen, tipoGestion: 'descentralizado' }, hoy: HOY })
    expect(r.elegible).toBe(true)
    expect((r as { advertencias: string[] }).advertencias.length).toBeGreaterThan(0)
  })
})

describe('PASOS_RESUELTOS_POR_OM', () => {
  it('lista los pasos que el salto da por resueltos', () => {
    expect([...PASOS_RESUELTOS_POR_OM]).toEqual(['jurado', 'inscripcion', 'examen', 'orden_merito'])
  })
})
