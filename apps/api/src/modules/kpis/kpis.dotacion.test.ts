import { describe, it, expect } from 'vitest'
import { agregarDotacion, normalizarSituacionRevista, type FilaEstadoDotacion } from './kpis.service.js'

// Lógica PURA del motor unificado de dotación (sin BD). Espeja lo que el SQL
// hace al contar: count(DISTINCT cuil) por carrera (código de registro),
// desglosado por situación de revista en series NO disjuntas + total aparte +
// la unión 'activo'∪'comisión' ("activos y comisionados", mensaje #6).

describe('normalizarSituacionRevista', () => {
  it('las 6 variantes conocidas caen en {activo, comision, retencion de cargo}', () => {
    expect(normalizarSituacionRevista('Activo')).toBe('activo')
    expect(normalizarSituacionRevista('activo')).toBe('activo')
    expect(normalizarSituacionRevista('Comisión')).toBe('comision')
    expect(normalizarSituacionRevista('comision')).toBe('comision')
    expect(normalizarSituacionRevista('Retencion de Cargo')).toBe('retencion de cargo')
    expect(normalizarSituacionRevista('retencion de cargo')).toBe('retencion de cargo')
  })

  it('espacios, mayúsculas y tildes se normalizan; nulo/vacío → (sin dato)', () => {
    expect(normalizarSituacionRevista('  RETENCIÓN DE CARGO  ')).toBe('retencion de cargo')
    expect(normalizarSituacionRevista('COMISIÓN')).toBe('comision')
    expect(normalizarSituacionRevista(null)).toBe('(sin dato)')
    expect(normalizarSituacionRevista('')).toBe('(sin dato)')
    expect(normalizarSituacionRevista('   ')).toBe('(sin dato)')
  })
})

describe('agregarDotacion', () => {
  it('(i) persona con 2 ocupaciones del mismo código en estados distintos cuenta en AMBAS series y 1 en total', () => {
    const filas: FilaEstadoDotacion[] = [
      { cuil: '20-1', codigo: '37', situacionRevista: 'Activo' },
      { cuil: '20-1', codigo: '37', situacionRevista: 'Retencion de Cargo' },
    ]
    const { porCarrera } = agregarDotacion(filas)
    expect(porCarrera['37'].total).toBe(1)
    expect(porCarrera['37'].porSituacion['activo']).toBe(1)
    expect(porCarrera['37'].porSituacion['retencion de cargo']).toBe(1)
    // El total NO es la suma de las series (series no disjuntas).
    const sumaSeries = Object.values(porCarrera['37'].porSituacion).reduce((s, v) => s + v, 0)
    expect(sumaSeries).toBe(2)
    expect(porCarrera['37'].total).not.toBe(sumaSeries)
  })

  it('(ii) activosYComisionados de persona activa en un cargo y comisión en otro = 1 (no 2)', () => {
    const filas: FilaEstadoDotacion[] = [
      { cuil: '20-2', codigo: '37', situacionRevista: 'activo' },
      { cuil: '20-2', codigo: '37', situacionRevista: 'Comisión' },
    ]
    const { porCarrera } = agregarDotacion(filas)
    expect(porCarrera['37'].activosYComisionados).toBe(1)
    expect(porCarrera['37'].porSituacion['activo']).toBe(1)
    expect(porCarrera['37'].porSituacion['comision']).toBe(1)
    expect(porCarrera['37'].total).toBe(1)
  })

  it('(iii) persona con cargos fijos en dos códigos cuenta 1 en cada carrera', () => {
    const filas: FilaEstadoDotacion[] = [
      { cuil: '20-3', codigo: '37', situacionRevista: 'activo' },
      { cuil: '20-3', codigo: '83', situacionRevista: 'activo' },
    ]
    const { porCarrera } = agregarDotacion(filas)
    expect(porCarrera['37'].total).toBe(1)
    expect(porCarrera['83'].total).toBe(1)
    expect(porCarrera['37'].porSituacion['activo']).toBe(1)
    expect(porCarrera['83'].porSituacion['activo']).toBe(1)
  })

  it('(iv) reproduce las cifras de referencia de CPH (código 37) del mensaje #7', () => {
    // 3 personas distintas: una solo activa, una solo en retención, una en
    // ambos estados → total 3, activo 2, retencion 2, comision 0.
    const filas: FilaEstadoDotacion[] = [
      { cuil: 'A', codigo: '37', situacionRevista: 'Activo' },
      { cuil: 'B', codigo: '37', situacionRevista: 'Retencion de Cargo' },
      { cuil: 'C', codigo: '37', situacionRevista: 'activo' },
      { cuil: 'C', codigo: '37', situacionRevista: 'retencion de cargo' },
    ]
    const { porCarrera } = agregarDotacion(filas)
    expect(porCarrera['37'].total).toBe(3)
    expect(porCarrera['37'].porSituacion['activo']).toBe(2)
    expect(porCarrera['37'].porSituacion['retencion de cargo']).toBe(2)
    expect(porCarrera['37'].porSituacion['comision']).toBeUndefined()
    expect(porCarrera['37'].activosYComisionados).toBe(2)
  })

  it('situacion_revista nula cae en (sin dato) pero igual cuenta en el total', () => {
    const filas: FilaEstadoDotacion[] = [
      { cuil: 'X', codigo: '24', situacionRevista: null },
    ]
    const { porCarrera } = agregarDotacion(filas)
    expect(porCarrera['24'].total).toBe(1)
    expect(porCarrera['24'].porSituacion['(sin dato)']).toBe(1)
    expect(porCarrera['24'].activosYComisionados).toBe(0)
  })
})
