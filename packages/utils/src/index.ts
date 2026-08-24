// =============================================================================
// SRRHH v2 — Utilidades compartidas
// =============================================================================

/**
 * Formatea un CUIL con guiones: 20-12345678-9
 */
export function formatCuil(cuil: string): string {
  if (!cuil || cuil.length !== 11) return cuil
  return `${cuil.slice(0, 2)}-${cuil.slice(2, 10)}-${cuil.slice(10)}`
}

/**
 * Limpia un CUIL removiendo guiones y espacios
 */
export function cleanCuil(cuil: string): string {
  return cuil.replace(/[-\s]/g, '')
}

/**
 * Valida formato de CUIL (11 dígitos)
 */
export function isValidCuil(cuil: string): boolean {
  const clean = cleanCuil(cuil)
  return /^\d{11}$/.test(clean)
}

/**
 * Formatea una fecha ISO a formato argentino: dd/mm/yyyy
 */
export function formatDateAR(isoDate: string | null | undefined): string {
  if (!isoDate) return '—'
  const date = new Date(isoDate)
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * Formatea una fecha ISO a formato argentino con hora: dd/mm/yyyy HH:mm
 */
export function formatDateTimeAR(isoDate: string | null | undefined): string {
  if (!isoDate) return '—'
  const date = new Date(isoDate)
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Formatea un número con separador de miles argentino
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('es-AR')
}

/**
 * Capitaliza la primera letra de cada palabra
 */
export function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Trunca un string a N caracteres con ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

/**
 * Debounce helper
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

/**
 * Sleep helper para async/await
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Genera un UUID v4 (para uso en cliente)
 */
export function uuid(): string {
  return crypto.randomUUID()
}
