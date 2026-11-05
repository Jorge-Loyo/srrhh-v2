import { describe, it, expect } from 'vitest'
import {
  esCargoGestionable,
  CODIGOS_REGISTRO_GESTIONABLES_PLENOS,
} from './incidencias.gestionable.js'
import { ANEXO_II_83 } from '../padron/derivarRegimen.js'

// Un literal real del Anexo II (ya normalizado en ANEXO_II_83) para los casos true.
const LITERAL_ANEXO_II = 'ayudante de laboratorio, hemoterapia, farmacia y drogueria'

describe('esCargoGestionable (núcleo puro)', () => {
  it('los códigos plenos (37/22/23/85/87) son gestionables con CUALQUIER literal', () => {
    for (const codigo of CODIGOS_REGISTRO_GESTIONABLES_PLENOS) {
      expect(esCargoGestionable({ codigoRegistro: codigo, literalPuesto: 'lo que sea' })).toBe(true)
      expect(esCargoGestionable({ codigoRegistro: codigo, literalPuesto: null })).toBe(true)
    }
  })

  it("el '83' es gestionable solo si el literal del puesto ∈ ANEXO_II_83", () => {
    expect(esCargoGestionable({ codigoRegistro: '83', literalPuesto: LITERAL_ANEXO_II })).toBe(true)
    // mismo literal con mayúsculas/acentos → se normaliza igual y sigue dando true.
    expect(esCargoGestionable({ codigoRegistro: '83', literalPuesto: 'Capellán' })).toBe(true)
    expect(esCargoGestionable({ codigoRegistro: '83', literalPuesto: 'Morguero' })).toBe(true)
  })

  it("el '83' fuera del Anexo II NO es gestionable", () => {
    expect(esCargoGestionable({ codigoRegistro: '83', literalPuesto: 'Administrativo' })).toBe(false)
    expect(esCargoGestionable({ codigoRegistro: '83', literalPuesto: '' })).toBe(false)
    expect(esCargoGestionable({ codigoRegistro: '83', literalPuesto: null })).toBe(false)
  })

  it('Residencias (60/24) y Docentes (07) NO son gestionables', () => {
    for (const codigo of ['60', '24', '07', '7']) {
      expect(esCargoGestionable({ codigoRegistro: codigo, literalPuesto: LITERAL_ANEXO_II })).toBe(false)
    }
  })

  it('código null/vacío/undefined NO es gestionable (cargo sin CR)', () => {
    expect(esCargoGestionable({ codigoRegistro: null, literalPuesto: LITERAL_ANEXO_II })).toBe(false)
    expect(esCargoGestionable({ codigoRegistro: '', literalPuesto: LITERAL_ANEXO_II })).toBe(false)
    expect(esCargoGestionable({ codigoRegistro: undefined, literalPuesto: LITERAL_ANEXO_II })).toBe(false)
    expect(esCargoGestionable({ codigoRegistro: '   ', literalPuesto: LITERAL_ANEXO_II })).toBe(false)
  })

  it('los 9 literales reales del Anexo II con el 83 dan todos true', () => {
    for (const literal of ANEXO_II_83) {
      expect(esCargoGestionable({ codigoRegistro: '83', literalPuesto: literal })).toBe(true)
    }
  })
})
