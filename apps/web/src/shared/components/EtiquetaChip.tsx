import type { Etiqueta } from '@srrhh/types'

// Chip de solo lectura de una etiqueta, con su color (mismo estilo que los chips
// de EtiquetasControl: fondo tenue + texto/borde saturado; gris si no hay color).
export function EtiquetaChip({ etiqueta }: { etiqueta: Pick<Etiqueta, 'nombre' | 'color'> }) {
  const base = etiqueta.color && /^#[0-9a-fA-F]{6}$/.test(etiqueta.color) ? etiqueta.color : '#4b5563'
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: `${base}1a`, color: base, borderColor: `${base}55` }}
    >
      {etiqueta.nombre}
    </span>
  )
}

// Lista compacta: muestra las primeras `max` y un "+N" con tooltip (title) con el resto.
export function EtiquetasChips({ etiquetas, max = 3 }: { etiquetas: Pick<Etiqueta, 'id' | 'nombre' | 'color'>[]; max?: number }) {
  if (etiquetas.length === 0) return <span className="text-gray-400">—</span>
  const visibles = etiquetas.slice(0, max)
  const resto = etiquetas.slice(max)
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visibles.map((e) => (
        <EtiquetaChip key={e.id} etiqueta={e} />
      ))}
      {resto.length > 0 && (
        <span
          className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 cursor-help"
          title={resto.map((e) => e.nombre).join(', ')}
          aria-label={`${resto.length} etiquetas más: ${resto.map((e) => e.nombre).join(', ')}`}
        >
          +{resto.length}
        </span>
      )}
    </div>
  )
}
