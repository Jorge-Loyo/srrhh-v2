import { FiltrosCatalogo, type FiltrosCatalogoValores } from './FiltrosCatalogo'
import { capitalizar } from '@/shared/lib/utils'

// S21: un grupo de la cascada de catálogo, con los IDs que van al backend y un
// snapshot de labels (solo presentación) resueltos al momento de fijar el grupo.
// Se guardan los labels para que el chip no tenga que re-consultar el catálogo
// (el puesto/especialidad pueden ser de un escalafón distinto al seleccionado).
export interface GrupoCatalogo {
  reparticionId: string
  escalafonId: string
  modalidad: '' | 'pof' | 'pou'
  puestoCargoId: string
  especialidadPuestoId: string
  // Labels legibles (presentación) — no se mandan al backend.
  labels?: {
    reparticion?: string
    escalafon?: string
    modalidad?: string
    puesto?: string
    especialidad?: string
  }
}

// ¿El grupo aporta alguna condición? (algún id de catálogo seteado)
export function grupoTieneFiltro(g: FiltrosCatalogoValores): boolean {
  return Boolean(
    g.reparticionId || g.escalafonId || g.modalidad || g.puestoCargoId || g.especialidadPuestoId,
  )
}

// Serializa los grupos al formato que espera el backend (?grupos=JSON): solo
// los IDs de catálogo, sin labels ni claves vacías.
export function serializarGrupos(grupos: GrupoCatalogo[]): string {
  const limpios = grupos.map((g) => {
    const o: Record<string, string> = {}
    if (g.reparticionId) o.hospitalId = g.reparticionId
    if (g.escalafonId) o.escalafonId = g.escalafonId
    if (g.modalidad) o.modalidad = g.modalidad
    if (g.puestoCargoId) o.puestoCargoId = g.puestoCargoId
    if (g.especialidadPuestoId) o.especialidadPuestoId = g.especialidadPuestoId
    return o
  })
  return JSON.stringify(limpios)
}

function textoGrupo(g: GrupoCatalogo): string {
  const l = g.labels ?? {}
  const partes = [
    l.reparticion,
    l.escalafon,
    l.modalidad,
    l.puesto && capitalizar(l.puesto),
    l.especialidad && capitalizar(l.especialidad),
  ].filter(Boolean)
  return partes.length ? partes.join(' · ') : 'Filtro'
}

interface Props {
  // Grupo en edición (la cascada activa).
  valores: FiltrosCatalogoValores
  onChange: (cambios: Partial<FiltrosCatalogoValores>) => void
  // Grupos ya fijados (uniones OR).
  grupos: GrupoCatalogo[]
  // Fija el grupo en edición como una nueva unión (el contenedor arma el
  // GrupoCatalogo con labels y limpia la cascada).
  onAgregarUnion: () => void
  onQuitarGrupo: (index: number) => void
  mostrarReparticion?: boolean
  mostrarEspecialidad?: boolean
}

// S21: cascada de catálogo + UNIONES (OR). Debajo de la cascada muestra un
// botón "+ Unión" (fija el grupo actual y permite armar otro) y los chips de
// los grupos ya fijados. El backend recibe la unión de todos los grupos + el
// grupo en edición (ver serializarGrupos / personas.service).
export function FiltrosCatalogoUniones({
  valores,
  onChange,
  grupos,
  onAgregarUnion,
  onQuitarGrupo,
  mostrarReparticion = true,
  mostrarEspecialidad = true,
}: Props) {
  const puedeAgregar = grupoTieneFiltro(valores)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <FiltrosCatalogo
          valores={valores}
          onChange={onChange}
          mostrarReparticion={mostrarReparticion}
          mostrarEspecialidad={mostrarEspecialidad}
        />
        <button
          type="button"
          onClick={onAgregarUnion}
          disabled={!puedeAgregar}
          className="h-10 px-3 rounded border border-secondary text-secondary text-sm font-semibold hover:bg-secondary/5 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Agregar este filtro como una unión (OR) y armar otro"
        >
          + Unión
        </button>
      </div>

      {grupos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400">Uniones (O):</span>
          {grupos.map((g, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full bg-secondary/15 px-2.5 py-1 text-xs font-medium text-secondary"
            >
              {textoGrupo(g)}
              <button
                type="button"
                onClick={() => onQuitarGrupo(i)}
                className="ml-0.5 hover:text-secondary/60"
                aria-label={`Quitar unión ${textoGrupo(g)}`}
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
