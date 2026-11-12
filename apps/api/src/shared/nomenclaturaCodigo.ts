// ─────────────────────────────────────────────────────────────────────────────
// Interruptor de la nomenclatura de códigos de cargo.
//
//   NOMENCLATURA_CODIGO_CARGO=legacy (DEFAULT)  generador anterior: CPH-POF/POU, TEC-POF/POU, RG-CG, AS-MIN...,
//                                               reemplazantes con sufijo (CPH-POF-R-000001).
//   NOMENCLATURA_CODIGO_CARGO=msgc              acrónimos del Excel MSGC: CPH-P, CPH-G, TEC, GER, AS...,
//                                               reemplazantes con prefijo (R-CPH-P-000001).
//
// El modo `msgc` solo se activa junto con la base recodificada por scripts/sync-cargos-msgc (si se activa antes,
// se mezclarían prefijos viejos y nuevos y se rompería el secuencial por prefijo). El script de sincronización
// NO lee esta variable: usa siempre los acrónimos MSGC.
//
// Se lee en cada llamada (no al importar) para poder cambiarla en tests. Un valor inválido falla fuerte:
// es preferible no arrancar a generar códigos con la nomenclatura equivocada.
// ─────────────────────────────────────────────────────────────────────────────
export type NomenclaturaCodigoCargo = 'msgc' | 'legacy'

export const VARIABLE_NOMENCLATURA = 'NOMENCLATURA_CODIGO_CARGO'

export function nomenclaturaCodigoCargo(valor: string | undefined = process.env[VARIABLE_NOMENCLATURA]): NomenclaturaCodigoCargo {
  const v = (valor ?? '').trim().toLowerCase()
  if (v === '' || v === 'legacy') return 'legacy'
  if (v === 'msgc') return 'msgc'
  throw new Error(`${VARIABLE_NOMENCLATURA} invalida ("${valor}"): usar "msgc" o "legacy".`)
}
