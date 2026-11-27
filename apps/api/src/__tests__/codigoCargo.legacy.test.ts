import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import {
  prefijoDeCargo,
  esConduccionPorPrefijo,
  esConduccionPorLiteral,
  prefijoRemplazante,
} from '../shared/codigoCargo.js'

// NOMENCLATURA_CODIGO_CARGO=legacy (DEFAULT): generador ANTERIOR a FEAT-004 (CPH-POF/POU, TEC-POF/POU, RG-CG, AS-MIN...,
// reemplazantes con sufijo). Es lo que corre mientras producción tenga la base sin recodificar. Estos tests son los
// originales (c23a4a8^) sin cambios de expectativas; el modo msgc se prueba en codigoCargo.test.ts.
// Se corren SIN la variable (default) y con la variable en 'legacy'.
beforeEach(() => vi.unstubAllEnvs())
afterEach(() => vi.unstubAllEnvs())
// ─── prefijoDeCargo ───────────────────────────────────────────────────────────
// Función pura: no toca BD, no tiene side effects. Se testea exhaustivamente
// porque es la fuente de verdad del código de cargo — un error acá genera
// códigos con prefijo incorrecto que son difíciles de corregir en producción.

describe('prefijoDeCargo', () => {

  // ── CPH ────────────────────────────────────────────────────────────────────

  describe('CPH (Médicos)', () => {
    it('escalafon "Médicos" (valor real BD) de planta → CPH-POF', () => {
      expect(prefijoDeCargo({
        escalafon: 'Médicos',
        literalPuesto: 'Médico de Planta POF',
      })).toBe('CPH-POF')
    })

    it('escalafon "Nueva Carrera Profesional Hospitalaria" (valor real BD) de planta → CPH-POF', () => {
      expect(prefijoDeCargo({
        escalafon: 'Nueva Carrera Profesional Hospitalaria',
        literalPuesto: 'Médico de Planta POF',
      })).toBe('CPH-POF')
    })

    it('escalafon "Médicos" de guardia → CPH-POU', () => {
      expect(prefijoDeCargo({
        escalafon: 'Médicos',
        literalPuesto: 'Médico de Guardia POU',
      })).toBe('CPH-POU')
    })

    it('escalafon "Nueva Carrera Profesional Hospitalaria" de guardia → CPH-POU', () => {
      expect(prefijoDeCargo({
        escalafon: 'Nueva Carrera Profesional Hospitalaria',
        literalPuesto: 'Médico de Guardia POU',
      })).toBe('CPH-POU')
    })

    it('CPH jefe de planta → CPH-J-POF', () => {
      expect(prefijoDeCargo({
        escalafon: 'Médicos',
        literalPuesto: 'Jefatura POF',
      })).toBe('CPH-J-POF')
    })

    it('CPH jefe de guardia → CPH-J-POU', () => {
      expect(prefijoDeCargo({
        escalafon: 'Médicos',
        literalPuesto: 'Jefatura POU Guardia',
      })).toBe('CPH-J-POU')
    })

    it('CPH Director → CPH-D', () => {
      expect(prefijoDeCargo({
        escalafon: 'Médicos',
        literalPuesto: 'Director (01)',
      })).toBe('CPH-D')
    })

    it('CPH Sub-Director → CPH-SD', () => {
      expect(prefijoDeCargo({
        escalafon: 'Médicos',
        literalPuesto: 'Sub-Director (03)',
      })).toBe('CPH-SD')
    })

    it('escalafon "CPH" exacto → CPH-POF', () => {
      expect(prefijoDeCargo({
        escalafon: 'CPH',
        literalPuesto: null,
      })).toBe('CPH-POF')
    })
  })

  // ── Enfermería ─────────────────────────────────────────────────────────────

  describe('Enfermería', () => {
    it('"Nueva Carrera Enfermería" (valor real BD) → ENF', () => {
      expect(prefijoDeCargo({
        escalafon: 'Nueva Carrera Enfermería',
        literalPuesto: 'Enfermero/a POF',
      })).toBe('ENF')
    })

    it('escalafon "ENF" exacto → ENF', () => {
      expect(prefijoDeCargo({
        escalafon: 'ENF',
        literalPuesto: null,
      })).toBe('ENF')
    })
  })

  // ── CEETPS ─────────────────────────────────────────────────────────────────

  describe('CEETPS (Técnicos)', () => {
    it('CEETPS de planta → TEC-POF', () => {
      expect(prefijoDeCargo({
        escalafon: 'CEETPS',
        literalPuesto: 'Técnico POF',
      })).toBe('TEC-POF')
    })

    it('CEETPS de guardia → TEC-POU', () => {
      expect(prefijoDeCargo({
        escalafon: 'CEETPS',
        literalPuesto: 'Técnico POU Guardia',
      })).toBe('TEC-POU')
    })
  })

  // ── Escalafón General ──────────────────────────────────────────────────────

  describe('Escalafón General', () => {
    it('EG base → EG', () => {
      expect(prefijoDeCargo({
        escalafon: 'Escalafón General',
        literalPuesto: 'Administrativo',
      })).toBe('EG')
    })

    it('EG Jefe → EG-J', () => {
      expect(prefijoDeCargo({
        escalafon: 'Escalafón General',
        literalPuesto: 'Jefe de División',
      })).toBe('EG-J')
    })

    it('EG Director → EG-D', () => {
      expect(prefijoDeCargo({
        escalafon: 'Escalafón General',
        literalPuesto: 'Director EG',
      })).toBe('EG-D')
    })

    it('EG Gerencial → EG-G', () => {
      expect(prefijoDeCargo({
        escalafon: 'Escalafón General',
        literalPuesto: 'Gerencial',
      })).toBe('EG-G')
    })
  })

  // ── Régimen Gerencial ──────────────────────────────────────────────────────

  describe('Régimen Gerencial', () => {
    it('RG → RG-CG', () => {
      expect(prefijoDeCargo({
        escalafon: 'Régimen Gerencial',
        literalPuesto: null,
      })).toBe('RG-CG')
    })

    it('escalafon "RG" exacto → RG-CG', () => {
      expect(prefijoDeCargo({
        escalafon: 'RG',
        literalPuesto: null,
      })).toBe('RG-CG')
    })
  })

  // ── Suplentes / Residentes / Docentes ──────────────────────────────────────

  describe('Suplentes / Residentes / Docentes', () => {
    it('Suplentes → SG', () => {
      expect(prefijoDeCargo({ escalafon: 'Suplentes de Guardia', literalPuesto: null })).toBe('SG')
    })

    it('Residentes → RES', () => {
      expect(prefijoDeCargo({ escalafon: 'Residentes', literalPuesto: null })).toBe('RES')
    })

    it('Docentes → DOC', () => {
      expect(prefijoDeCargo({ escalafon: 'Docentes', literalPuesto: null })).toBe('DOC')
    })
  })

  // ── Fallback ───────────────────────────────────────────────────────────────

  describe('Fallback', () => {
    it('escalafon desconocido → CARGO', () => {
      expect(prefijoDeCargo({ escalafon: 'Desconocido XYZ', literalPuesto: null })).toBe('CARGO')
    })

    it('todos null → CARGO', () => {
      expect(prefijoDeCargo({ escalafon: null, literalPuesto: null })).toBe('CARGO')
    })

    it('strings vacíos → CARGO', () => {
      expect(prefijoDeCargo({ escalafon: '', literalPuesto: '' })).toBe('CARGO')
    })
  })
})

