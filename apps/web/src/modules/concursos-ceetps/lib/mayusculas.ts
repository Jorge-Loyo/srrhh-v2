import type { FormEvent } from 'react'

// En los concursos CEETPS todo texto libre se escribe en MAYÚSCULAS. Se engancha
// UNA vez en el contenedor del wizard (onChangeCapture): corre antes que el
// onChange de cada campo, así el estado ya recibe el valor en mayúsculas.
// Quedan fuera los campos que no son texto (email, número, fecha, teléfono,
// contraseña…) y los marcados con data-no-upper.

const TIPOS_DE_TEXTO = new Set(['', 'text', 'search'])

export function aMayusculas(valor: string): string {
  return valor.toLocaleUpperCase('es-AR')
}

export function alEscribirMayusculas(e: FormEvent<HTMLElement>): void {
  const t = e.target as HTMLInputElement | HTMLTextAreaElement
  const esTextarea = t.tagName === 'TEXTAREA'
  const esInput = t.tagName === 'INPUT' && TIPOS_DE_TEXTO.has((t as HTMLInputElement).type)
  if (!esTextarea && !esInput) return
  if (t.hasAttribute('data-no-upper')) return
  const mayus = aMayusculas(t.value)
  if (mayus === t.value) return
  // Preserva la posición del cursor (asignar value lo manda al final).
  const { selectionStart, selectionEnd } = t
  t.value = mayus
  try {
    t.setSelectionRange(selectionStart, selectionEnd)
  } catch {
    /* algunos tipos de input no admiten selección */
  }
}

// Clase para mostrar también en mayúsculas lo que ya estaba guardado en minúscula.
export const CLASE_MAYUSCULAS =
  '[&_input:not([type])]:uppercase [&_input[type=text]]:uppercase [&_input[type=search]]:uppercase [&_textarea]:uppercase [&_input[data-no-upper]]:normal-case'
