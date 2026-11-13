import { CR_POR_CODIGO_ESCALAFON_GESTIONADO, NOMBRE_ESCALAFON_CPH_NUEVO } from '@srrhh/types'

type CrRef = { codigo: string }
type EscalafonEtiqueta = { codigo: string; nombre: string; codigosRegistro?: CrRef[] }
const ES_NUMERICO = /^\d+$/
/**
 * Código a mostrar: el código de registro (CR), no `escalafones.codigo`.
 *  1. Si el escalafón es gestionado, el CR principal del mapa (en la base ACTUAL la CPH es el escalafón '22'
 *     cuyo CR principal es 37; en la NUEVA ya es el '37'; el mapa devuelve '37' en los dos casos).
 *  2. Si `escalafones.codigo` es numérico, ese mismo.
 *  3. Si no es numérico (código autogenerado, ej. 'Docentes-c32a65d'), el CR del escalafón
 *     (el menor si hubiera varios); si no tiene ninguno, '' (la etiqueta muestra solo el nombre).
 * Solo cambia la etiqueta, no el valor enviado.
 */
export function codigoMostradoCarrera(codigo: string, codigosRegistro?: CrRef[]): string {
  const c = codigo.trim()
  const mapeado = CR_POR_CODIGO_ESCALAFON_GESTIONADO[c]
  if (mapeado) return mapeado
  if (ES_NUMERICO.test(c)) return c
  const crs = (codigosRegistro ?? []).map((cr) => cr.codigo.trim()).filter(Boolean)
  crs.sort((x, y) => x.localeCompare(y, 'es', { numeric: true }))
  return crs[0] ?? ''
}
/** Compara códigos mostrados: numérico, y los sin código ('') al final. */
function compararCodigoMostrado(a: string, b: string): number {
  if (!a !== !b) return a ? -1 : 1
  return a.localeCompare(b, 'es', { numeric: true })
}
/**
 * Nombres mostrados que prevalecen sobre `escalafones.nombre` (solo etiqueta, igual que en el Excel).
 * Está indexado por el código MOSTRADO, así que tolera los dos nombres del escalafón CPH:
 *  - base actual: código '22', nombre "Nueva Carrera Prof. Hosp"  -> se muestra "37 — Nueva Carrera Profesional Hospitalaria";
 *  - base nueva:  código '37', nombre "Nueva Carrera Profesional Hospitalaria" -> idem (el override es redundante).
 * CUÁNDO RETIRARLO: cuando producción ya esté en la base nueva (comprobar `select codigo, nombre from escalafones
 * where codigo = '37'` -> nombre nuevo, y que no exista el '22'). Entonces se puede borrar este mapa y usar
 * `c.nombre` directo; hasta entonces es necesario porque el catálogo viejo todavía trae "Prof. Hosp".
 */
const NOMBRE_MOSTRADO_POR_CODIGO: Readonly<Record<string, string>> = {
  '37': NOMBRE_ESCALAFON_CPH_NUEVO,
}

/** Etiqueta 'CÓDIGO — Nombre' con el código de registro; sin código muestra solo el nombre. */
export function etiquetaCarrera(c: EscalafonEtiqueta): string {
  const mostrado = codigoMostradoCarrera(c.codigo, c.codigosRegistro)
  const nombre = NOMBRE_MOSTRADO_POR_CODIGO[mostrado] ?? c.nombre
  return mostrado ? `${mostrado} — ${nombre}` : nombre
}

/** Etiqueta 'CÓDIGO — Literal' con el código de registro real (Reportes: 22 y 37 van separados). */
export function etiquetaCarreraCR(c: { codigo: string; literal: string }): string {
  return `${c.codigo.trim()} — ${c.literal}`
}

/** Carreras de código de registro ordenadas por etiqueta (numérico, es), sin unificar códigos. */
export function ordenarCarrerasCR<T extends { codigo: string; literal: string }>(carreras: T[]): T[] {
  return [...carreras].sort((a, b) =>
    etiquetaCarreraCR(a).localeCompare(etiquetaCarreraCR(b), 'es', { numeric: true }),
  )
}

/**
 * Opciones 'CÓDIGO — Nombre' para un selector de carrera a partir de escalafones,
 * ordenadas por código (numérico). Misma etiqueta que /cargos/alta. `valor` elige
 * qué se emite (por defecto el id).
 */
export function opcionesCarreraEscalafon(
  escalafones: (EscalafonEtiqueta & { id: string })[],
  valor: (e: EscalafonEtiqueta & { id: string }) => string = (e) => e.id,
): { value: string; label: string }[] {
  return [...escalafones]
    .sort((a, b) =>
      compararCodigoMostrado(
        codigoMostradoCarrera(a.codigo, a.codigosRegistro),
        codigoMostradoCarrera(b.codigo, b.codigosRegistro),
      ),
    )
    .map((e) => ({ value: valor(e), label: etiquetaCarrera(e) }))
}

/**
 * Carreras para FILTROS: la CPH (escalafón cuyo código se muestra como otro, ej. 22 → 37)
 * se divide en una opción por código de registro ('22' y '37'), con value `cr:{id}`.
 * El resto de los escalafones queda como una opción con value = id del escalafón.
 */
export function opcionesCarreraConCodigosSeparados(
  escalafones: (EscalafonEtiqueta & { id: string })[],
  codigosRegistro: { id: string; codigo: string; escalafonId: string }[],
  opts: {
    valor?: (e: EscalafonEtiqueta & { id: string }) => string
    valorCr?: (cr: { id: string; codigo: string }) => string
  } = {},
): { value: string; label: string }[] {
  const valor = opts.valor ?? ((e) => e.id)
  const valorCr = opts.valorCr ?? ((cr) => `cr:${cr.id}`)
  const out: { sort: string; value: string; label: string }[] = []
  for (const e of escalafones) {
    // Se divide según los CR del escalafón (no según su código): vale con escalafón '22' (nombre viejo) o '37'.
    const mostrado = codigoMostradoCarrera(e.codigo)
    const crs = codigosRegistro.filter(
      (cr) => cr.escalafonId === e.id && CR_POR_CODIGO_ESCALAFON_GESTIONADO[cr.codigo.trim()] === mostrado,
    )
    if (crs.length > 1) {
      const nombre = NOMBRE_MOSTRADO_POR_CODIGO[codigoMostradoCarrera(e.codigo)] ?? e.nombre
      for (const cr of crs) {
        out.push({ sort: cr.codigo.trim(), value: valorCr(cr), label: `${cr.codigo.trim()} — ${nombre}` })
      }
    } else {
      const propios = e.codigosRegistro ?? codigosRegistro.filter((cr) => cr.escalafonId === e.id)
      const conCr = { ...e, codigosRegistro: propios }
      out.push({ sort: codigoMostradoCarrera(e.codigo, propios), value: valor(e), label: etiquetaCarrera(conCr) })
    }
  }
  return out
    .sort((a, b) => compararCodigoMostrado(a.sort, b.sort))
    .map(({ value, label }) => ({ value, label }))
}
