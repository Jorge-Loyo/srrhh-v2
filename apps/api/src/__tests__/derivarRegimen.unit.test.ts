import { describe, it, expect } from 'vitest'

// =============================================================================
// Tests de lógica PURA de la derivación del régimen. Se importa la función REAL
// del módulo (no se replica) y se ejercita sin Prisma ni vi.mock, igual que
// derivarCodigoRegistro.unit.test.ts. El núcleo recibe el literal YA
// normalizado (es determinístico); el wrapper normaliza y traduce nombre→id.
// =============================================================================

import {
  derivarRegimen,
  derivarRegimenId,
  MOTIVO_REGIMEN_NO_DERIVABLE,
  ANEXO_II_83,
} from '../modules/padron/derivarRegimen.js'

describe('derivarRegimen — núcleo puro CR→régimen', () => {
  it('22/37/23 → Nueva Carrera Profesional Hospitalaria', () => {
    for (const cr of ['22', '37', '23']) {
      const r = derivarRegimen(cr, '')
      expect(r.regimenNombre).toBe('Nueva Carrera Profesional Hospitalaria')
      expect(r.revision).toBeUndefined()
    }
  })

  it('87 → Nueva Carrera de Enfermería', () => {
    const r = derivarRegimen('87', '')
    expect(r.regimenNombre).toBe('Nueva Carrera de Enfermería')
    expect(r.revision).toBeUndefined()
  })

  it('85 con literal auxiliar de enfermería → Nueva Carrera de Enfermería', () => {
    const r = derivarRegimen('85', 'auxiliar de enfermeria')
    expect(r.regimenNombre).toBe('Nueva Carrera de Enfermería')
  })

  it('85 con cualquier otro literal → Carrera Técnica', () => {
    const r = derivarRegimen('85', 'tecnico de rayos')
    expect(r.regimenNombre).toBe('Carrera Técnica')
  })

  it('83 — cada uno de los 9 literales del Anexo II → Carrera Administrativa anexo II', () => {
    for (const literal of ANEXO_II_83) {
      const r = derivarRegimen('83', literal)
      expect(r.regimenNombre).toBe('Carrera Administrativa anexo II')
    }
  })

  it('83 con literal administrativo común → Carrera Administrativa', () => {
    const r = derivarRegimen('83', 'administrativo')
    expect(r.regimenNombre).toBe('Carrera Administrativa')
  })

  it('65/19 → Carrera Administrativa', () => {
    for (const cr of ['65', '19']) {
      expect(derivarRegimen(cr, '').regimenNombre).toBe('Carrera Administrativa')
    }
  })

  it('70 → Cuerpo de Especialistas Profesionales', () => {
    expect(derivarRegimen('70', '').regimenNombre).toBe('Cuerpo de Especialistas Profesionales')
  })

  it('60 → Carrera Gerencial', () => {
    expect(derivarRegimen('60', '').regimenNombre).toBe('Carrera Gerencial')
  })

  it('25 → Autoridades Superiores', () => {
    expect(derivarRegimen('25', '').regimenNombre).toBe('Autoridades Superiores')
  })

  it('17/17B/16T → Planta Gerencial / Planta Transitoria Módulo Operativo', () => {
    expect(derivarRegimen('17', '').regimenNombre).toBe('Planta Gerencial')
    expect(derivarRegimen('17B', '').regimenNombre).toBe('Planta Transitoria Módulo Operativo')
    expect(derivarRegimen('16T', '').regimenNombre).toBe('Planta Transitoria Módulo Operativo')
  })

  it('07 y 7 → Docentes', () => {
    expect(derivarRegimen('07', '').regimenNombre).toBe('Docentes')
    expect(derivarRegimen('7', '').regimenNombre).toBe('Docentes')
  })

  it('24 → Residentes', () => {
    expect(derivarRegimen('24', '').regimenNombre).toBe('Residentes')
  })

  it('el 85 compara el literal YA normalizado por igualdad exacta', () => {
    // El núcleo NO normaliza: recibe el literal ya normalizado. El wrapper es el
    // que convierte 'Auxiliar de Enfermería' → 'auxiliar de enfermeria'.
    const r = derivarRegimen('85', 'auxiliar de enfermeria')
    expect(r.regimenNombre).toBe('Nueva Carrera de Enfermería')
    // Un literal sin normalizar (con mayúsculas/acento) NO matchea el set.
    const sinNormalizar = derivarRegimen('85', 'Auxiliar de Enfermería')
    expect(sinNormalizar.regimenNombre).toBe('Carrera Técnica')
  })

  it('no derivable: CR null → null + revisión', () => {
    const r = derivarRegimen(null, '')
    expect(r.regimenNombre).toBeNull()
    expect(r.revision?.motivo).toBe(MOTIVO_REGIMEN_NO_DERIVABLE)
  })

  it("no derivable: CR '' → null + revisión", () => {
    const r = derivarRegimen('', '')
    expect(r.regimenNombre).toBeNull()
    expect(r.revision?.motivo).toBe(MOTIVO_REGIMEN_NO_DERIVABLE)
  })

  it("no derivable: CR '99' fuera del mapeo → null + revisión", () => {
    const r = derivarRegimen('99', '')
    expect(r.regimenNombre).toBeNull()
    expect(r.revision?.motivo).toBe(MOTIVO_REGIMEN_NO_DERIVABLE)
  })

  it('14.b: literal de conducción con CR 83/85 cae al default, NO a la excepción', () => {
    // 'jefe de division' / 'jefe de seccion' no están en ANEXO_II_83 ni en
    // AUXILIARES_ENFERMERIA_85, así que caen al régimen por defecto de su CR.
    expect(derivarRegimen('83', 'jefe de division').regimenNombre).toBe('Carrera Administrativa')
    expect(derivarRegimen('85', 'jefe de seccion').regimenNombre).toBe('Carrera Técnica')
  })

  it('ANEXO_II_83 contiene exactamente los 9 literales reales', () => {
    expect(ANEXO_II_83.size).toBe(9)
    expect(ANEXO_II_83.has('ayudante de laboratorio, hemoterapia, farmacia y drogueria')).toBe(true)
    // Sin variantes separadas del 'ayudante'.
    expect(ANEXO_II_83.has('ayudante de laboratorio')).toBe(false)
    expect(ANEXO_II_83.has('hemoterapia')).toBe(false)
  })
})

