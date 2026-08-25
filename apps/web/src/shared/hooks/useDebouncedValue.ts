import { useEffect, useState } from 'react'

// S3-6: debounce genérico — separa lo que el usuario escribe (estado local,
// se actualiza en cada tecla, input siempre responsive) de lo que dispara la
// query (se actualiza recién delayMs después de la última tecla).
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
