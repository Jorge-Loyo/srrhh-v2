import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { cruzar, type Entrada } from './cruce.js'
import { armarResumen, csvDeEntradas, escribirReporte, validarCelda } from './reporteCsv.js'

const ROL = '90000000001'

const entrada = (p: Partial<Entrada> = {}): Entrada => ({
  codigo_excel: 'CPH-P-00001', categoria: 'a', accion: 'ninguna', cargo_codigo_sistema: 'CPH-P-000001',
  codigo_propuesto: '', acronimo: 'CPH-P', cr: '37', sigla: 'HTAL', puesto: 'Medico', motivo: 'ok', ...p,
})

describe('validarCelda / csvDeEntradas', () => {
  it('acepta códigos de cargo y textos normales', () => {
    expect(() => validarCelda('CPH-P-000123', 'x')).not.toThrow()
    expect(() => validarCelda('R-CPH-G-00123', 'x')).not.toThrow()
  })

  it('rechaza 11 dígitos consecutivos sin incluir el valor en el error', () => {
    expect(() => csvDeEntradas('a', [entrada({ motivo: `rol ${ROL}` })])).toThrow(/11 digitos/)
    try {
      csvDeEntradas('a', [entrada({ motivo: `rol ${ROL}` })])
    } catch (e) {
      expect(String((e as Error).message)).not.toContain(ROL)
    }
  })

  it('rechaza el patrón de rol \\d+-\\d+', () => {
    expect(() => csvDeEntradas('a', [entrada({ puesto: '123-456' })])).toThrow(/patron de rol/)
  })

  it('escapa comas y comillas', () => {
    const csv = csvDeEntradas('a', [entrada({ puesto: 'Medico, "jefe"' })])
    expect(csv).toContain('"Medico, ""jefe"""')
  })
})

describe('escribirReporte', () => {
  const filas = [
    {
      codigo_excel: 'CPH-P-00001', cr: '37', sigla: 'HTAL', tipo: 'Ejecución', planta_guardia: 'Planta', estado: 'Vigente',
      situacion: 'Ocupado', literal_puesto: 'Medico', expediente: '', id_sial_rol: ROL, situacion_revista: 'Activo',
      acronimo: 'CPH-P', bloque: 'Dotación', especialidad_cargo: '', nivel_conduccion: '', cod_rep: '', detalle: '', linea_pou: '',
    },
  ]

  it('escribe resumen.json, resumen.md y detalle_a..j sin id_sial_rol; el delta sale con --previo', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-msgc-test-'))
    try {
      const r = cruzar(filas, { cargos: [], ocupaciones: [], siglasHospital: [], siglasOrganigrama: [], codigosRegistro: [], puestos: [], especialidades: [] })
      // sha256 con 11 dígitos seguidos: no debe hacer fallar el reporte.
      const meta = { corte: '2026-11-01', sha256: `ab${'1'.repeat(12)}cd`, version_equivalencias: 'v-test' }
      const previo = armarResumen(r, meta)
      const resumen = armarResumen(r, meta, previo)
      const nombres = escribirReporte(dir, r, resumen)
      expect(nombres).toHaveLength(12)
      for (const n of nombres) {
        const t = fs.readFileSync(path.join(dir, n), 'utf8')
        expect(t).not.toContain(ROL)
        expect(t).not.toMatch(/id_sial_rol/)
      }
      const json = JSON.parse(fs.readFileSync(path.join(dir, 'resumen.json'), 'utf8'))
      expect(json.corte).toBe('2026-11-01')
      expect(json.version_equivalencias).toBe('v-test')
      expect(json.delta_vs_previo.c).toBe(0)
      expect(fs.readFileSync(path.join(dir, 'detalle_c.csv'), 'utf8').split('\n')[0]).toBe(
        'codigo_excel,categoria,accion,cargo_codigo_sistema,codigo_propuesto,acronimo,cr,sigla,puesto,motivo',
      )
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('no escribe nada si una celda es inválida', () => {
    const dir = path.join(os.tmpdir(), `sync-msgc-test-inexistente-${process.pid}`)
    const r = cruzar([{ ...filas[0], literal_puesto: ROL }], { cargos: [], ocupaciones: [], siglasHospital: [], siglasOrganigrama: [], codigosRegistro: [], puestos: [], especialidades: [] })
    const resumen = armarResumen(r, { corte: null, sha256: null, version_equivalencias: 'v' })
    expect(() => escribirReporte(dir, r, resumen)).toThrow(/11 digitos/)
    expect(fs.existsSync(dir)).toBe(false)
  })
})