describe('derivarRegimenId — wrapper: normaliza literal y traduce nombre→id', () => {
  const regimenPorNombre = new Map<string, { id: string; nombre: string }>([
    ['Nueva Carrera Profesional Hospitalaria', { id: 'reg-cph', nombre: 'Nueva Carrera Profesional Hospitalaria' }],
    ['Nueva Carrera de Enfermería', { id: 'reg-enf', nombre: 'Nueva Carrera de Enfermería' }],
    ['Carrera Técnica', { id: 'reg-tec', nombre: 'Carrera Técnica' }],
    ['Carrera Administrativa', { id: 'reg-adm', nombre: 'Carrera Administrativa' }],
    ['Carrera Administrativa anexo II', { id: 'reg-anexo2', nombre: 'Carrera Administrativa anexo II' }],
    // Nota: 'Residentes' deliberadamente AUSENTE del catálogo para probar el fallback.
  ])

  it('traduce el nombre derivado a su id', () => {
    const r = derivarRegimenId('22', null, { regimenPorNombre })
    expect(r.regimenId).toBe('reg-cph')
    expect(r.revision).toBeUndefined()
  })

  it('normaliza el literal crudo antes de aplicar la excepción del 85', () => {
    // 'Auxiliar de Enfermería' (crudo) → 'auxiliar de enfermeria' (normalizado) → Enfermería.
    const r = derivarRegimenId('85', 'Auxiliar de Enfermería', { regimenPorNombre })
    expect(r.regimenId).toBe('reg-enf')
  })

  it('literal crudo del 83 (con mayúsculas/acentos) matchea el Anexo II tras normalizar', () => {
    const r = derivarRegimenId('83', 'Capellán', { regimenPorNombre })
    expect(r.regimenId).toBe('reg-anexo2')
  })

  it('CR no derivable → regimenId null + revisión propagada', () => {
    const r = derivarRegimenId(null, null, { regimenPorNombre })
    expect(r.regimenId).toBeNull()
    expect(r.revision?.motivo).toBe(MOTIVO_REGIMEN_NO_DERIVABLE)
  })

  it('nombre derivado ausente del catálogo → regimenId null + revisión con motivo explícito', () => {
    // CR '24' → 'Residentes', que NO está en el mapa de catálogo de arriba.
    const r = derivarRegimenId('24', null, { regimenPorNombre })
    expect(r.regimenId).toBeNull()
    expect(r.revision?.motivo).toContain('no existe en el catálogo regimenes')
    expect(r.revision?.motivo).toContain('Residentes')
  })
})
