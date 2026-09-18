import { useEffect, useMemo, useRef, useState } from 'react'
import type { Etiqueta } from '@srrhh/types'
import {
  useEtiquetas,
  useCrearEtiqueta,
  useAsignarEtiqueta,
  useDesasignarEtiqueta,
} from '../hooks/useEtiquetas'
import { useToast } from '@/shared/components/ui/useToast'

interface EtiquetasControlProps {
  concursoCphId: string
  /** Etiquetas ya asignadas al concurso (aplanadas por el backend). */
  asignadas: Etiqueta[]
  /** compacto: chips más chicos, para filas de tabla. */
  variant?: 'normal' | 'compacto'
}

// Paleta por defecto para etiquetas nuevas (nombre CSS → estilos Tailwind-like inline).
const COLORES_SUGERIDOS = [
  '#2563eb', // azul
  '#16a34a', // verde
  '#dc2626', // rojo
  '#d97706', // ámbar
  '#7c3aed', // violeta
  '#0891b2', // cyan
  '#db2777', // rosa
  '#4b5563', // gris
]

// Deriva estilos de chip (fondo tenue + texto/borde saturado) desde un color
// hex. Si no hay color, usa gris. Mantiene buen contraste sin depender de
// clases dinámicas de Tailwind (que no se pueden generar en runtime).
function chipStyle(color: string | null): React.CSSProperties {
  const base = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#4b5563'
  return {
    backgroundColor: `${base}1a`, // ~10% alpha
    color: base,
    borderColor: `${base}55`,
  }
}

export function EtiquetasControl({
  concursoCphId,
  asignadas,
  variant = 'normal',
}: EtiquetasControlProps) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [colorNueva, setColorNueva] = useState(COLORES_SUGERIDOS[0])
  const contenedorRef = useRef<HTMLDivElement>(null)

  const { data: catalogo = [] } = useEtiquetas()
  const crear = useCrearEtiqueta()
  const asignar = useAsignarEtiqueta()
  const desasignar = useDesasignarEtiqueta()
  const { toast, ToastUI } = useToast()

  // Cerrar el dropdown al hacer click afuera.
  useEffect(() => {
    if (!abierto) return
    const onClick = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false)
        setBusqueda('')
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [abierto])

  const idsAsignadas = useMemo(() => new Set(asignadas.map((e) => e.id)), [asignadas])

  // Etiquetas del catálogo que aún NO están asignadas, filtradas por búsqueda.
  const disponibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return catalogo
      .filter((e) => !idsAsignadas.has(e.id))
      .filter((e) => !q || e.nombre.toLowerCase().includes(q))
  }, [catalogo, idsAsignadas, busqueda])

  // ¿La búsqueda coincide exactamente con una etiqueta existente (asignada o no)?
  const nombreExacto = busqueda.trim()
  const existeExacta =
    !!nombreExacto && catalogo.some((e) => e.nombre.toLowerCase() === nombreExacto.toLowerCase())

  const busy = asignar.isPending || desasignar.isPending || crear.isPending

  async function handleAsignar(etiquetaId: string) {
    try {
      await asignar.mutateAsync({ etiquetaId, concursoCphId })
      setBusqueda('')
    } catch {
      toast.error('No se pudo asignar la etiqueta')
    }
  }

  async function handleQuitar(etiquetaId: string) {
    try {
      await desasignar.mutateAsync({ etiquetaId, concursoCphId })
    } catch {
      toast.error('No se pudo quitar la etiqueta')
    }
  }

  async function handleCrearYAsignar() {
    const nombre = nombreExacto
    if (!nombre) return
    try {
      const nueva = await crear.mutateAsync({ nombre, color: colorNueva })
      await asignar.mutateAsync({ etiquetaId: nueva.id, concursoCphId })
      setBusqueda('')
      toast.success(`Etiqueta "${nombre}" creada y asignada`)
    } catch {
      toast.error('No se pudo crear la etiqueta (¿nombre repetido?)')
    }
  }

  const chipClases =
    variant === 'compacto'
      ? 'inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] font-medium'
      : 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium'

  return (
    <div className="relative inline-flex flex-wrap items-center gap-1" ref={contenedorRef}>
      {asignadas.map((e) => (
        <span key={e.id} className={chipClases} style={chipStyle(e.color)}>
          {e.nombre}
          <button
            type="button"
            onClick={() => handleQuitar(e.id)}
            disabled={busy}
            className="ml-0.5 leading-none opacity-60 hover:opacity-100 disabled:opacity-30"
            title="Quitar etiqueta"
            aria-label={`Quitar etiqueta ${e.nombre}`}
          >
            ×
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={
          variant === 'compacto'
            ? 'inline-flex items-center rounded-full border border-dashed border-gray-300 px-1.5 py-0 text-[10px] text-gray-500 hover:border-gray-400 hover:text-gray-700'
            : 'inline-flex items-center rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700'
        }
        title="Agregar etiqueta"
      >
        + Etiqueta
      </button>

      {abierto && (
        <div className="absolute top-full left-0 z-50 mt-1 w-60 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="p-2">
            <input
              autoFocus
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar o crear etiqueta..."
              className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-secondary focus:outline-none"
            />
          </div>

          <div className="max-h-48 overflow-y-auto px-1 pb-1">
            {disponibles.length === 0 && !nombreExacto && (
              <p className="px-2 py-2 text-xs text-gray-400">
                {catalogo.length === 0
                  ? 'No hay etiquetas. Escribí un nombre para crear una.'
                  : 'Todas las etiquetas ya están asignadas.'}
              </p>
            )}
            {disponibles.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => handleAsignar(e.id)}
                disabled={busy}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-50 disabled:opacity-50"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: e.color ?? '#4b5563' }}
                />
                {e.nombre}
              </button>
            ))}
          </div>

          {/* Crear nueva cuando hay texto y no coincide exactamente con una existente */}
          {nombreExacto && !existeExacta && (
            <div className="border-t border-gray-100 p-2">
              <div className="mb-2 flex items-center gap-1">
                {COLORES_SUGERIDOS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColorNueva(c)}
                    className={`h-4 w-4 rounded-full border-2 ${colorNueva === c ? 'border-gray-700' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={handleCrearYAsignar}
                disabled={busy}
                className="w-full rounded bg-secondary px-2 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                + Crear "{nombreExacto}"
              </button>
            </div>
          )}
        </div>
      )}

      {ToastUI}
    </div>
  )
}
