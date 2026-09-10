import { useEffect, useRef, useState } from 'react'

interface MultiSelectDropdownProps {
  label: string
  value: string[]
  options: string[]
  onChange: (value: string[]) => void
  className?: string
}

// Primer multi-select del proyecto (no existía ninguno reutilizable, solo
// SearchableSelect de selección única) — filtro de checkboxes con búsqueda,
// pensado para la pantalla de Dotación (9 filtros multi-valor tipo legacy).
// Mismo patrón de "click afuera cierra" que SearchableSelect.
export function MultiSelectDropdown({ label, value, options, onChange, className }: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const q = query.trim().toLowerCase()
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q)) : options

  function toggle(opt: string) {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt])
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`h-10 px-3 border rounded w-full text-left text-sm flex items-center justify-between gap-2 focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary ${
          value.length > 0 ? 'border-secondary text-gray-900' : 'border-gray-300 text-gray-500'
        }`}
      >
        <span className="truncate">
          {label}
          {value.length > 0 && ` (${value.length})`}
        </span>
        <svg aria-hidden="true" className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[220px] max-h-72 overflow-y-auto bg-white border border-gray-200 rounded shadow-lg">
          <div className="p-2 border-b border-gray-100 sticky top-0 bg-white flex items-center justify-between gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar..."
              className="h-8 px-2 border border-gray-200 rounded flex-1 text-sm focus:outline-none focus:border-secondary"
            />
            {value.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="text-xs text-gray-400 hover:text-gray-600 shrink-0">
                Limpiar
              </button>
            )}
          </div>
          {filtered.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">Sin opciones</p>}
          {filtered.map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={value.includes(opt)} onChange={() => toggle(opt)} className="accent-secondary" />
              <span className="truncate">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
