import { useLayoutEffect, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface SearchableSelectProps {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder: string
  className?: string
  disabled?: boolean
  // Para casos donde value es un ID pero options son labels (ej. escalafón, sigla)
  displayToValue?: (label: string) => string
  valueToDisplay?: (value: string) => string
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
export function SearchableSelect({ value, onChange, options, placeholder, className, disabled, displayToValue, valueToDisplay }: SearchableSelectProps) {
  const toDisplay = (v: string) => (valueToDisplay ? valueToDisplay(v) : v)
  const toValue   = (label: string) => (displayToValue ? displayToValue(label) : label)

  const [query, setQuery] = useState(() => toDisplay(value))
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // El panel de opciones se renderiza en un portal a document.body (posición
  // "fixed", coordenadas calculadas del input) en vez de como hijo absoluto
  // del contenedor. Si se lo dejaba como `absolute` dentro de un contenedor
  // con `overflow-y-auto` (ej. el modal de Criterios del sorteo, con muchas
  // especialidades para elegir), el panel quedaba recortado/invisible por el
  // overflow del ancestro aunque tuviera opciones — se abría "vacío" a la
  // vista aunque `filtered` tuviera resultados.
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null)

  useEffect(() => {
    setQuery(toDisplay(value))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      const dentroInput = containerRef.current?.contains(target)
      const dentroPanel = panelRef.current?.contains(target)
      if (!dentroInput && !dentroPanel) {
        setOpen(false)
        setQuery(toDisplay(value))
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const actualizarCoords = () => {
      const el = inputRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setCoords({ top: r.bottom + 4, left: r.left, width: r.width })
    }
    actualizarCoords()
    // `scroll` no burbujea, pero sí se puede capturar en fase de captura sobre
    // cualquier ancestro con scroll (window con `capture: true`).
    window.addEventListener('scroll', actualizarCoords, true)
    window.addEventListener('resize', actualizarCoords)
    return () => {
      window.removeEventListener('scroll', actualizarCoords, true)
      window.removeEventListener('resize', actualizarCoords)
    }
  }, [open])

  const q = normalize(query.trim())
  const filtered = q ? options.filter((o) => normalize(o).includes(q)) : options

  function selectOption(opt: string) {
    const val = toValue(opt)
    onChange(val)
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
        ref={inputRef}
        type="text"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => !disabled && setOpen(true)}
        onClick={() => !disabled && setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            setQuery(toDisplay(value))
          }
        }}
        className={`h-10 pl-3 pr-8 border border-gray-300 rounded w-full focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary ${
          disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'cursor-text'
        }`}
      />
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
      {open && !disabled && coords &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width }}
            className="z-[9999] max-h-64 overflow-y-auto bg-white border border-gray-200 rounded shadow-lg"
          >
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
                  toValue(opt) === value ? 'bg-yellow-50 font-medium text-gray-900' : 'text-gray-700'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
