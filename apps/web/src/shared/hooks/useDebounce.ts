import { useEffect, useState } from 'react'

// S3-6: búsqueda con debounce 300ms — genérico, cualquier página de listado
// con búsqueda libre lo puede reusar (PersonasPage hoy, CargosPage si hace
// falta más adelante).
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
