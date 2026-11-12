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
  reglaPuestoSucio,
} from './equivalencias.js'

describe('equivalencias', () => {
  it('la versión coincide con la del preprocesador Python', () => {
    const py = fs.readFileSync(path.join(__dirname, 'preprocesar_excel.py'), 'utf8')
    expect(py).toContain(`VERSION_EQUIVALENCIAS = "${VERSION_EQUIVALENCIAS}"`)
  })

  it('siglas: ssapac (case-insensitive) -> SSAPAC; SSAME -> SSSAME; UAIEAIT -> EAIT', () => {
    expect(equivalenciaSigla('ssapac')).toBe('SSAPAC')
    expect(equivalenciaSigla('SSAPAC')).toBe('SSAPAC')
    expect(equivalenciaSigla('SSAME')).toBe('SSSAME')
    expect(equivalenciaSigla('SSSAME')).toBeNull()
    expect(equivalenciaSigla('UAIEAIT')).toBe('EAIT')
  })

  it('siglas: las 15 DGAH<sigla> van al hospital que corresponde y no se crean', () => {
    const dgah = [
      'DGAHBR', 'DGAHGACA', 'DGAHGACD', 'DGAHGADS', 'DGAHGAIP', 'DGAHGAJAF', 'DGAHGAP',
      'DGAHGAPP', 'DGAHGARM', 'DGAHGAT', 'DGAHGATA', 'DGAHGAVS', 'DGAHGAZ', 'DGAHGNPE', 'DGAHGNRG',
    ]
    expect(dgah).toHaveLength(15)
    expect(equivalenciaSigla('DGAHBR')).toBe('HBR')
    expect(equivalenciaSigla('dgahgaca')).toBe('HGACA')
    expect(equivalenciaSigla('DGAHGNRG')).toBe('HGNRG')
    for (const s of dgah) {
      expect(equivalenciaSigla(s)).toBe(s.slice(3))
      expect(esSiglaACrear(s)).toBe(false)
    }
  })

  it('siglas a crear: solo queda SSSAME (SSAME es errata; DGAH*/UAIEAIT son equivalencias)', () => {
    expect(SIGLAS_A_CREAR).toEqual(['SSSAME'])
    expect(esSiglaACrear('SSSAME')).toBe(true)
    expect(esSiglaACrear('ssame')).toBe(true)
    expect(esSiglaACrear('UAIEAIT')).toBe(false)
    expect(esSiglaACrear('HBR')).toBe(false)
  })

  it('puestos: Chofer de Ambulancias y abreviaturas de CR 85 resuelven', () => {
    expect(equivalenciaPuesto('83', 'Chofer de Ambulancias')).toBe('chofer de ambulancia')
    expect(equivalenciaPuesto('85', 'Esterilizacion')).toBe('tecnico en esterilizacion')
    expect(equivalenciaPuesto('85', 'Laboratorio de Patologia')).toBe('tecnico en laboratorio de patologia')
    expect(equivalenciaPuesto('85', 'Radiología')).toBe('tecnico en radiologia')
  })

  it('puestos sucios de CR 87 / CR 85 se resuelven en el cruce por regla (no por tabla)', () => {
    expect(equivalenciaPuesto('87', 'ENFERMERIA')).toBeNull()
    expect(reglaPuestoSucio('87', 'Enfermeria')).toBe('cr87_enfermeria')
    expect(reglaPuestoSucio('87', 'Tecnico de la Salud')).toBe('cr87_tecnico_salud')
    expect(reglaPuestoSucio('85', 'Técnico de la Salud')).toBe('cr85_tecnico')
    expect(reglaPuestoSucio('85', 'Tecnico')).toBe('cr85_tecnico')
    expect(reglaPuestoSucio('85', 'Enfermeria')).toBe('cr85_auxiliar')
    expect(reglaPuestoSucio('85', '')).toBe('cr85_auxiliar')
    expect(reglaPuestoSucio('87', 'Enfermero profesional')).toBeNull()
  })

  it('especialidad: enfermeria -> Enfermeros ATC', () => {
    expect(equivalenciaEspecialidad('ENFERMERIA')).toBe('Enfermeros ATC')
    expect(equivalenciaEspecialidad('Enfermería')).toBe('Enfermeros ATC')
    expect(equivalenciaEspecialidad('enfermeria')).toBe('Enfermeros ATC')
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
