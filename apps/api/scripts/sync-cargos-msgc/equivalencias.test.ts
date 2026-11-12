import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  ANEXO_II_EXCEL,
  SIGLAS_A_CREAR,
  VERSION_EQUIVALENCIAS,
  equivalenciaEspecialidad,
  equivalenciaPuesto,
  equivalenciaSigla,
  esAnexoIIExcel,
  esSiglaACrear,
  puestoSinDestino,
} from './equivalencias.js'

describe('equivalencias', () => {
  it('la versión coincide con la del preprocesador Python', () => {
    const py = fs.readFileSync(path.join(__dirname, 'preprocesar_excel.py'), 'utf8')
    expect(py).toContain(`VERSION_EQUIVALENCIAS = "${VERSION_EQUIVALENCIAS}"`)
  })

  it('siglas: ssapac -> SSAPAC; las 18 restantes se crean, sin mapear', () => {
    expect(equivalenciaSigla('ssapac')).toBe('SSAPAC')
    expect(equivalenciaSigla('SSSAME')).toBeNull()
    expect(SIGLAS_A_CREAR).toHaveLength(18)
    expect(esSiglaACrear('SSSAME')).toBe(true)
    expect(esSiglaACrear('ssame')).toBe(true)
    expect(esSiglaACrear('DGAHGNRG')).toBe(true)
    expect(esSiglaACrear('HBR')).toBe(false)
  })

  it('puestos: Chofer de Ambulancias y abreviaturas de CR 85 resuelven', () => {
    expect(equivalenciaPuesto('83', 'Chofer de Ambulancias')).toBe('chofer de ambulancia')
    expect(equivalenciaPuesto('85', 'Esterilizacion')).toBe('tecnico en esterilizacion')
    expect(equivalenciaPuesto('85', 'Laboratorio de Patologia')).toBe('tecnico en laboratorio de patologia')
    expect(equivalenciaPuesto('85', 'Radiología')).toBe('tecnico en radiologia')
  })

  it('puestos sucios sin destino definido por Jorge no se inventan', () => {
    expect(equivalenciaPuesto('87', 'ENFERMERIA')).toBeNull()
    expect(puestoSinDestino('87', 'Enfermeria')).toBe(true)
    expect(puestoSinDestino('87', 'Tecnico de la Salud')).toBe(true)
    expect(puestoSinDestino('85', '')).toBe(true)
    expect(puestoSinDestino('87', 'Enfermero profesional')).toBe(false)
  })

  it('especialidad: enfermeria -> Enfermeros ATC', () => {
    expect(equivalenciaEspecialidad('ENFERMERIA')).toBe('Enfermeros ATC')
    expect(equivalenciaEspecialidad('Enfermería')).toBe('Enfermeros ATC')
  })

  it('Anexo II del Excel: incluye radio operador y chofer de ambulancia(s); sin capellán ni chofer de funcionario', () => {
    expect(ANEXO_II_EXCEL.size).toBe(9)
    expect(esAnexoIIExcel('Radio operador')).toBe(true)
    expect(esAnexoIIExcel('Radio operador de emergencias')).toBe(true)
    expect(esAnexoIIExcel('Chofer de Ambulancias')).toBe(true)
    expect(esAnexoIIExcel('Capellan')).toBe(false)
    expect(esAnexoIIExcel('Chofer de funcionario')).toBe(false)
  })

  it('clave desconocida o nula devuelve null/false, nunca lanza', () => {
    expect(equivalenciaSigla('xyz')).toBeNull()
    expect(equivalenciaSigla(null)).toBeNull()
    expect(equivalenciaPuesto('99', 'nada')).toBeNull()
    expect(equivalenciaPuesto('83', undefined)).toBeNull()
    expect(equivalenciaEspecialidad(undefined)).toBeNull()
    expect(esAnexoIIExcel(null)).toBe(false)
    expect(esSiglaACrear(undefined)).toBe(false)
  })
})
