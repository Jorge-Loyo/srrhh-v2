import {
  deduplicarOcupacionesHistorico,
  filtrarGestionablesVivas,
  type OcupacionHistorico,
} from './padron.historico.helpers.js'

// FASE 2 (histórico denso, design §C.4): el paso 7 pasó a DENSO acotado al
// subuniverso gestionable. Dos partes puras y testeables DB-free:
//  (b) filtrar la dotación viva candidata con esCargoGestionable (quedarse solo
//      con los '83' que son Anexo II), y
//  (c) deduplicar (roles con diff) ∪ (gestionables vivos) por id_sial_rol,
//      porque un rol gestionable que además tuvo diff aparece en ambos y
//      padron_historico NO tiene unique (snapshot_id, id_sial_rol).

// Literal real del Anexo II (ya normalizado) para los '83' que ENTRAN.
const LITERAL_ANEXO_II = 'capellan'

function ocup(idSialRol: string, codigo: string | null, literalPuesto: string | null): OcupacionHistorico {
  return {
    idSialRol,
    cargo: {
      literalPuesto,
      codigoRegistro: codigo === null ? null : { codigo },
    },
  }
}

describe('filtrarGestionablesVivas — reusa esCargoGestionable sobre la rama del 83', () => {
  it('conserva los códigos plenos y descarta los 83 que NO son Anexo II', () => {
    const entrada = [
      ocup('r-pleno-37', '37', 'cualquier literal'),
      ocup('r-83-anexo', '83', LITERAL_ANEXO_II),
      ocup('r-83-no-anexo', '83', 'administrativo'),
      ocup('r-sin-codigo', null, LITERAL_ANEXO_II),
    ]
    const salida = filtrarGestionablesVivas(entrada)
    expect(salida.map((o) => o.idSialRol).sort()).toEqual(['r-83-anexo', 'r-pleno-37'])
  })

  it('normaliza el literal del 83 igual que el pipeline (acentos/mayúsculas/espacios)', () => {
    const entrada = [ocup('r-83-cap', '83', '  Capellán  ')]
    expect(filtrarGestionablesVivas(entrada).map((o) => o.idSialRol)).toEqual(['r-83-cap'])
  })
})

describe('deduplicarOcupacionesHistorico — por id_sial_rol', () => {
  it('un rol que aparece en ambos conjuntos queda UNA sola vez', () => {
    const conDiff = [ocup('A', '37', null), ocup('B', '22', null)]
    const vivas = [ocup('B', '22', null), ocup('C', '85', null)]
    const salida = deduplicarOcupacionesHistorico(conDiff, vivas)
    expect(salida.map((o) => o.idSialRol)).toEqual(['A', 'B', 'C'])
  })

  it('preserva los roles con diff NO gestionables (ej. 24/07) que no están en vivas', () => {
    const conDiff = [ocup('res-24', '24', null), ocup('doc-07', '07', null)]
    const vivas = [ocup('gest-37', '37', null)]
    const salida = deduplicarOcupacionesHistorico(conDiff, vivas)
    expect(salida.map((o) => o.idSialRol).sort()).toEqual(['doc-07', 'gest-37', 'res-24'])
  })

  it('sin solapamiento, concatena ambos conjuntos (diff primero, luego vivas)', () => {
    const conDiff = [ocup('A', '37', null)]
    const vivas = [ocup('B', '22', null)]
    expect(deduplicarOcupacionesHistorico(conDiff, vivas).map((o) => o.idSialRol)).toEqual(['A', 'B'])
  })

  it('conjuntos vacíos → resultado vacío', () => {
    expect(deduplicarOcupacionesHistorico<OcupacionHistorico>([], [])).toEqual([])
  })
})
