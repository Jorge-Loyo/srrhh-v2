import { describe, it, expect } from 'vitest'
import {
  prefijoDeCargo,
  esConduccionPorPrefijo,
  esConduccionPorLiteral,
  prefijoRemplazante,
} from '../shared/codigoCargo.js'

// ─── prefijoDeCargo ───────────────────────────────────────────────────────────
// Función pura: no toca BD, no tiene side effects. Se testea exhaustivamente
// porque es la fuente de verdad del código de cargo — un error acá genera
// códigos con prefijo incorrecto que son difíciles de corregir en producción.

describe('prefijoDeCargo', () => {

  // ── CPH ────────────────────────────────────────────────────────────────────

  describe('CPH (Médicos)', () => {
    it('escalafon "Médicos" (valor real BD) de planta → CPH-P', () => {
      expect(prefijoDeCargo({
        escalafon: 'Médicos',
        unificadorPuesto: 'Médico de Planta POF',
        agrupador: 'Medico de Planta',
      })).toBe('CPH-P')
    })

    it('escalafon "Nueva Carrera Profesional Hospitalaria" (valor real BD) de planta → CPH-P', () => {
      expect(prefijoDeCargo({
        escalafon: 'Nueva Carrera Profesional Hospitalaria',
        unificadorPuesto: 'Médico de Planta POF',
        agrupador: 'Medico de Planta',
      })).toBe('CPH-P')
    })

    it('escalafon "Médicos" de guardia → CPH-G', () => {
      expect(prefijoDeCargo({
        escalafon: 'Médicos',
        unificadorPuesto: 'Médico de Guardia POU',
        agrupador: 'Medico de Guardia',
      })).toBe('CPH-G')
    })

    it('escalafon "Nueva Carrera Profesional Hospitalaria" de guardia → CPH-G', () => {
      expect(prefijoDeCargo({
        escalafon: 'Nueva Carrera Profesional Hospitalaria',
        unificadorPuesto: 'Médico de Guardia POU',
        agrupador: 'Medico de Guardia',
      })).toBe('CPH-G')
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

    it('escalafon "CPH" exacto → CPH-P', () => {
      expect(prefijoDeCargo({
        escalafon: 'CPH',
        unificadorPuesto: null,
        agrupador: null,
      })).toBe('CPH-P')
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
    it('CEETPS de planta → TEC', () => {
      expect(prefijoDeCargo({
        escalafon: 'CEETPS',
        unificadorPuesto: 'Técnico POF',
        agrupador: 'Tecnico de Planta',
      })).toBe('TEC')
    })

    it('CEETPS de guardia → TEC', () => {
      expect(prefijoDeCargo({
        escalafon: 'CEETPS',
        unificadorPuesto: 'Técnico POU Guardia',
        agrupador: 'Tecnico de Guardia',
      })).toBe('TEC')
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

    it('EG Director → EG-J (MSGC no tiene EG-D)', () => {
      expect(prefijoDeCargo({
        escalafon: 'Escalafón General',
        unificadorPuesto: 'Director EG',
        agrupador: 'Director EG',
      })).toBe('EG-J')
    })

    it('EG Gerencial → EG-J (MSGC no tiene EG-G)', () => {
      expect(prefijoDeCargo({
        escalafon: 'Escalafón General',
        unificadorPuesto: 'Gerencial',
        agrupador: 'Gerencial',
      })).toBe('EG-J')
    })
  })

  // ── Régimen Gerencial ──────────────────────────────────────────────────────

  describe('Régimen Gerencial', () => {
    it('RG → GER', () => {
      expect(prefijoDeCargo({
        escalafon: 'Régimen Gerencial',
        unificadorPuesto: null,
        agrupador: null,
      })).toBe('GER')
    })

    it('escalafon "RG" exacto → GER', () => {
      expect(prefijoDeCargo({
        escalafon: 'RG',
        unificadorPuesto: null,
        agrupador: null,
      })).toBe('GER')
    })
  })

  // ── Suplentes / Residentes / Docentes ──────────────────────────────────────

  describe('Suplentes / Residentes / Docentes', () => {
    it('Suplentes → SG', () => {
      expect(prefijoDeCargo({ escalafon: 'Suplentes de Guardia', unificadorPuesto: null, agrupador: null })).toBe('SG')
    })

    it('Residentes sin literal Básica/Post-básica → RES (histórico)', () => {
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

// ─── S18-3: esConduccionPorPrefijo / esConduccionPorLiteral / prefijoRemplazante ──
// Funciones puras: no tocan BD. Se testean exhaustivamente porque determinan si
// una retención genera un cargo R (ejecución) o TTR (conducción, con período).

describe('esConduccionPorPrefijo', () => {
  it('cada prefijo de conducción con secuencial → true', () => {
    const prefijos = [
      'CPH-J-POF', 'CPH-J-POU', 'CPH-D', 'CPH-SD', 'ENF-J', 'TEC-J', 'EG-J', 'GER', 'AS',
      // históricos (cargos aún no recodificados)
      'EG-D', 'EG-G', 'RG-CG', 'TEC-J-POF', 'AS-MIN', 'AS-SS', 'AS-DG', 'AS-DGA',
    ]
    for (const prefijo of prefijos) {
      expect(esConduccionPorPrefijo(`${prefijo}-000001`)).toBe(true)
    }
  })

  it('prefijos de ejecución → false', () => {
    for (const codigo of ['CPH-P-000001', 'CPH-G-000001', 'ENF-000001', 'TEC-000001', 'EG-000001', 'SGAII-000001', 'CPH-POF-000001']) {
      expect(esConduccionPorPrefijo(codigo)).toBe(false)
    }
  })

  it('código de remplazante (R/TTR) hereda la condición del prefijo base', () => {
    expect(esConduccionPorPrefijo('TTR-CPH-J-POF-000001')).toBe(true)
    expect(esConduccionPorPrefijo('R-CPH-P-000001')).toBe(false)
    expect(esConduccionPorPrefijo('CPH-J-POF-TTR-000001')).toBe(true) // histórico
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
  it('ejecución → R- adelante', () => {
    expect(prefijoRemplazante('CPH-P', 'R')).toBe('R-CPH-P')
  })
  it('conducción → TTR- adelante', () => {
    expect(prefijoRemplazante('CPH-J-POF', 'TTR')).toBe('TTR-CPH-J-POF')
  })
})

// ─── Generador por llamador (MSGC): misma forma de parámetros que cada call site ──
describe('prefijoDeCargo por llamador (acrónimos MSGC)', () => {
  const pc = (nombre: string, tipoPuesto: 'ejecucion' | 'conduccion', modalidad: 'pof' | 'pou' | 'ambos') =>
    ({ nombre, tipoPuesto, modalidad })

  it('alta manual (cargos.service): CR explícito + puesto resuelto', () => {
    expect(prefijoDeCargo({
      escalafon: 'Nueva Carrera Profesional Hospitalaria', unificadorPuesto: null, agrupador: null,
      puestoCargo: pc('Médico de Planta', 'ejecucion', 'pof'), tieneEspecialidad: true, codigoRegistro: '37',
    })).toBe('CPH-P')
    expect(prefijoDeCargo({
      escalafon: 'Carrera de Técnicos', unificadorPuesto: null, agrupador: null,
      puestoCargo: pc('Auxiliar de Enfermería', 'ejecucion', 'pof'), codigoRegistro: '85',
    })).toBe('ENF')
    expect(prefijoDeCargo({
      escalafon: 'Residencias', unificadorPuesto: null, agrupador: null,
      puestoCargo: pc('Residente Post Básica', 'ejecucion', 'pof'), codigoRegistro: '24',
    })).toBe('RPB')
  })

  it('_aprobarAltaCargo (autorizaciones): CR 22 equivale a 37; guardia → CPH-G', () => {
    expect(prefijoDeCargo({
      escalafon: 'Médicos', unificadorPuesto: null, agrupador: null,
      puestoCargo: pc('Médico de Guardia', 'ejecucion', 'pou'), codigoRegistro: '22',
    })).toBe('CPH-G')
  })

  it('padrón: CR de la fila del padrón manda sobre el nombre del escalafón', () => {
    expect(prefijoDeCargo({
      escalafon: 'Escalafón raro', unificadorPuesto: 'Radio operador', agrupador: null,
      puestoCargo: pc('Radio operador', 'ejecucion', 'pof'), codigoRegistro: '83',
    })).toBe('SGAII')
    expect(prefijoDeCargo({
      escalafon: null, unificadorPuesto: null, agrupador: null, codigoRegistro: '25',
    })).toBe('AS')
  })

  it('derivarCargosConduccion: nodo del organigrama (línea de árbol)', () => {
    expect(prefijoDeCargo({
      escalafon: 'Nueva Carrera Profesional Hospitalaria', unificadorPuesto: 'jefatura', agrupador: 'director',
      puestoCargo: pc('director', 'conduccion', 'pof'), tieneLineaArbol: true,
    })).toBe('CPH-D')
    expect(prefijoDeCargo({
      escalafon: 'Nueva Carrera Profesional Hospitalaria', unificadorPuesto: 'jefatura', agrupador: 'sub-director',
      puestoCargo: pc('sub-director', 'conduccion', 'pof'), tieneLineaArbol: true,
    })).toBe('CPH-SD')
    expect(prefijoDeCargo({
      escalafon: 'Nueva Carrera Enfermería', unificadorPuesto: 'jefatura', agrupador: 'jefe de departamento',
      puestoCargo: pc('jefe de departamento', 'conduccion', 'pof'), tieneLineaArbol: true,
    })).toBe('ENF-J')
  })

  it('jefe CPH sin línea de árbol es ejecución (CPH-P)', () => {
    expect(prefijoDeCargo({
      escalafon: 'Médicos', unificadorPuesto: null, agrupador: 'Jefe de Seccion',
      puestoCargo: pc('Jefe de Sección', 'conduccion', 'pof'), tieneLineaArbol: false,
    })).toBe('CPH-P')
  })

  it('escalafón sin acrónimo conserva prefijo histórico', () => {
    expect(prefijoDeCargo({ escalafon: 'Planta Transitoria', unificadorPuesto: null, agrupador: null })).toBe('PT')
  })
})
