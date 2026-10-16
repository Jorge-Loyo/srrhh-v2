// Helpers de formato compartidos por las slides. Localización es-AR (punto como
// separador de miles, coma decimal) para coincidir con la presentación original.

const nfEntero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

// Formateadores de % cacheados por cantidad de decimales (0, 1, 2…). Evita
// construir un Intl.NumberFormat nuevo en cada celda.
const nfPctCache = new Map<number, Intl.NumberFormat>()
function nfPctFor(decimales: number): Intl.NumberFormat {
  let nf = nfPctCache.get(decimales)
  if (!nf) {
    nf = new Intl.NumberFormat('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
    nfPctCache.set(decimales, nf)
  }
  return nf
}

/** 42390 → "42.390". null/undefined → "—". */
export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return nfEntero.format(n)
}

/** 46 → "+46", -78 → "-78", 0 → "0". null → "—". */
export function fmtDif(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n > 0) return `+${nfEntero.format(n)}`
  return nfEntero.format(n)
}

/**
 * 0.11 → "0,11 %", -18.36 → "-18,36 %". null → "—".
 * `decimales` controla la precisión (S4 usa 2, S5 usa 0 → "25 %").
 */
export function fmtPct(n: number | null | undefined, decimales = 2): string {
  if (n === null || n === undefined) return '—'
  return `${nfPctFor(decimales).format(n)} %`
}

/**
 * Clase de color Obelisco según signo. Positivo → success, negativo → danger,
 * cero/sin dato → gris neutro. Centraliza la regla visual de "verde sube / rojo
 * baja" que se repite en las columnas Dif. y % de varias slides.
 */
export function colorSigno(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return 'text-gray-500'
  return n > 0 ? 'text-success' : 'text-danger'
}
