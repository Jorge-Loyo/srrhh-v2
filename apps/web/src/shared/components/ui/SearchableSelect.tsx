import { useEffect, useRef, useState } from 'react'

interface SearchableSelectProps {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder: string
  className?: string
}

// Reportado por Jorge: escribir "medico" no encontraba "Médico de Planta" en
// el dropdown — .toLowerCase() no saca acentos. NFD descompone cada letra
// acentuada en base + diacrítico combinante (ej. "é" -> "e" + un diacrítico
// aparte); \p{Diacritic} (Unicode property escape, JS nativo, sin librería)
// saca esos diacríticos sueltos.
function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
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

  const q = normalize(query.trim())
  const filtered = q ? options.filter((o) => normalize(o).includes(q)) : options

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
        onClick={() => setOpen(true)}
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
        // pr-8: deja lugar a la flechita de abajo — sin esto, este input se
        // ve idéntico a un buscador de texto libre y no como un desplegable
        // (reportado por Jorge: "parece que desapareció el dropdown").
        className="h-10 pl-3 pr-8 border border-gray-300 rounded w-full cursor-text focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
      />
      {/* Flechita de desplegable — puramente visual (decorativa, por eso
          pointer-events-none y aria-hidden), el click real lo maneja el
          input de arriba. Gira al abrir, mismo affordance que un <select>. */}
      <svg
        aria-hidden="true"
        className={`absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none transition-transform ${
          open ? 'rotate-180' : ''
        }`}
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" />
      </svg>
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded shadow-lg">
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
