import { describe, expect, it } from 'vitest'
import { evaluarVerificacion, textoVerificacion, type DatosVerificacion } from './verificar.js'

const OK: DatosVerificacion = {
  vigentes: 90, validacionVacante: 10,
  prefijosCodigo: { 'CPH-P': 60, ENF: 30, 'ENF-J': 10, 'CPH-TTR': 0 },
  integridad: { 'concursos cph sin detalle': 0 },
  subEstadoInconsistentes: 0,
  escalafonesCph: [{ codigo: '37', nombre: 'Nueva Carrera Profesional Hospitalaria' }],
  kpisFilas: 120, kpisMeses: 10, kpisMesesEsperados: 10,
}

describe('evaluarVerificacion', () => {
  it('todo en orden', () => {
    const r = evaluarVerificacion(OK, 100, 0)
    expect(r.ok).toBe(true)
    expect(r.chequeos.every((c) => c.ok)).toBe(true)
  })
  it('falla si vigente + validacion_vacante no iguala al Excel', () => {
    const r = evaluarVerificacion({ ...OK, vigentes: 89 }, 100, 0)
    expect(r.ok).toBe(false)
    expect(r.chequeos.find((c) => c.nombre.startsWith('cierre'))?.detalle).toContain('99')
  })
  it('falla si queda algún prefijo viejo', () => {
    const r = evaluarVerificacion({ ...OK, prefijosCodigo: { ...OK.prefijosCodigo, 'CPH-POF': 2, 'AS-MIN': 1 } }, 100, 0)
    expect(r.ok).toBe(false)
    expect(r.chequeos.find((c) => c.nombre === 'cero prefijos viejos')?.detalle).toMatch(/CPH-POF: 2.*AS-MIN: 1/)
  })
  it('un prefijo sin regla (-TTR-) es solo un aviso', () => {
    const r = evaluarVerificacion({ ...OK, prefijosCodigo: { ...OK.prefijosCodigo, 'CPH-POF-TTR': 3 } }, 100, 0)
    expect(r.ok).toBe(true)
    expect(r.chequeos.some((c) => c.severidad === 'aviso' && !c.ok)).toBe(true)
  })
  it('falla por integridad referencial, sub_estado o segunda corrida con cambios', () => {
    expect(evaluarVerificacion({ ...OK, integridad: { 'cargo base de si mismo': 1 } }, 100, 0).ok).toBe(false)
    expect(evaluarVerificacion({ ...OK, subEstadoInconsistentes: 4 }, 100, 0).ok).toBe(false)
    expect(evaluarVerificacion(OK, 100, 7).ok).toBe(false)
  })
  it('escalafon CPH: debe quedar UN escalafon, codigo 37 y nombre nuevo', () => {
    const nombre = (r: ReturnType<typeof evaluarVerificacion>) => r.chequeos.find((c) => c.nombre.startsWith('escalafon CPH'))
    expect(nombre(evaluarVerificacion(OK, 100, 0))?.ok).toBe(true)
    // sin migrar: codigo 22 y nombre viejo
    const viejo = evaluarVerificacion({ ...OK, escalafonesCph: [{ codigo: '22', nombre: 'Nueva Carrera Prof. Hosp' }] }, 100, 0)
    expect(viejo.ok).toBe(false)
    expect(nombre(viejo)?.detalle).toContain('22 "Nueva Carrera Prof. Hosp"')
    // codigo 37 pero nombre viejo; y los dos escalafones a la vez
    expect(evaluarVerificacion({ ...OK, escalafonesCph: [{ codigo: '37', nombre: 'Nueva Carrera Prof. Hosp' }] }, 100, 0).ok).toBe(false)
    expect(evaluarVerificacion({ ...OK, escalafonesCph: [...OK.escalafonesCph, { codigo: '22', nombre: 'Nueva Carrera Prof. Hosp' }] }, 100, 0).ok).toBe(false)
    expect(evaluarVerificacion({ ...OK, escalafonesCph: [] }, 100, 0).ok).toBe(false)
  })
  it('kpis_dotacion_snapshot: falla si esta vacio habiendo padron aprobado; avisa si faltan meses', () => {
    expect(evaluarVerificacion({ ...OK, kpisFilas: 0, kpisMeses: 0 }, 100, 0).ok).toBe(false)
    expect(evaluarVerificacion({ ...OK, kpisFilas: 0, kpisMeses: 0, kpisMesesEsperados: 0 }, 100, 0).ok).toBe(true)
    const parcial = evaluarVerificacion({ ...OK, kpisMeses: 8 }, 100, 0)
    expect(parcial.ok).toBe(true)
    expect(parcial.chequeos.some((c) => c.severidad === 'aviso' && !c.ok && c.nombre.includes('kpis'))).toBe(true)
  })
  it('sin segunda corrida calculada no agrega ese chequeo', () => {
    expect(evaluarVerificacion(OK, 100, null).chequeos.some((c) => c.nombre.includes('segunda corrida'))).toBe(false)
  })
  it('el texto no trae datos personales', () => {
    expect(textoVerificacion(evaluarVerificacion(OK, 100, 0))).not.toMatch(/cuil|\d{9}-\d/i)
  })
})