// ─── S18-3: esConduccionPorPrefijo / esConduccionPorLiteral / prefijoRemplazante ──
// Funciones puras: no tocan BD. Se testean exhaustivamente porque determinan si
// una retención genera un cargo R (ejecución) o TTR (conducción, con período).

describe('esConduccionPorPrefijo', () => {
  it('cada prefijo de conducción con secuencial → true', () => {
    const prefijos = [
      'CPH-J-POF', 'CPH-J-POU', 'CPH-D', 'CPH-SD',
      'EG-J', 'EG-D', 'EG-G', 'RG-CG',
      'AS-MIN', 'AS-SS', 'AS-DG', 'AS-DGA',
    ]
    for (const prefijo of prefijos) {
      expect(esConduccionPorPrefijo(`${prefijo}-000001`)).toBe(true)
    }
  })

  it('prefijos de ejecución → false', () => {
    for (const codigo of ['CPH-POF-000001', 'CPH-POU-000001', 'ENF-000001', 'TEC-POF-000001', 'TEC-POU-000001', 'EG-000001']) {
      expect(esConduccionPorPrefijo(codigo)).toBe(false)
    }
  })

  it('código de remplazante (R/TTR) hereda la condición del prefijo base', () => {
    expect(esConduccionPorPrefijo('CPH-J-POF-TTR-000001')).toBe(true)
    expect(esConduccionPorPrefijo('CPH-POF-R-000001')).toBe(false)
  })

  it('null/undefined/vacío → false', () => {
    expect(esConduccionPorPrefijo(null)).toBe(false)
    expect(esConduccionPorPrefijo(undefined)).toBe(false)
    expect(esConduccionPorPrefijo('')).toBe(false)
  })

  it('prefijo desconocido → false', () => {
    expect(esConduccionPorPrefijo('XYZ-000001')).toBe(false)
  })
})

describe('esConduccionPorLiteral', () => {
  it('literales con "Jefe", "Director", "Sub Director", "Gerente" → true', () => {
    expect(esConduccionPorLiteral('Jefe de Departamento')).toBe(true)
    expect(esConduccionPorLiteral('Director del Hospital')).toBe(true)
    expect(esConduccionPorLiteral('Sub Director Médico')).toBe(true)
    expect(esConduccionPorLiteral('Gerente Operativo')).toBe(true)
  })

  it('literal sin esas palabras → false', () => {
    expect(esConduccionPorLiteral('Médico de Planta')).toBe(false)
  })

  it('null/undefined → false', () => {
    expect(esConduccionPorLiteral(null)).toBe(false)
    expect(esConduccionPorLiteral(undefined)).toBe(false)
  })
})

describe('prefijoRemplazante', () => {
  it('ejecución → sufijo -R', () => {
    expect(prefijoRemplazante('CPH-POF', 'R')).toBe('CPH-POF-R')
  })

  it('conducción → sufijo -TTR', () => {
    expect(prefijoRemplazante('CPH-J-POF', 'TTR')).toBe('CPH-J-POF-TTR')
  })
})
