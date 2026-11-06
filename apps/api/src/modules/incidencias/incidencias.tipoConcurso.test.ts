import { describe, it, expect } from 'vitest'
import { tipoConcursoDeCargo, esCargoGestionable } from './incidencias.gestionable.js'
import { ANEXO_II_83 } from '../padron/derivarRegimen.js'

// Un literal real del Anexo II (ya normalizado en ANEXO_II_83) para los casos CEETPS.
const LITERAL_ANEXO_II = 'ayudante de laboratorio, hemoterapia, farmacia y drogueria'

describe('tipoConcursoDeCargo (núcleo único CPH/CEETPS por código de registro)', () => {
  // Tabla de casos confirmada por Jorge (Paso B).
  const casos: Array<{
    codigoRegistro: string | null
    literalPuesto: string | null
    esperado: 'cph' | 'ceetps' | null
  }> = [
    { codigoRegistro: '37', literalPuesto: null, esperado: 'cph' },
    { codigoRegistro: '22', literalPuesto: null, esperado: 'cph' },
    // El '23' AHORA clasifica como CPH (antes faltaba en la regla por escalafón).
    { codigoRegistro: '23', literalPuesto: null, esperado: 'cph' },
    { codigoRegistro: '85', literalPuesto: null, esperado: 'ceetps' },
    { codigoRegistro: '87', literalPuesto: null, esperado: 'ceetps' },
    // El '83' SOLO es CEETPS cuando su literal ∈ ANEXO_II_83.
    { codigoRegistro: '83', literalPuesto: LITERAL_ANEXO_II, esperado: 'ceetps' },
    { codigoRegistro: '83', literalPuesto: 'Administrativo', esperado: null },
    { codigoRegistro: '24', literalPuesto: null, esperado: null },
    { codigoRegistro: '07', literalPuesto: null, esperado: null },
    { codigoRegistro: null, literalPuesto: null, esperado: null },
  ]

  for (const { codigoRegistro, literalPuesto, esperado } of casos) {
    it(`codigo=${codigoRegistro ?? 'null'} literal=${literalPuesto ?? 'null'} → ${esperado ?? 'null'}`, () => {
      expect(tipoConcursoDeCargo({ codigoRegistro, literalPuesto })).toBe(esperado)
    })
  }

  it("el '83' Anexo II es CEETPS con mayúsculas/acentos (se normaliza igual que derivarRegimen)", () => {
    expect(tipoConcursoDeCargo({ codigoRegistro: '83', literalPuesto: 'Capellán' })).toBe('ceetps')
    expect(tipoConcursoDeCargo({ codigoRegistro: '83', literalPuesto: 'Morguero' })).toBe('ceetps')
  })

  it('los 9 literales reales del Anexo II con el 83 dan todos ceetps', () => {
    for (const literal of ANEXO_II_83) {
      expect(tipoConcursoDeCargo({ codigoRegistro: '83', literalPuesto: literal })).toBe('ceetps')
    }
  })

  it('código vacío/espacios/undefined → null (no gestionable)', () => {
    expect(tipoConcursoDeCargo({ codigoRegistro: '', literalPuesto: LITERAL_ANEXO_II })).toBe(null)
    expect(tipoConcursoDeCargo({ codigoRegistro: '   ', literalPuesto: LITERAL_ANEXO_II })).toBe(null)
    expect(tipoConcursoDeCargo({ codigoRegistro: undefined, literalPuesto: LITERAL_ANEXO_II })).toBe(null)
  })
})

describe('consistencia tipoConcursoDeCargo ⟺ esCargoGestionable', () => {
  // Por construcción esCargoGestionable se define sobre tipoConcursoDeCargo;
  // este test cierra la garantía: tipo !== null  ⟺  gestionable.
  const codigos = ['37', '22', '23', '85', '87', '83', '24', '07', '7', '60', '65', '', null]
  const literales = [LITERAL_ANEXO_II, 'Administrativo', 'Capellán', '', null]

  for (const codigoRegistro of codigos) {
    for (const literalPuesto of literales) {
      it(`codigo=${codigoRegistro ?? 'null'} literal=${literalPuesto ?? 'null'}`, () => {
        const tipo = tipoConcursoDeCargo({ codigoRegistro, literalPuesto })
        const gestionable = esCargoGestionable({ codigoRegistro, literalPuesto })
        expect(tipo !== null).toBe(gestionable)
      })
    }
  }
})
