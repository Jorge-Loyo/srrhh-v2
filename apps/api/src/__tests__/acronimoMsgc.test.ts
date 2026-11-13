import { describe, it, expect } from 'vitest'
import {
  ACRONIMOS_MSGC,
  acronimoMsgc,
  prefijoCodigoMsgc,
  recodificarCodigo,
  type EntradaAcronimo,
} from '../shared/acronimoMsgc.js'

const base = (o: Partial<EntradaAcronimo>): EntradaAcronimo => ({
  cr: '37',
  literalPuesto: 'MEDICO DE PLANTA',
  plantaGuardia: 'Planta',
  nivelConduccion: '',
  tieneLineaArbol: false,
  ...o,
})

// Un caso por cada uno de los 23 acrónimos (datos sintéticos).
const CASOS: Array<[string, Partial<EntradaAcronimo>]> = [
  ['CPH-P', {}],
  ['CPH-G', { plantaGuardia: 'Decreto 315', literalPuesto: 'PROFESIONAL GUARDIA MEDICO' }],
  ['CPH-J-POF', { literalPuesto: 'JEFE SECCION (06)', nivelConduccion: 'SECC', tieneLineaArbol: true }],
  ['CPH-J-POU', { plantaGuardia: 'Decreto 315', nivelConduccion: 'UNID', tieneLineaArbol: true }],
  ['CPH-D', { nivelConduccion: 'DHOS', plantaGuardia: '', tieneLineaArbol: true }],
  ['CPH-SD', { nivelConduccion: 'SDHOS', plantaGuardia: '', tieneLineaArbol: true }],
  ['ENF', { cr: '87', literalPuesto: 'Enfermero profesional' }],
  ['ENF-J', { cr: '87', literalPuesto: 'Jefatura SECCION CA', tieneLineaArbol: true }],
  ['TEC', { cr: '85', literalPuesto: 'Tecnico en Laboratorio' }],
  ['TEC-J', { cr: '85', literalPuesto: 'Jefatura DIV CA', tieneLineaArbol: true }],
  ['EG', { cr: '83', literalPuesto: 'Auxiliar administrativo' }],
  ['EG-J', { cr: '83', literalPuesto: 'Jefatura SECCION CA', tieneLineaArbol: true }],
  ['SGAII', { cr: '83', literalPuesto: 'Camillero' }],
  ['PEP', { cr: '70', literalPuesto: 'No aplica' }],
  ['RB', { cr: '24', literalPuesto: '1ER. AÑO BASICA' }],
  ['RPB', { cr: '24', literalPuesto: '2DO. AÑO POST-BASICA' }],
  ['RES-J', { cr: '24', literalPuesto: 'JEFE DE RESIDENTES' }],
  ['DOC', { cr: '07', literalPuesto: 'MAESTRO CELADOR' }],
  ['SG', { cr: '23', literalPuesto: 'PROFESIONAL GUARDIA MEDICO' }],
  ['GER', { cr: '60', literalPuesto: 'GERENTE OPERATIVO' }],
  ['RM', { cr: '16T', literalPuesto: 'PT Modulo Operativo' }],
  ['PGAB', { cr: '17B', literalPuesto: 'PLANTA GABINETE TRANSITORIO' }],
  ['AS', { cr: '25', literalPuesto: 'Director General' }],
]

