export interface Opcion {
  value: string
  label: string
}

export type CampoCpe = 'carrera' | 'puesto' | 'especialidad'

export interface SeleccionCpe {
  carrera: string[]
  puesto: string[]
  especialidad: string[]
}

// El backend devuelve puesto/especialidad en MAYÚSCULAS (clave canónica
// normalizada). Para el desplegable se muestra en Capitalización De Palabras,
// respetando siglas entre paréntesis como "(04)".
export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\p{L}/gu, (ch) => ch.toUpperCase())
}

export function filtrarOpciones(options: Opcion[], query: string): Opcion[] {
  const q = query.trim().toLowerCase()
  if (!q) return options
  return options.filter((o) => o.label.toLowerCase().includes(q))
}

export function alternarValor(selected: string[], v: string): string[] {
  return selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]
}

/** Une lo ya elegido con las opciones visibles (no pierde selección previa). */
export function seleccionarTodosVisibles(selected: string[], filtradas: Opcion[]): string[] {
  return [...new Set([...selected, ...filtradas.map((o) => o.value)])]
}

/** Quita de la selección solo las opciones visibles. */
export function quitarVisibles(selected: string[], filtradas: Opcion[]): string[] {
  const visibles = new Set(filtradas.map((o) => o.value))
  return selected.filter((s) => !visibles.has(s))
}

/**
 * Nueva selección al cambiar un campo. Con resetDependientes, cambiar carrera
 * limpia puesto y especialidad, y cambiar puesto limpia especialidad.
 */
export function siguienteSeleccion(
  actual: SeleccionCpe,
  campo: CampoCpe,
  valores: string[],
  { resetDependientes }: { resetDependientes: boolean },
): SeleccionCpe {
  const next: SeleccionCpe = { ...actual, [campo]: valores }
  if (resetDependientes) {
    if (campo === 'carrera') {
      next.puesto = []
      next.especialidad = []
    } else if (campo === 'puesto') {
      next.especialidad = []
    }
  }
  return next
}
