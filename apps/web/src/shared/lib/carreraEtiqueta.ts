import { CR_POR_CODIGO_ESCALAFON_GESTIONADO, NOMBRE_ESCALAFON_CPH_NUEVO } from '@srrhh/types'

/**
 * Código a mostrar: el código de registro principal si el escalafón lo tiene
 * definido (en la base ACTUAL la CPH es un único escalafón '22' cuyo CR principal es 37; en la base NUEVA
 * ya es el escalafón '37'); si no, el propio `escalafones.codigo`. Solo cambia la etiqueta, no el valor enviado.
 * Con el escalafón '37' el mapa devuelve '37' (identidad): funciona igual en los dos estados de la base.
 */
export function codigoMostradoCarrera(codigo: string): string {
  const c = codigo.trim()
  return CR_POR_CODIGO_ESCALAFON_GESTIONADO[c] ?? c
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

/** Etiqueta 'CÓDIGO — Nombre' con el código de registro principal. */
export function etiquetaCarrera(c: { codigo: string; nombre: string }): string {
  const mostrado = codigoMostradoCarrera(c.codigo)
  return `${mostrado} — ${NOMBRE_MOSTRADO_POR_CODIGO[mostrado] ?? c.nombre}`
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
  escalafones: { id: string; codigo: string; nombre: string }[],
  valor: (e: { id: string; codigo: string; nombre: string }) => string = (e) => e.id,
): { value: string; label: string }[] {
  return [...escalafones]
    .sort((a, b) =>
      codigoMostradoCarrera(a.codigo).localeCompare(codigoMostradoCarrera(b.codigo), 'es', { numeric: true }),
    )
    .map((e) => ({ value: valor(e), label: etiquetaCarrera(e) }))
}

/**
 * Carreras para FILTROS: la CPH (escalafón cuyo código se muestra como otro, ej. 22 → 37)
 * se divide en una opción por código de registro ('22' y '37'), con value `cr:{id}`.
 * El resto de los escalafones queda como una opción con value = id del escalafón.
 */
export function opcionesCarreraConCodigosSeparados(
  escalafones: { id: string; codigo: string; nombre: string }[],
  codigosRegistro: { id: string; codigo: string; escalafonId: string }[],
  opts: {
    valor?: (e: { id: string; codigo: string; nombre: string }) => string
    valorCr?: (cr: { id: string; codigo: string }) => string
  } = {},
): { value: string; label: string }[] {
  const valor = opts.valor ?? ((e) => e.id)
  const valorCr = opts.valorCr ?? ((cr) => `cr:${cr.id}`)
  const out: { sort: string; value: string; label: string }[] = []
  for (const e of escalafones) {
    const dividir = codigoMostradoCarrera(e.codigo) !== e.codigo.trim()
    const crs = dividir
      ? codigosRegistro.filter(
          (cr) => cr.escalafonId === e.id && Object.keys(CR_POR_CODIGO_ESCALAFON_GESTIONADO).includes(cr.codigo.trim()) && CR_POR_CODIGO_ESCALAFON_GESTIONADO[cr.codigo.trim()] === codigoMostradoCarrera(e.codigo),
        )
      : []
    if (crs.length > 1) {
      const nombre = NOMBRE_MOSTRADO_POR_CODIGO[codigoMostradoCarrera(e.codigo)] ?? e.nombre
      for (const cr of crs) {
        out.push({ sort: cr.codigo.trim(), value: valorCr(cr), label: `${cr.codigo.trim()} — ${nombre}` })
      }
    } else {
      out.push({ sort: codigoMostradoCarrera(e.codigo), value: valor(e), label: etiquetaCarrera(e) })
    }
  }
  return out
    .sort((a, b) => a.sort.localeCompare(b.sort, 'es', { numeric: true }))
    .map(({ value, label }) => ({ value, label }))
}
