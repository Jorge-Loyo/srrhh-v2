/**
 * Derivación automática del RÉGIMEN de un cargo a partir de su código de
 * registro (CR) y, para dos CRs, del literal del puesto.
 *
 * Es la FUENTE DE VERDAD ÚNICA de la regla CR→régimen (cascada + 2 excepciones
 * por literal). La reutilizan el pipeline del padrón, la conducción y el
 * backfill. Molde: derivarCodigoRegistro.ts.
 *
 * El NÚCLEO (`derivarRegimen`) es PURO: recibe el CR y el literal del puesto YA
 * normalizado, y devuelve la decisión, sin tocar Prisma ni normalizar nada. Es
 * determinístico y testeable con fixtures en memoria (ver
 * derivarRegimen.unit.test.ts).
 *
 * El WRAPPER (`derivarRegimenId`) normaliza el literal crudo, delega en el
 * núcleo y traduce el nombre del régimen a su id vía un mapa pre-cargado (ctx),
 * sin query por fila.
 *
 * Regla (confirmada por el usuario):
 *   - La mayoría de los CR mapean 1:1 a un régimen (CR_A_REGIMEN).
 *   - CR '85' se divide por literal del puesto: los auxiliares de enfermería
 *     (AUXILIARES_ENFERMERIA_85) van a 'Nueva Carrera de Enfermería'; el resto
 *     a 'Carrera Técnica'.
 *   - CR '83' se divide por literal del puesto: los puestos del Anexo II
 *     (ANEXO_II_83) van a 'Carrera Administrativa anexo II'; el resto a
 *     'Carrera Administrativa'.
 *   - CR vacío o fuera del mapeo → null + marca de revisión. NO se adivina.
 */

import { normalizarTexto } from '@srrhh/normalizacion'

export interface DecisionRegimen {
  regimenNombre: string | null
  revision?: { motivo: string }
}

export const MOTIVO_REGIMEN_NO_DERIVABLE =
  'Régimen no derivable automáticamente (cargo sin código de registro, o CR fuera del mapeo de regímenes)'

// ─── Constantes versionadas — FUENTE DE VERDAD de la regla CR→régimen ─────────
// Todos los literales están normalizados (minúsculas, sin acento, trim) y se
// comparan por IGUALDAD EXACTA (no por prefijo). Anclados a los literales
// reales de prisma/catalogo-puestos-curado.json.

/** Literales del CR '85' que van a 'Nueva Carrera de Enfermería' (el resto → Técnica). */
export const AUXILIARES_ENFERMERIA_85 = new Set<string>(['auxiliar de enfermeria'])

/**
 * Los 9 literales reales del Anexo II del CR '83' (1 compuesto + 8 simples).
 * NO incluir variantes separadas del 'ayudante' ni match por prefijo.
 */
export const ANEXO_II_83 = new Set<string>([
  'radioperador',
  'oxigenista',
  'morguero',
  'cuidador enfermero de animales',
  'chofer de funcionario',
  'chofer de ambulancia',
  'capellan',
  'camillero',
  'ayudante de laboratorio, hemoterapia, farmacia y drogueria',
])

/**
 * Mapeo 1:1 CR→nombre de régimen. El '85' y el '83' NO van acá: tienen
 * excepción por literal y se resuelven en el núcleo.
 */
export const CR_A_REGIMEN = new Map<string, string>([
  ['22', 'Nueva Carrera Profesional Hospitalaria'],
  ['37', 'Nueva Carrera Profesional Hospitalaria'],
  ['23', 'Nueva Carrera Profesional Hospitalaria'],
  ['87', 'Nueva Carrera de Enfermería'],
  ['65', 'Carrera Administrativa'],
  ['19', 'Carrera Administrativa'],
  ['70', 'Cuerpo de Especialistas Profesionales'],
  ['60', 'Carrera Gerencial'],
  ['25', 'Autoridades Superiores'],
  ['17', 'Planta Gerencial'],
  ['17B', 'Planta Transitoria Módulo Operativo'],
  ['16T', 'Planta Transitoria Módulo Operativo'],
  ['07', 'Docentes'],
  ['7', 'Docentes'],
  ['24', 'Residentes'],
])

/**
 * NÚCLEO PURO — sin Prisma, sin normalizar. Recibe el CR y el literal del
 * puesto YA normalizado (minúsculas/sin tilde/trim) para ser determinístico.
 *
 * @param cr Código de registro del cargo (`CodigoRegistro.codigo`), puede ser null/''.
 * @param literalPuestoNormalizado Literal del puesto ya normalizado (sólo lo usan 85 y 83).
 */
export function derivarRegimen(
  cr: string | null,
  literalPuestoNormalizado: string,
): DecisionRegimen {
  const codigo = (cr ?? '').trim()

  if (codigo === '') {
    return { regimenNombre: null, revision: { motivo: MOTIVO_REGIMEN_NO_DERIVABLE } }
  }

  // Excepción por literal — CR '85' se divide en Enfermería vs Técnica.
  if (codigo === '85') {
    return {
      regimenNombre: AUXILIARES_ENFERMERIA_85.has(literalPuestoNormalizado)
        ? 'Nueva Carrera de Enfermería'
        : 'Carrera Técnica',
    }
  }

  // Excepción por literal — CR '83' se divide en Anexo II vs Administrativa.
  if (codigo === '83') {
    return {
      regimenNombre: ANEXO_II_83.has(literalPuestoNormalizado)
        ? 'Carrera Administrativa anexo II'
        : 'Carrera Administrativa',
    }
  }

  // Mapeo 1:1.
  const nombre = CR_A_REGIMEN.get(codigo)
  if (nombre) {
    return { regimenNombre: nombre }
  }

  // No derivable (CR fuera del mapeo): NULL + revisión. No se adivina.
  return { regimenNombre: null, revision: { motivo: MOTIVO_REGIMEN_NO_DERIVABLE } }
}

/**
 * WRAPPER con acceso a datos (mapa pre-cargado, sin query por fila). Normaliza
 * el literal crudo, delega en el núcleo puro y traduce el nombre del régimen a
 * su id vía `ctx.regimenPorNombre`.
 *
 * @param codigoRegistroCodigo `CodigoRegistro.codigo` del cargo (puede ser null).
 * @param literalPuestoRaw Literal del puesto SIN normalizar (lo normaliza acá).
 * @param ctx.regimenPorNombre Mapa nombre→{ id, nombre } del catálogo `regimenes`.
 */
export function derivarRegimenId(
  codigoRegistroCodigo: string | null,
  literalPuestoRaw: string | null,
  ctx: { regimenPorNombre: Map<string, { id: string; nombre: string }> },
): { regimenId: string | null; revision?: { motivo: string } } {
  const literalNormalizado = normalizarTexto(literalPuestoRaw)
  const decision = derivarRegimen(codigoRegistroCodigo, literalNormalizado)

  if (decision.regimenNombre === null) {
    return { regimenId: null, revision: decision.revision }
  }

  const regimen = ctx.regimenPorNombre.get(decision.regimenNombre)
  if (!regimen) {
    const motivo = `régimen derivado "${decision.regimenNombre}" no existe en el catálogo regimenes`
    // Defensa en profundidad: el núcleo derivó un nombre que el catálogo no
    // tiene (catálogo desactualizado). Se avisa una vez y se marca a revisión.
    console.warn(`[derivarRegimenId] ${motivo}`)
    return { regimenId: null, revision: { motivo } }
  }

  return { regimenId: regimen.id }
}
