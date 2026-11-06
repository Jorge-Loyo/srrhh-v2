import { ConcursosListaTab } from '@/modules/concursos-cph/components/ConcursosListaTab'
import { useBandejaGestion } from '../hooks/useBandejaGestion'

// PASO 1b (flujo concursos): "Gestión de Concursos" — la pestaña "Concurso" de
// /cargos. Reutiliza la tabla COMPLETA de CPH (ConcursosListaTab) TAL CUAL, con
// todas sus opciones (stepper de etapas, respaldatoria, sub-estado, etiquetas,
// motivo, filtros avanzados, Acciones con importar CSV / flujo / etiquetar
// varios, ℹ/Ver). La diferencia con /concursos/cph: el TÍTULO ("Gestión de
// Concursos") y la FUENTE de datos, que es MIXTA (CPH + CEETPS) vía
// useBandejaGestion (endpoint /concursos/bandeja-gestion). Para las filas
// CEETPS, los campos CPH-only (stepper/etapas, respaldatoria eeBaja, etiquetas)
// vienen vacíos — Jorge: "que muestren lo que puedan".
//
// Nota sobre acciones CPH-only en la bandeja mixta (se conservan, no se quita
// funcionalidad): Importar CSV sigue importando CPH (POST /concursos-cph/
// importar-csv); el etiquetado masivo opera sobre la entidad concurso_cph, así
// que aplica a las filas CPH (las CEETPS no tienen etiquetas). "Con
// documentación faltante" es un filtro CPH-específico. El ajuste fino de estas
// acciones para CEETPS es un paso posterior.
export function BandejaConcursosPage() {
  return (
    <ConcursosListaTab
      titulo="Gestión de Concursos"
      descripcion="Bandeja de inicio de todos los concursos (CPH y CEETPS). Cuando se autorizan, pasan al flujo que corresponda."
      useData={useBandejaGestion}
    />
  )
}
