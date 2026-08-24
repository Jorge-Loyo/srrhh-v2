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
