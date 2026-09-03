import { describe, it, expect } from 'vitest'
import { prefijoDeCargo } from '../shared/codigoCargo.js'

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
        unificadorPuesto: 'Médico de Planta POF',
        agrupador: 'Medico de Planta',
      })).toBe('CPH-POF')
    })

    it('escalafon "Nueva Carrera Profesional Hospitalaria" (valor real BD) de planta → CPH-POF', () => {
      expect(prefijoDeCargo({
        escalafon: 'Nueva Carrera Profesional Hospitalaria',
        unificadorPuesto: 'Médico de Planta POF',
        agrupador: 'Medico de Planta',
      })).toBe('CPH-POF')
    })

    it('escalafon "Médicos" de guardia → CPH-POU', () => {
      expect(prefijoDeCargo({
        escalafon: 'Médicos',
        unificadorPuesto: 'Médico de Guardia POU',
        agrupador: 'Medico de Guardia',
      })).toBe('CPH-POU')
    })

    it('escalafon "Nueva Carrera Profesional Hospitalaria" de guardia → CPH-POU', () => {
      expect(prefijoDeCargo({
        escalafon: 'Nueva Carrera Profesional Hospitalaria',
        unificadorPuesto: 'Médico de Guardia POU',
        agrupador: 'Medico de Guardia',
      })).toBe('CPH-POU')
    })

    it('CPH jefe de planta → CPH-J-POF', () => {
      expect(prefijoDeCargo({
        escalafon: 'Médicos',
        unificadorPuesto: 'Jefatura POF',
        agrupador: 'Jefe de Seccion',
      })).toBe('CPH-J-POF')
    })

    it('CPH jefe de guardia → CPH-J-POU', () => {
      expect(prefijoDeCargo({
        escalafon: 'Médicos',
        unificadorPuesto: 'Jefatura POU Guardia',
        agrupador: 'Jefe de Guardia',
      })).toBe('CPH-J-POU')
    })

    it('CPH Director → CPH-D', () => {
      expect(prefijoDeCargo({
        escalafon: 'Médicos',
        unificadorPuesto: 'Director CPH',
        agrupador: 'Director (01)',
      })).toBe('CPH-D')
    })

    it('CPH Sub-Director → CPH-SD', () => {
      expect(prefijoDeCargo({
        escalafon: 'Médicos',
        unificadorPuesto: 'Sub-Director CPH',
        agrupador: 'Sub-Director (03)',
      })).toBe('CPH-SD')
    })

    it('escalafon "CPH" exacto → CPH-POF', () => {
      expect(prefijoDeCargo({
        escalafon: 'CPH',
        unificadorPuesto: null,
        agrupador: null,
      })).toBe('CPH-POF')
    })
  })

  // ── Enfermería ─────────────────────────────────────────────────────────────

  describe('Enfermería', () => {
    it('"Nueva Carrera Enfermería" (valor real BD) → ENF', () => {
      expect(prefijoDeCargo({
        escalafon: 'Nueva Carrera Enfermería',
        unificadorPuesto: 'Enfermero/a POF',
        agrupador: 'Enfermero/a',
      })).toBe('ENF')
    })

    it('escalafon "ENF" exacto → ENF', () => {
      expect(prefijoDeCargo({
        escalafon: 'ENF',
        unificadorPuesto: null,
        agrupador: null,
      })).toBe('ENF')
    })
  })

  // ── CEETPS ─────────────────────────────────────────────────────────────────

  describe('CEETPS (Técnicos)', () => {
    it('CEETPS de planta → TEC-POF', () => {
      expect(prefijoDeCargo({
        escalafon: 'CEETPS',
        unificadorPuesto: 'Técnico POF',
        agrupador: 'Tecnico de Planta',
      })).toBe('TEC-POF')
    })

    it('CEETPS de guardia → TEC-POU', () => {
      expect(prefijoDeCargo({
        escalafon: 'CEETPS',
        unificadorPuesto: 'Técnico POU Guardia',
        agrupador: 'Tecnico de Guardia',
      })).toBe('TEC-POU')
    })
  })

  // ── Escalafón General ──────────────────────────────────────────────────────

  describe('Escalafón General', () => {
    it('EG base → EG', () => {
      expect(prefijoDeCargo({
        escalafon: 'Escalafón General',
        unificadorPuesto: 'Administrativo',
        agrupador: 'Administrativo',
      })).toBe('EG')
    })

    it('EG Jefe → EG-J', () => {
      expect(prefijoDeCargo({
        escalafon: 'Escalafón General',
        unificadorPuesto: 'Jefe de División',
        agrupador: 'Jefe EG',
      })).toBe('EG-J')
    })

    it('EG Director → EG-D', () => {
      expect(prefijoDeCargo({
        escalafon: 'Escalafón General',
        unificadorPuesto: 'Director EG',
        agrupador: 'Director EG',
      })).toBe('EG-D')
    })

    it('EG Gerencial → EG-G', () => {
      expect(prefijoDeCargo({
        escalafon: 'Escalafón General',
        unificadorPuesto: 'Gerencial',
        agrupador: 'Gerencial',
      })).toBe('EG-G')
    })
  })

  // ── Régimen Gerencial ──────────────────────────────────────────────────────

  describe('Régimen Gerencial', () => {
    it('RG → RG-CG', () => {
      expect(prefijoDeCargo({
        escalafon: 'Régimen Gerencial',
        unificadorPuesto: null,
        agrupador: null,
      })).toBe('RG-CG')
    })

    it('escalafon "RG" exacto → RG-CG', () => {
      expect(prefijoDeCargo({
        escalafon: 'RG',
        unificadorPuesto: null,
        agrupador: null,
      })).toBe('RG-CG')
    })
  })

  // ── Suplentes / Residentes / Docentes ──────────────────────────────────────

  describe('Suplentes / Residentes / Docentes', () => {
    it('Suplentes → SG', () => {
      expect(prefijoDeCargo({ escalafon: 'Suplentes de Guardia', unificadorPuesto: null, agrupador: null })).toBe('SG')
    })

    it('Residentes → RES', () => {
      expect(prefijoDeCargo({ escalafon: 'Residentes', unificadorPuesto: null, agrupador: null })).toBe('RES')
    })

    it('Docentes → DOC', () => {
      expect(prefijoDeCargo({ escalafon: 'Docentes', unificadorPuesto: null, agrupador: null })).toBe('DOC')
    })
  })

  // ── Fallback ───────────────────────────────────────────────────────────────

  describe('Fallback', () => {
    it('escalafon desconocido → CARGO', () => {
      expect(prefijoDeCargo({ escalafon: 'Desconocido XYZ', unificadorPuesto: null, agrupador: null })).toBe('CARGO')
    })

    it('todos null → CARGO', () => {
      expect(prefijoDeCargo({ escalafon: null, unificadorPuesto: null, agrupador: null })).toBe('CARGO')
    })

    it('strings vacíos → CARGO', () => {
      expect(prefijoDeCargo({ escalafon: '', unificadorPuesto: '', agrupador: '' })).toBe('CARGO')
    })
  })
})
