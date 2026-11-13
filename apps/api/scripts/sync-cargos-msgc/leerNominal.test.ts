import { describe, it, expect } from 'vitest'
import { ENCABEZADOS_NOMINAL, esReemplazanteExcel, parsearNominal, prefijoExcel } from './leerNominal.js'

const ENC = ENCABEZADOS_NOMINAL.join(',')
// Fixture sintético de 5 filas (sin datos reales). Orden de columnas = ENCABEZADOS_NOMINAL.
const fila = (codigo: string, expediente = '') =>
  [codigo, '37', 'HXX', 'Ejecución', 'Planta', 'Vigente', 'Ocupado', 'MEDICO DE PLANTA', expediente,
    '9000001', 'Activo', 'CPH-P', 'Dotación', '', '', '', '', ''].join(',')
const CSV5 = [ENC, fila('CPH-P-00001'), fila('CPH-P-00002', 'EX-2025-123-GDEBA'), fila('CPH-P-00003'),
  fila('CPH-P-00004'), fila('CPH-P-00005')].join('\n')

describe('leerNominal', () => {
  it('acepta la lista blanca y tipa las 5 filas', () => {
    const r = parsearNominal(CSV5)
    expect(r).toHaveLength(5)
    expect(r[1].expediente).toBe('EX-2025-123-GDEBA')
    expect(r[0].cr).toBe('37')
    expect(r[0].acronimo).toBe('CPH-P')
  })

  it.each(['cuil', 'apellido_nombre', 'nombre', 'control'])('rechaza el encabezado personal %s', (h) => {
    expect(() => parsearNominal(`${ENC},${h}\n${fila('A-1')},x`)).toThrow(/personal/)
  })

  it('rechaza un encabezado fuera de la lista blanca', () => {
    expect(() => parsearNominal(`${ENC},otra_columna\n${fila('A-1')},x`)).toThrow(/lista blanca/)
  })

  it('rechaza si falta un encabezado', () => {
    const sinCr = ENCABEZADOS_NOMINAL.filter((h) => h !== 'cr').join(',')
    expect(() => parsearNominal(`${sinCr}\n`)).toThrow(/Faltan/)
  })

  it('rechaza un expediente que no cumple EX-AAAA-', () => {
    expect(() => parsearNominal(`${ENC}\n${fila('CPH-P-00001', '20123456789')}`)).toThrow(/expediente/)
  })
})

describe('marca de reemplazante del Excel', () => {
  it('R- adelante del codigo_excel (la columna acronimo viene sin R-)', () => {
    const [r, n] = parsearNominal([ENC, fila('R-CPH-G-00001'), fila('CPH-G-00002')].join('\n'))
    expect(esReemplazanteExcel(r)).toBe(true)
    expect(esReemplazanteExcel(n)).toBe(false)
    expect(prefijoExcel({ codigo_excel: r.codigo_excel, acronimo: 'CPH-G' })).toBe('R-CPH-G')
    expect(prefijoExcel({ codigo_excel: n.codigo_excel, acronimo: 'CPH-G' })).toBe('CPH-G')
  })
})
