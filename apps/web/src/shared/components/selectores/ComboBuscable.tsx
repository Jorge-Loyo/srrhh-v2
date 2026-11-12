import { useEffect, useMemo, useRef, useState } from 'react'
import {
  alternarValor,
  filtrarOpciones,
  quitarVisibles,
  seleccionarTodosVisibles,
  type Opcion,
} from '@/shared/lib/selectorCpe'

// Combo escribible con búsqueda. Modo 'multiple': se tildan varias opciones y se
// muestran como chips. Modo 'unico': click selecciona y cierra. value/label
// pueden diferir (value = clave canónica o id).
export interface ComboBuscableProps {
  label: string
  options: Opcion[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder: string
  modo?: 'multiple' | 'unico'
  disabled?: boolean
  requerido?: boolean
  emptyText?: string
}

export function ComboBuscable({
  label,
  options,
  selected,
  onChange,
  placeholder,
  modo = 'multiple',
  disabled,
  requerido,
  emptyText = 'Sin coincidencias',
}: ComboBuscableProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  const unico = modo === 'unico'

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const labelDe = useMemo(() => {
    const m = new Map(options.map((o) => [o.value, o.label]))
    return (v: string) => m.get(v) ?? v
  }, [options])

  const filtradas = useMemo(() => filtrarOpciones(options, query), [options, query])

  function elegir(v: string) {
    if (unico) {
      onChange([v])
      setOpen(false)
      setQuery('')
    } else {
      onChange(alternarValor(selected, v))
    }
  }

  // En modo único, cerrado, el input muestra la etiqueta elegida.
  const valorInput = unico && !open && selected.length > 0 ? labelDe(selected[0]!) : query

  return (
    <div className="relative" ref={boxRef}>
      <label className="block text-xs text-gray-500 mb-1">
        {label}
        {requerido && <span className="text-danger">*</span>}
        {!unico && selected.length > 0 && (
          <span className="text-secondary font-semibold"> ({selected.length})</span>
        )}
      </label>

      <input
        type="text"
        disabled={disabled}
        value={valorInput}
        placeholder={placeholder}
        onFocus={() => !disabled && setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary disabled:bg-gray-100"
      />

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full rounded border border-gray-200 bg-white shadow-lg text-sm">
          {!unico && (
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 text-xs">
              <button
                type="button"
                onClick={() => onChange(seleccionarTodosVisibles(selected, filtradas))}
                className="text-secondary hover:underline"
              >
                Seleccionar todos{query ? ' (filtrados)' : ''}
              </button>
              <button
                type="button"
                onClick={() => onChange(quitarVisibles(selected, filtradas))}
                className="text-gray-500 hover:underline"
              >
                Ninguno
              </button>
            </div>
          )}
          {unico && !requerido && selected.length > 0 && (
            <div className="px-3 py-1.5 border-b border-gray-100 text-xs">
              <button
                type="button"
                onClick={() => {
                  onChange([])
                  setOpen(false)
                  setQuery('')
                }}
                className="text-gray-500 hover:underline"
              >
                Quitar selección
              </button>
            </div>
          )}
          <ul className="max-h-56 overflow-y-auto">
            {filtradas.map((o) => {
              const on = selectedSet.has(o.value)
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => elegir(o.value)}
                    className={`flex w-full items-center gap-2 text-left px-3 py-2 hover:bg-gray-50 ${on ? 'font-semibold text-secondary' : 'text-gray-700'}`}
                  >
                    <span className={`inline-block h-4 w-4 flex-shrink-0 rounded border ${on ? 'bg-secondary border-secondary text-white' : 'border-gray-300'}`}>
                      {on && <span className="block text-center text-xs leading-4">✓</span>}
                    </span>
                    {o.label}
                  </button>
                </li>
              )
            })}
            {filtradas.length === 0 && <li className="px-3 py-2 text-gray-400">{emptyText}</li>}
          </ul>
        </div>
      )}

      {/* Chips de lo seleccionado — debajo del input para no desalinear la grilla */}
      {!unico && selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {selected.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs rounded px-2 py-0.5"
            >
              {labelDe(v)}
              <button
                type="button"
                onClick={() => onChange(alternarValor(selected, v))}
                className="text-blue-400 hover:text-blue-700"
                aria-label={`Quitar ${labelDe(v)}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