describe('acronimoMsgc', () => {
  it('cubre los 23 acrónimos', () => {
    expect(CASOS.map(([a]) => a).sort()).toEqual([...ACRONIMOS_MSGC].sort())
    expect(ACRONIMOS_MSGC).toHaveLength(23)
  })

  it.each(CASOS)('%s', (esperado, o) => {
    expect(acronimoMsgc(base(o))).toBe(esperado)
  })

  it('CR 22 se trata como CPH', () => {
    expect(acronimoMsgc(base({ cr: '22' }))).toBe('CPH-P')
  })

  it('CR 17 también es PGAB y CR 19/65 es EG', () => {
    expect(acronimoMsgc(base({ cr: '17', literalPuesto: 'PERSONAL DE GABINETE' }))).toBe('PGAB')
    expect(acronimoMsgc(base({ cr: '65', literalPuesto: 'Personal Transitorio' }))).toBe('EG')
    expect(acronimoMsgc(base({ cr: '19', literalPuesto: 'ENFERMERO/A' }))).toBe('EG')
  })

  it('auxiliares de enfermería de la CR 85 son ENF', () => {
    expect(acronimoMsgc(base({ cr: '85', literalPuesto: 'Auxiliar de Enfermeria' }))).toBe('ENF')
    expect(acronimoMsgc(base({ cr: '85', literalPuesto: 'Enfermeria' }))).toBe('ENF')
    expect(acronimoMsgc(base({ cr: '85', literalPuesto: '' }))).toBe('ENF')
    expect(acronimoMsgc(base({ cr: '85', literalPuesto: 'Tecnico' }))).toBe('TEC')
  })

  it('todos los CR 25 son AS, sin importar el puesto', () => {
    for (const p of ['Ministro', 'Subsecretario', 'AUDITOR INTERNO']) {
      expect(acronimoMsgc(base({ cr: '25', literalPuesto: p }))).toBe('AS')
    }
  })

  it('jefe sin línea de árbol es cargo de ejecución: CPH-P (planta) o CPH-G (guardia)', () => {
    const jefe = { literalPuesto: 'JEFE UNIDAD (05)', nivelConduccion: 'UNID', tieneLineaArbol: false }
    expect(acronimoMsgc(base({ ...jefe, plantaGuardia: 'Planta' }))).toBe('CPH-P')
    expect(acronimoMsgc(base({ ...jefe, plantaGuardia: 'Decreto 315' }))).toBe('CPH-G')
  })

  it('puesto con GUARDIA es CPH-G aunque falte planta/guardia', () => {
    expect(acronimoMsgc(base({ plantaGuardia: '', literalPuesto: 'KINESIOLOGO DE GUARDIA' }))).toBe('CPH-G')
  })

  describe('Anexo II (lista del Excel)', () => {
    it.each(['Radio operador', 'Radio operador de emergencias', 'Chofer de ambulancia', 'Chofer de Ambulancias'])(
      '%s -> SGAII',
      (p) => expect(acronimoMsgc(base({ cr: '83', literalPuesto: p }))).toBe('SGAII'),
    )
    it.each(['Capellan', 'Chofer de funcionario'])('%s sale del Anexo II -> EG', (p) =>
      expect(acronimoMsgc(base({ cr: '83', literalPuesto: p }))).toBe('EG'),
    )
  })

  it('CR desconocido o CR 24 con literal irreconocible: null (sin regla)', () => {
    expect(acronimoMsgc(base({ cr: '99' }))).toBeNull()
    expect(acronimoMsgc(base({ cr: '24', literalPuesto: 'otra cosa' }))).toBeNull()
  })
})

describe('prefijoCodigoMsgc (R- adelante)', () => {
  it('reemplazante lleva R- delante del acrónimo', () => {
    const e = base({ plantaGuardia: 'Decreto 315', reemplazante: true })
    expect(prefijoCodigoMsgc(e)).toBe('R-CPH-G')
    expect(prefijoCodigoMsgc({ ...e, reemplazante: false })).toBe('CPH-G')
  })
  it('sin regla: null', () => {
    expect(prefijoCodigoMsgc(base({ cr: '99', reemplazante: true }))).toBeNull()
  })
})

describe('recodificarCodigo', () => {
  it('conserva los 6 dígitos del sistema', () => {
    expect(recodificarCodigo('CPH-POF-000123', 'CPH-P')).toBe('CPH-P-000123')
    expect(recodificarCodigo('CPH-POU-000045', 'CPH-G')).toBe('CPH-G-000045')
    expect(recodificarCodigo('TEC-J-POF-000007', 'TEC-J')).toBe('TEC-J-000007')
    expect(recodificarCodigo('TEC-POF-000005', 'ENF')).toBe('ENF-000005')
  })
  it('sufijo -R- pasa a R- adelante', () => {
    expect(recodificarCodigo('CPH-POU-R-000123', 'CPH-G')).toBe('R-CPH-G-000123')
  })
  it('con reemplazante explicito la marca R- la decide quien llama (Excel): true agrega, false quita', () => {
    expect(recodificarCodigo('CPH-POU-000123', 'CPH-G', true)).toBe('R-CPH-G-000123')
    expect(recodificarCodigo('CPH-POF-R-000123', 'CPH-P', false)).toBe('CPH-P-000123')
    expect(recodificarCodigo('R-CPH-P-000123', 'CPH-P', false)).toBe('CPH-P-000123')
    expect(recodificarCodigo('R-CPH-G-000123', 'CPH-G', true)).toBe('R-CPH-G-000123')
  })
  it('es idempotente sobre un código ya recodificado', () => {
    expect(recodificarCodigo('CPH-P-000123', 'CPH-P')).toBe('CPH-P-000123')
    expect(recodificarCodigo('R-CPH-G-000123', 'CPH-G')).toBe('R-CPH-G-000123')
  })
  it('devuelve null para -TTR-, formato desconocido o acrónimo desconocido', () => {
    expect(recodificarCodigo('CPH-POU-TTR-000123', 'CPH-G')).toBeNull()
    expect(recodificarCodigo('CPH-TTR-000123', 'CPH-G')).toBeNull()
    expect(recodificarCodigo('CARGO-12', 'CPH-P')).toBeNull()
    expect(recodificarCodigo('', 'CPH-P')).toBeNull()
    expect(recodificarCodigo('CPH-POF-000123', 'XX')).toBeNull()
  })
})
