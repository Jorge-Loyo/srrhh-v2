import { useState } from 'react'

interface ExportDropdownProps {
  label: string
  onExport: (formato: 'pdf' | 'word') => void
}

/**
 * Botón con menú de 2 opciones (PDF / Word) — usado en Concursos CPH/CEETPS
 * para exportar los documentos de Validación/Autorización. Equivalente al
 * ExportDropdown del legacy (dotacion-rrhh/frontend/src/components/ui/ConcursalesFormFields.jsx),
 * con las clases (`btn-outline`) del sistema de diseño de este proyecto.
 */
export function ExportDropdown({ label, onExport }: ExportDropdownProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="btn-outline text-xs py-1 px-3">
        ⬇ {label} <span className={`inline-block transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden min-w-[120px]">
            <button
              type="button"
              onClick={() => { onExport('pdf'); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-red-700 transition-colors"
            >
              <span className="w-5 h-5 rounded bg-red-100 flex items-center justify-center text-red-600 text-[9px] font-bold shrink-0">PDF</span>
              PDF
            </button>
            <div className="h-px bg-gray-100" />
            <button
              type="button"
              onClick={() => { onExport('word'); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
            >
              <span className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center text-blue-600 text-[9px] font-bold shrink-0">DOC</span>
              Word
            </button>
          </div>
        </>
      )}
    </div>
  )
}
