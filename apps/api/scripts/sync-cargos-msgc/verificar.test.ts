import { describe, expect, it } from 'vitest'
import { distribucionEsperada, evaluarVerificacion, EXCEPCIONES_ENF_CR85, textoVerificacion, type DatosVerificacion } from './verificar.js'

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
  it('Docentes duplicado: falla si le quedan cargos o el CR 07 no esta en el 7; los autogenerados que quedan son aviso', () => {
    const ok = { ...OK, docentesDuplicadoExiste: false, docentesDuplicadoCargos: 0, escalafonDelCr07: '7', escalafonesAutogenerados: [] }
    expect(evaluarVerificacion(ok, 100, 0).ok).toBe(true)
    expect(evaluarVerificacion({ ...ok, docentesDuplicadoExiste: true, docentesDuplicadoCargos: 5 }, 100, 0).ok).toBe(false)
    expect(evaluarVerificacion({ ...ok, escalafonDelCr07: 'Docentes-c32a65d' }, 100, 0).ok).toBe(false)
    const aviso = evaluarVerificacion({ ...ok, escalafonesAutogenerados: ['Otro-1234abc'] }, 100, 0)
    expect(aviso.ok).toBe(true)
    expect(aviso.chequeos.find((c) => c.nombre.includes('autogenerado'))?.detalle).toContain('Otro-1234abc')
  })
})

describe('control de distribucion por acronimo (con R-)', () => {
  const filas = [
    { codigo_excel: 'CPH-G-00001', acronimo: 'CPH-G' },
    { codigo_excel: 'R-CPH-G-00002', acronimo: 'CPH-G' },
    { codigo_excel: 'CPH-P-00001', acronimo: 'CPH-P' },
    { codigo_excel: 'TEC-00001', acronimo: 'TEC' },
    { codigo_excel: EXCEPCIONES_ENF_CR85[0], acronimo: 'TEC' },
  ]
  const esperada = distribucionEsperada(filas)
  const real = { 'CPH-G': 1, 'R-CPH-G': 1, 'CPH-P': 1, TEC: 1, ENF: 1 }
  const ctl = (r: ReturnType<typeof evaluarVerificacion>) => r.chequeos.find((c) => c.nombre.startsWith('distribucion por acronimo'))
  it('esperada: R- sale del codigo_excel y las excepciones de Jorge cuentan como ENF', () => {
    expect(esperada).toEqual(real)
  })
  it('OK cuando coincide', () => {
    const r = evaluarVerificacion({ ...OK, vigentes: 4, validacionVacante: 1, distribucionAcronimos: real }, 5, 0, esperada)
    expect(ctl(r)?.ok).toBe(true)
    expect(r.ok).toBe(true)
  })
  it('FALLA con detalle cuando los reemplazantes quedan sin R- o un R- sobra', () => {
    const r = evaluarVerificacion(
      { ...OK, vigentes: 4, validacionVacante: 1, distribucionAcronimos: { 'CPH-G': 2, 'R-CPH-P': 1, TEC: 1, ENF: 1 } },
      5, 0, esperada,
    )
    expect(r.ok).toBe(false)
    expect(ctl(r)?.detalle).toBe('CPH-G: Excel 1, local 2; CPH-P: Excel 1, local 0; R-CPH-G: Excel 1, local 0; R-CPH-P: Excel 0, local 1')
  })
  it('FALLA si una excepcion no decidida (un TEC mas como ENF) cambia la distribucion', () => {
    const r = evaluarVerificacion({ ...OK, vigentes: 4, validacionVacante: 1, distribucionAcronimos: { ...real, TEC: 0, ENF: 2 } }, 5, 0, esperada)
    expect(ctl(r)?.ok).toBe(false)
  })
  it('sin distribucion esperada no se evalua el control', () => {
    expect(ctl(evaluarVerificacion(OK, 100, 0))).toBeUndefined()
  })
})
