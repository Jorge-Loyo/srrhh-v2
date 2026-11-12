import { describe, it, expect } from 'vitest'
import {
  str,
  num,
  bool,
  fecha,
  serialExcelAFecha,
  normalizarCuil,
  esDesignadoVacante,
  prefijoCeetpsPorSubCarrera,
  FECHA_CENTINELA,
  type Warnings,
} from './helpers.js'

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

describe('str', () => {
  it('trim y vacíos/basura → null', () => {
    expect(str('  hola ')).toBe('hola')
    expect(str('')).toBeNull()
    expect(str('   ')).toBeNull()
    expect(str('-')).toBeNull()
    expect(str('#N/A')).toBeNull()
    expect(str('#VALUE!')).toBeNull()
    expect(str('nan')).toBeNull()
    expect(str(null)).toBeNull()
    expect(str(undefined)).toBeNull()
  })
})

describe('num', () => {
  it('entero / vacío → null', () => {
    expect(num('6')).toBe(6)
    expect(num(6)).toBe(6)
    expect(num('')).toBeNull()
    expect(num('#N/A')).toBeNull()
  })
  it('SmallInt cap: excede ±32767 → null + warning', () => {
    const w: Warnings = []
    expect(num(40000, { smallInt: true, campo: 'cargaHoraria', warnings: w })).toBeNull()
    expect(w.length).toBe(1)
    expect(num(35, { smallInt: true, campo: 'cargaHoraria', warnings: w })).toBe(35)
  })
})

describe('bool', () => {
  it('SI/TRUE/1/X → true; NO/FALSE/0 → false; vacío → null', () => {
    expect(bool('SI')).toBe(true)
    expect(bool('TRUE')).toBe(true)
    expect(bool('1')).toBe(true)
    expect(bool('X')).toBe(true)
    expect(bool('NO')).toBe(false)
    expect(bool('FALSE')).toBe(false)
    expect(bool('')).toBeNull()
    expect(bool(null)).toBeNull()
  })
})

describe('fecha', () => {
  it('ISO válida → Date UTC medianoche', () => {
    expect(iso(fecha('2026-06-29'))).toBe('2026-06-29')
    expect(iso(fecha('2026-07-16'))).toBe('2026-07-16')
  })
  it('vacíos/basura → null sin warning', () => {
    const w: Warnings = []
    expect(fecha('-', 'f', w)).toBeNull()
    expect(fecha('#N/A', 'f', w)).toBeNull()
    expect(fecha('FALSE', 'f', w)).toBeNull()
    expect(fecha('', 'f', w)).toBeNull()
    expect(fecha('0', 'f', w)).toBeNull()
    expect(fecha(null, 'f', w)).toBeNull()
    expect(w.length).toBe(0)
  })
  it('fuera de rango → conserva + warning no-fatal', () => {
    const w: Warnings = []
    expect(iso(fecha('2012-05-01', 'fechaX', w))).toBe('2012-05-01')
    expect(w.length).toBe(1)
  })
  it('centinela 2000-01-01 → sin warning', () => {
    const w: Warnings = []
    expect(iso(fecha(FECHA_CENTINELA, 'fechaVacante', w))).toBe(FECHA_CENTINELA)
    expect(w.length).toBe(0)
  })
  it('serial numérico de Excel se convierte', () => {
    const w: Warnings = []
    expect(iso(fecha(46318, 'f', w))).toBe('2026-10-23')
    expect(w.length).toBe(0)
  })
})

describe('serialExcelAFecha', () => {
  it('46318 → 2026-10-23 (base 1899-12-30)', () => {
    expect(iso(serialExcelAFecha(46318))).toBe('2026-10-23')
  })
})

describe('normalizarCuil', () => {
  it('válido (11 díg, verificador ok)', () => {
    // CUIL de ejemplo del Excel (fila 1 CPH): verificador válido.
    expect(normalizarCuil('27207485263')).toBe('27207485263')
  })
  it('con guiones → quita y valida', () => {
    expect(normalizarCuil('27-20748526-3')).toBe('27207485263')
  })
  it('10 dígitos → null + warning', () => {
    const w: Warnings = []
    expect(normalizarCuil('2720748526', w)).toBeNull()
    expect(w.length).toBe(1)
  })
  it('verificador malo → null + warning', () => {
    const w: Warnings = []
    expect(normalizarCuil('27207485260', w)).toBeNull()
    expect(w.length).toBe(1)
  })
  it('vacío → null (sin warning)', () => {
    const w: Warnings = []
    expect(normalizarCuil('', w)).toBeNull()
    expect(w.length).toBe(0)
  })
})

describe('esDesignadoVacante', () => {
  it('VACANTE A CUBRIR / - / vacío → true', () => {
    expect(esDesignadoVacante('VACANTE A CUBRIR')).toBe(true)
    expect(esDesignadoVacante('-')).toBe(true)
    expect(esDesignadoVacante('')).toBe(true)
    expect(esDesignadoVacante(null)).toBe(true)
  })
  it('nombre real → false', () => {
    expect(esDesignadoVacante('TODORO GLADYS ELIZABETH')).toBe(false)
  })
})

describe('prefijoCeetpsPorSubCarrera', () => {
  it('ENFERMERIA → ENF', () => {
    expect(prefijoCeetpsPorSubCarrera('ENFERMERIA', 'enfermero')).toBe('ENF')
  })
  it('TECNICOS planta → TEC-POF; guardia → TEC-POU', () => {
    expect(prefijoCeetpsPorSubCarrera('TECNICOS', 'tecnico radiologo')).toBe('TEC-POF')
    expect(prefijoCeetpsPorSubCarrera('TECNICOS', 'tecnico de GUARDIA')).toBe('TEC-POU')
  })
  it('ANEXO2 jefatura → EG-J; resto → EG', () => {
    expect(prefijoCeetpsPorSubCarrera('ANEXO2', 'JEFE de camilleros')).toBe('EG-J')
    expect(prefijoCeetpsPorSubCarrera('ANEXO2', 'camillero')).toBe('EG')
  })
})
