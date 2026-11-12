/**
 * Derivación automática del código de registro (CR) para cargos nuevos.
 *
 * El NÚCLEO (`decidirCodigoRegistro`) es PURO: recibe la lista de CRs del
 * escalafón + el texto de CR del padrón ya resuelto, y devuelve la decisión,
 * sin tocar Prisma. Es testeable con fixtures en memoria (ver
 * derivarCodigoRegistro.unit.test.ts, molde tareas.unit.test.ts).
 *
 * El WRAPPER (`derivarCodigoRegistroId`) sólo lee mapas pre-cargados (ctx) y
 * delega en el núcleo — no ejecuta queries (los call-sites cargan el catálogo
 * una sola vez y le pasan los mapas).
 *
 * Cascada (sólo PREVENCIÓN, nunca backfill):
 *   1. El padrón trajo 'CODIGO DE REGISTRO' no vacío que resuelve a un CR del
 *      catálogo → se usa ESE (autoridad, comportamiento actual).
 *   2. Vacío/no resuelto y el escalafón tiene UN SOLO CR → ese CR.
 *   3. Vacío/no resuelto y el escalafón tiene VARIOS CRs → tabla de desempate
 *      explícita (DESEMPATE_CR_POR_ESCALAFON).
 *   4. Escalafón sin CR, o multi-CR sin entrada de desempate → NULL + marca de
 *      revisión. NO se adivina.
 */

/** Un CR del catálogo, forma mínima para decidir. */
export interface CrCatalogo {
  id: string
  codigo: string
}

export interface DecisionCr {
  codigoRegistroId: string | null
  revision?: { motivo: string }
}

/**
 * Desempate por defecto cuando el escalafón tiene varios CRs y el padrón no
 * trajo CR. Clave = `Escalafon.codigo`, valor = `CodigoRegistro.codigo` por
 * defecto.
 *
 * Criterio (confirmado por el usuario):
 *  - '22' (CPH / Carrera de Profesionales de la Salud) → '37': la carrera
 *    profesional vigente, NO la histórica '22'.
 *  - '83' (Carrera Administrativa / Escalafón General) → '83': la nueva
 *    carrera, NO el '19' (Escalafón General histórico).
 *
 * Fácil de extender: agregar `'<escalafon>': '<cr-por-defecto>'`.
 */
export const DESEMPATE_CR_POR_ESCALAFON: Record<string, string> = {
  '22': '37',
  '83': '83',
}

export const MOTIVO_CR_NO_DERIVABLE =
  'Código de registro no derivable automáticamente (escalafón ambiguo o sin CR en catálogo)'

/**
 * NÚCLEO PURO — sin Prisma. Aplica la cascada 1→4.
 */
export function decidirCodigoRegistro(args: {
  /** `Escalafon.codigo` del cargo (para el desempate). */
  escalafonCodigo: string | null
  /** Todos los CR cuyo `escalafonId` == el del cargo. */
  crsDelEscalafon: CrCatalogo[]
  /** Texto 'CODIGO DE REGISTRO' del padrón (puede ser '' / null). */
  codigoRegistroDelPadron: string | null
  /** El CR ya resuelto del texto, si resolvió; si no, null. */
  crDelPadron: CrCatalogo | null
}): DecisionCr {
  const { escalafonCodigo, crsDelEscalafon, codigoRegistroDelPadron, crDelPadron } = args

  // Regla 1 — el padrón trajo CR y resuelve: autoridad, se usa tal cual.
  const textoPadron = (codigoRegistroDelPadron ?? '').trim()
  if (textoPadron !== '' && crDelPadron) {
    return { codigoRegistroId: crDelPadron.id }
  }

  // A partir de acá el texto del padrón vino vacío o no resolvió a un CR del
  // catálogo: se intenta derivar desde el escalafón.

  // Regla 2 — un solo CR en el escalafón: determinístico.
  if (crsDelEscalafon.length === 1) {
    return { codigoRegistroId: crsDelEscalafon[0]!.id }
  }

  // Regla 3 — multi-CR con desempate explícito presente en el catálogo.
  if (crsDelEscalafon.length > 1 && escalafonCodigo) {
    const codigoDesempate = DESEMPATE_CR_POR_ESCALAFON[escalafonCodigo]
    if (codigoDesempate) {
      const elegido = crsDelEscalafon.find((cr) => cr.codigo === codigoDesempate)
      if (elegido) return { codigoRegistroId: elegido.id }
    }
  }

  // Regla 4 — no derivable (0 CRs, o multi-CR sin desempate aplicable): NULL +
  // revisión. No se adivina.
  return { codigoRegistroId: null, revision: { motivo: MOTIVO_CR_NO_DERIVABLE } }
}

/**
 * WRAPPER con acceso a datos (mapas pre-cargados, sin query por fila).
 * Resuelve el CR del texto del padrón y los CRs del escalafón desde `ctx`, y
 * delega en el núcleo puro.
 */
export function derivarCodigoRegistroId(
  escalafonId: string,
  codigoRegistroDelPadron: string | null,
  ctx: {
    /** escalafonId -> Escalafon.codigo */
    escalafonCodigoPorId: Map<string, string>
    /** escalafonId -> CR[] (catálogo COMPLETO de ese escalafón) */
    crsPorEscalafonId: Map<string, CrCatalogo[]>
    /** CodigoRegistro.codigo -> CR */
    crPorCodigo: Map<string, CrCatalogo>
  },
): DecisionCr {
  const texto = (codigoRegistroDelPadron ?? '').trim()
  const crDelPadron = texto !== '' ? (ctx.crPorCodigo.get(texto) ?? null) : null
  return decidirCodigoRegistro({
    escalafonCodigo: ctx.escalafonCodigoPorId.get(escalafonId) ?? null,
    crsDelEscalafon: ctx.crsPorEscalafonId.get(escalafonId) ?? [],
    codigoRegistroDelPadron,
    crDelPadron,
  })
}
