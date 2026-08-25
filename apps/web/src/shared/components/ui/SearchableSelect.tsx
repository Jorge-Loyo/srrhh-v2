import { useEffect, useRef, useState } from 'react'

interface SearchableSelectProps {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder: string
  className?: string
}

// Combobox con búsqueda — para dropdowns de texto libre con muchas opciones
// (ej. los 276 "puesto" distintos de PersonasPage), donde un <select> nativo
// obliga a scrollear a mano. Escribir filtra la lista; clickear una opción
// confirma el valor; clickear afuera descarta lo tipeado sin confirmar y
// vuelve al valor real (no deja "a medio escribir" como estado del filtro).
export function SearchableSelect({ value, onChange, options, placeholder, className }: SearchableSelectProps) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Si el value cambia desde afuera (ej. se resetea el filtro al cambiar de
  // puesto en un dropdown en cascada), sincronizar el texto mostrado.
  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery(value)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [value])

  const filtered = query.trim() ? options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase())) : options

  function selectOption(opt: string) {
    onChange(opt)
    setQuery(opt)
    setOpen(false)
  }

  function clear() {
    onChange('')
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            setQuery(value)
          }
        }}
        className="h-10 px-3 border border-gray-300 rounded w-full focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded shadow-lg">
          {value && (
            <button
              type="button"
              onClick={clear}
              className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 border-b border-gray-100"
            >
              {placeholder}
            </button>
          )}
          {filtered.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">Sin resultados</p>}
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => selectOption(opt)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                opt === value ? 'bg-yellow-50 font-medium text-gray-900' : 'text-gray-700'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
