import { ConcursosListaTab } from '@/modules/concursos-cph/components/ConcursosListaTab'
import { useBandejaGestion } from '@/modules/cargos/hooks/useBandejaGestion'
import type { ConcursoCphFilters } from '@srrhh/types'

// Hook para /concursos/ceetps: CEETPS que ya superaron Etapa 1 (estado !=
// sin_autorizar). El backend filtra esto cuando tipo='ceetps'.
function useConcursosCeetpsEtapa2(filters: ConcursoCphFilters) {
  return useBandejaGestion({
    ...filters,
    tipo: 'ceetps',
  } as ConcursoCphFilters)
}

export function ConcursosCeetpsPage() {
  return (
    <ConcursosListaTab
      titulo="Concursos CEETPS"
      descripcion="Concursos CEETPS autorizados por SGRASV (Etapa 2 en adelante)."
      useData={useConcursosCeetpsEtapa2}
      variante="ceetps"
      ocultarEtapa1
    />
  )
}
