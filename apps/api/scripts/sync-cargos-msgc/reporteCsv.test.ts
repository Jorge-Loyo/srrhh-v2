import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { cruzar, type Entrada } from './cruce.js'
import { armarResumen, csvDeColgados, csvDeConflictos, csvDeEntradas, escribirReporte, validarCelda, validarCeldaExpediente } from './reporteCsv.js'

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

describe('concursos_colgados.csv: expedientes sin datos personales', () => {
  const colgado = (p: Record<string, string> = {}) => ({
    cargo_codigo_sistema: 'CPH-POF-000001', estado_cargo: 'vigente', sigla: 'HTAL', acronimo_propuesto: 'CPH-P', puesto: 'Medico',
    especialidad: '', tipo_concurso: 'CPH', estado_concurso: 'activo', sub_estado_concurso: '', activo: 'si',
    expediente_concurso: 'EX-2024-01234567', motivo_concurso: '', autorizado: 'no', expediente_en_excel: 'si',
    fila_excel: 'CPH-P-00001', otros_vinculos: '', revision: '', ...p,
  })

  it('acepta expedientes normalizados (aunque tengan el patron \\d+-\\d+) y listas separadas por |', () => {
    expect(() => validarCeldaExpediente('EX-2024-01234567', 'x')).not.toThrow()
    expect(() => validarCeldaExpediente('EX-2024-01234567 | EX-2021-00000005', 'x')).not.toThrow()
    expect(() => validarCeldaExpediente('', 'x')).not.toThrow()
    expect(() => csvDeColgados([colgado()])).not.toThrow()
  })

  it('rechaza un CUIL o un rol en la columna de expediente y en cualquier otra', () => {
    expect(() => validarCeldaExpediente('20123456789', 'x')).toThrow(/11 digitos/)
    expect(() => validarCeldaExpediente('EX-2024-20123456789', 'x')).toThrow(/11 digitos/)
    expect(() => validarCeldaExpediente('123-45', 'x')).toThrow(/patron de rol/)
    expect(() => validarCeldaExpediente('texto libre', 'x')).toThrow(/expedientes/)
    expect(() => csvDeColgados([colgado({ puesto: '20123456789' })])).toThrow(/11 digitos/)
    expect(() => csvDeColgados([colgado({ expediente_concurso: 'EX-2024-1' , fila_excel: '123-4' })])).toThrow(/patron de rol/)
  })

  it('el encabezado es fijo', () => {
    expect(csvDeColgados([]).split('\n')[0]).toBe(
      'cargo_codigo_sistema,estado_cargo,sigla,acronimo_propuesto,puesto,especialidad,tipo_concurso,estado_concurso,sub_estado_concurso,activo,expediente_concurso,motivo_concurso,autorizado,expediente_en_excel,fila_excel,otros_vinculos,revision',
    )
  })
})

describe('conflictos_expediente.csv', () => {
  const conflicto = (p: Record<string, string> = {}) => ({
    codigo_excel: 'CPH-P-00001', cargo_codigo_sistema: 'CPH-P-000001', sigla: 'HTAL', puesto: 'Medico', bloque: 'Concurso',
    fuente_sistema: 'cargo', expediente_excel: 'EX-2024-01234567', expediente_sistema: 'EX-2020-00000005 | EX-2021-00000006', ...p,
  })

  it('encabezado fijo y expedientes normalizados (una celda puede listar varios)', () => {
    const csv = csvDeConflictos([conflicto()])
    expect(csv.split('\n')[0]).toBe('codigo_excel,cargo_codigo_sistema,sigla,puesto,bloque,fuente_sistema,expediente_excel,expediente_sistema')
    expect(csv).toContain('EX-2020-00000005 | EX-2021-00000006')
    expect(csvDeConflictos([])).toBe(csv.split('\n')[0] + '\n')
  })

  it('rechaza CUIL, roles o texto libre en las columnas de expediente', () => {
    expect(() => csvDeConflictos([conflicto({ expediente_sistema: '20123456789' })])).toThrow(/11 digitos/)
    expect(() => csvDeConflictos([conflicto({ expediente_excel: 'texto libre' })])).toThrow(/expedientes/)
    expect(() => csvDeConflictos([conflicto({ puesto: '123-45' })])).toThrow(/patron de rol/)
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
      expect(nombres).toHaveLength(14)
      expect(nombres).toContain('concursos_colgados.csv')
      expect(nombres).toContain('conflictos_expediente.csv')
      for (const n of nombres) {
        const t = fs.readFileSync(path.join(dir, n), 'utf8')
        expect(t).not.toContain(ROL)
        expect(t).not.toMatch(/id_sial_rol/)
      }
      const json = JSON.parse(fs.readFileSync(path.join(dir, 'resumen.json'), 'utf8'))
      expect(json.corte).toBe('2026-11-01')
      expect(json.version_equivalencias).toBe('v-test')
      expect(json.delta_vs_previo.c).toBe(0)
      expect(json.fase2.concursos.eliminar).toBe(0)
      expect(json.conflictos_expediente).toBe(0)
      expect(fs.readFileSync(path.join(dir, 'conflictos_expediente.csv'), 'utf8').split('\n')[0]).toContain('expediente_excel')
      expect(fs.readFileSync(path.join(dir, 'resumen.md'), 'utf8')).toContain('Acciones de la Fase 2')
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

describe('plan de borrado en el resumen', () => {
  const vacio = { cargos: [], ocupaciones: [], siglasHospital: [], siglasOrganigrama: [], codigosRegistro: [], puestos: [], especialidades: [] }
  it('se incluye en resumen.json y resumen.md con conteos sinteticos', async () => {
    const { construirPlanBorrado, TABLAS_BORRAR } = await import('./limpieza.js')
    const r = cruzar([], vacio)
    const plan = construirPlanBorrado(Object.fromEntries(TABLAS_BORRAR.map((t) => [t.tabla, 3])), { concursos_cph: 1 })
    const resumen = armarResumen(r, { corte: null, sha256: null, version_equivalencias: 'v' }, null, plan)
    const dir = path.join(os.tmpdir(), `sync-msgc-plan-${process.pid}`)
    try {
      escribirReporte(dir, r, resumen)
      const json = JSON.parse(fs.readFileSync(path.join(dir, 'resumen.json'), 'utf8'))
      expect(json.plan_borrado).toHaveLength(TABLAS_BORRAR.length)
      const md = fs.readFileSync(path.join(dir, 'resumen.md'), 'utf8')
      expect(md).toContain('## Plan de borrado')
      expect(md).toContain('| audit_logs | todo | 3 | 3 |')
      expect(md).toContain('| concursos_cph | fuera del Excel | 1 | 3 |')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
  it('sin plan no hay seccion', () => {
    expect(armarResumen(cruzar([], vacio), { corte: null, sha256: null, version_equivalencias: 'v' }).plan_borrado).toBeUndefined()
  })
})
