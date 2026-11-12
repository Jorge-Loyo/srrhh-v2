import { ComboBuscable } from './ComboBuscable'
import { siguienteSeleccion, type CampoCpe, type Opcion, type SeleccionCpe } from '@/shared/lib/selectorCpe'

// Trío Carrera / Puesto / Especialidad presentacional. Devuelve un Fragment: el
// padre pone la grilla. No resuelve ids: quien lo usa pasa value=id o value=literal.
export interface SelectorCarreraPuestoEspecialidadProps {
  modo: 'multiple' | 'unico'
  valor: SeleccionCpe
  onChange: (next: SeleccionCpe, campo: CampoCpe) => void
  carreraOpciones: Opcion[]
  puestoOpciones: Opcion[]
  especialidadOpciones: Opcion[]
  mostrar?: Partial<Record<CampoCpe, boolean>>
  resetDependientes?: boolean
  disabled?: boolean
  requeridos?: Partial<Record<CampoCpe, boolean>>
  placeholders?: Partial<Record<CampoCpe, string>>
  labels?: Partial<Record<CampoCpe, string>>
  ocultarSiVacio?: { puesto?: boolean; especialidad?: boolean }
}

const PLACEHOLDERS: Record<CampoCpe, string> = {
  carrera: 'Buscar carrera…',
  puesto: 'Buscar puesto…',
  especialidad: 'Buscar especialidad…',
}
const LABELS: Record<CampoCpe, string> = {
  carrera: 'Carrera',
  puesto: 'Puesto',
  especialidad: 'Especialidad',
}

export function SelectorCarreraPuestoEspecialidad({
  modo,
  valor,
  onChange,
  carreraOpciones,
  puestoOpciones,
  especialidadOpciones,
  mostrar,
  resetDependientes,
  disabled,
  requeridos,
  placeholders,
  labels,
  ocultarSiVacio,
}: SelectorCarreraPuestoEspecialidadProps) {
  const reset = resetDependientes ?? modo === 'unico'
  const campos: { campo: CampoCpe; options: Opcion[] }[] = [
    { campo: 'carrera', options: carreraOpciones },
    { campo: 'puesto', options: puestoOpciones },
    { campo: 'especialidad', options: especialidadOpciones },
  ]
  return (
    <>
      {campos.map(({ campo, options }) => {
        if (mostrar?.[campo] === false) return null
        if (campo !== 'carrera' && ocultarSiVacio?.[campo] && options.length === 0) return null
        return (
          <ComboBuscable
            key={campo}
            modo={modo}
            label={labels?.[campo] ?? LABELS[campo]}
            options={options}
            selected={valor[campo]}
            disabled={disabled}
            requerido={requeridos?.[campo]}
            placeholder={placeholders?.[campo] ?? PLACEHOLDERS[campo]}
            onChange={(vals) =>
              onChange(siguienteSeleccion(valor, campo, vals, { resetDependientes: reset }), campo)
            }
          />
        )
      })}
    </>
  )
}
