import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Extrae el mensaje de error del envelope { error: { code, message, details } }
// que devuelve error.handler.ts en la API. Si no matchea esa forma (ej. error
// de red, sin conexión), cae a un mensaje genérico.
export function getApiErrorMessage(error: unknown): string {
  const data = (error as { response?: { data?: { error?: { message?: string } } } })?.response
    ?.data
  return data?.error?.message ?? 'Ocurrió un error inesperado. Intentá de nuevo.'
}

// Capitaliza solo la primera letra de la cadena, para mostrar valores que en
// la BD están en minúscula (puestos, especialidades — normalizados en S21).
// Es SOLO presentación: no cambia el dato guardado. Devuelve '' si es nulo.
export function capitalizar(texto: string | null | undefined): string {
  if (!texto) return ''
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

// Palabras cortas de enlace que van en minúscula (salvo si son la 1ª palabra).
const PALABRAS_MINUSCULA = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'o', 'u', 'en', 'a'])

// ¿La palabra es un acrónimo que hay que dejar tal cual? Heurística: toda en
// mayúsculas (ignorando dígitos/símbolos) y corta (≤4 letras) — cubre SS, APS,
// SAME, DG, UPE, etc. "HOSPITALES"/"CENTRAL" NO son acrónimos (largas) y se
// capitalizan normal.
function esAcronimo(palabra: string): boolean {
  const letras = palabra.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '')
  return letras.length > 0 && letras.length <= 4 && letras === letras.toUpperCase()
}

// Etiqueta "tipo título" en español: primera letra de cada palabra en mayúscula
// y el resto en minúscula, EXCEPTO acrónimos (se dejan en mayúscula) y palabras
// de enlace (de/la/del… en minúscula, salvo la primera). Pensada para mostrar
// valores de catálogo que vienen TODO EN MAYÚSCULAS o con capitalización
// inconsistente (universo totalizador, tipo de hospital). Solo presentación.
export function capitalizarEtiqueta(texto: string | null | undefined): string {
  if (!texto) return ''
  const palabras = texto.trim().split(/\s+/)
  return palabras
    .map((p, i) => {
      const lower = p.toLocaleLowerCase('es')
      // Palabra de enlace (de/la/del…) va en minúscula salvo si abre la frase.
      // Se chequea ANTES que acrónimo para que "DE"/"LA" en mayúsculas también
      // bajen (si no, "DE" calificaría como acrónimo y quedaría en mayúscula).
      if (i > 0 && PALABRAS_MINUSCULA.has(lower)) return lower
      if (esAcronimo(p)) return p
      return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1)
    })
    .join(' ')
}
