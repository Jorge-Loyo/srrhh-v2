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
