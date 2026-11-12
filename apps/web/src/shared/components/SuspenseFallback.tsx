/**
 * Fallback de Suspense para el lazy-loading de páginas (ver router.tsx).
 * Reusa el mismo spinner que ya usan OrganigramaDetallePage y otras vistas
 * mientras cargan datos (borde primary + animate-spin), para que la carga de
 * un chunk de ruta se vea igual que cualquier carga en curso del sistema.
 */
export function SuspenseFallback() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
    </div>
  )
}
