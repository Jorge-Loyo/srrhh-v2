import { ConcursosListaTab } from '@/modules/concursos-cph/components/ConcursosListaTab'
import { useBandejaGestion } from '@/modules/cargos/hooks/useBandejaGestion'
import type { ConcursoCphFilters } from '@srrhh/types'

// Etapa del stepper en la que se muestran los concursos CEETPS: la 2. Ver
// etapaCeetps en apps/api/.../concursosCeetps.calc.ts.
const ETAPA_CEETPS = 2

// Misma vista que "Gestión de Concursos" (/cargos/concurso): reutiliza
// ConcursosListaTab, pero con la fuente acotada a CEETPS en etapa 2. Sin las
// acciones/etiquetas CPH (variante 'ceetps').
function useConcursosCeetpsEtapa2(filters: ConcursoCphFilters) {
  return useBandejaGestion({
    ...filters,
    tipo: 'ceetps',
    etapa: ETAPA_CEETPS,
  } as ConcursoCphFilters)
}

export function ConcursosCeetpsPage() {
  return (
    <ConcursosListaTab
      titulo="Concursos CEETPS"
      descripcion="Concursos CEETPS en etapa 2."
      useData={useConcursosCeetpsEtapa2}
      variante="ceetps"
    />
  )
}
