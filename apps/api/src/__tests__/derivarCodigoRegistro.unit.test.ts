import { describe, it, expect } from 'vitest'

// =============================================================================
// Tests de lógica PURA de la derivación del código de registro. Se importa la
// función REAL del módulo (no se replica) y se ejercita sin Prisma ni vi.mock,
// igual que tareas.unit.test.ts. Cubre los 6 casos de la cascada 1→4.
// =============================================================================

import {
  decidirCodigoRegistro,
  DESEMPATE_CR_POR_ESCALAFON,
  MOTIVO_CR_NO_DERIVABLE,
  type CrCatalogo,
} from '../modules/padron/derivarCodigoRegistro.js'

const cr = (codigo: string): CrCatalogo => ({ id: `cr-${codigo}`, codigo })

describe('decidirCodigoRegistro — cascada de derivación del CR', () => {
  it('(a) CR del padrón presente y resuelve → se usa tal cual (autoridad)', () => {
    const r = decidirCodigoRegistro({
      escalafonCodigo: '22',
      crsDelEscalafon: [cr('22'), cr('37')],
      codigoRegistroDelPadron: '37',
      crDelPadron: cr('37'),
    })
    expect(r.codigoRegistroId).toBe('cr-37')
    expect(r.revision).toBeUndefined()
  })

  it('(b) escalafón con 1 solo CR + padrón vacío → asigna ese CR', () => {
    const r = decidirCodigoRegistro({
      escalafonCodigo: '85',
      crsDelEscalafon: [cr('85')],
      codigoRegistroDelPadron: '',
      crDelPadron: null,
    })
    expect(r.codigoRegistroId).toBe('cr-85')
    expect(r.revision).toBeUndefined()
  })

  it('(c) escalafón 22 multi-CR + padrón vacío → desempate a 37', () => {
    const r = decidirCodigoRegistro({
      escalafonCodigo: '22',
      crsDelEscalafon: [cr('22'), cr('37')],
      codigoRegistroDelPadron: '',
      crDelPadron: null,
    })
    expect(r.codigoRegistroId).toBe('cr-37')
    expect(r.revision).toBeUndefined()
  })

  it('(d) escalafón 83 multi-CR + padrón vacío → desempate a 83', () => {
    const r = decidirCodigoRegistro({
      escalafonCodigo: '83',
      crsDelEscalafon: [cr('83'), cr('19')],
      codigoRegistroDelPadron: '',
      crDelPadron: null,
    })
    expect(r.codigoRegistroId).toBe('cr-83')
    expect(r.revision).toBeUndefined()
  })

  it('(e) escalafón sin ningún CR → NULL + revisión', () => {
    const r = decidirCodigoRegistro({
      escalafonCodigo: 'basura-hash',
      crsDelEscalafon: [],
      codigoRegistroDelPadron: '',
      crDelPadron: null,
    })
    expect(r.codigoRegistroId).toBeNull()
    expect(r.revision?.motivo).toBe(MOTIVO_CR_NO_DERIVABLE)
  })

  it('(f) escalafón multi-CR sin entrada de desempate → NULL + revisión', () => {
    const r = decidirCodigoRegistro({
      escalafonCodigo: '99',
      crsDelEscalafon: [cr('99'), cr('98')],
      codigoRegistroDelPadron: '',
      crDelPadron: null,
    })
    expect(r.codigoRegistroId).toBeNull()
    expect(r.revision?.motivo).toBe(MOTIVO_CR_NO_DERIVABLE)
  })

  it('robustez: texto de CR que NO resuelve (crDelPadron null) con 1 solo CR → regla 2', () => {
    // "texto no resuelto" se trata como "vacío": cae a la cascada de derivación.
    const r = decidirCodigoRegistro({
      escalafonCodigo: '87',
      crsDelEscalafon: [cr('87')],
      codigoRegistroDelPadron: 'XX-no-existe',
      crDelPadron: null,
    })
    expect(r.codigoRegistroId).toBe('cr-87')
    expect(r.revision).toBeUndefined()
  })

  it('la tabla de desempate codifica el criterio confirmado (22→37, 83→83)', () => {
    expect(DESEMPATE_CR_POR_ESCALAFON['22']).toBe('37')
    expect(DESEMPATE_CR_POR_ESCALAFON['83']).toBe('83')
    // El 19 NO es el desempate de Administrativa.
    expect(DESEMPATE_CR_POR_ESCALAFON['83']).not.toBe('19')
  })
})
