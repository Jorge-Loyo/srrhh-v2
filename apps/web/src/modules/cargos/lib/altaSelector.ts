// Resuelve el valor emitido por el selector compartido (siempre un id real) al
// objeto del catálogo. Nunca por nombre: puestos homónimos tienen ids distintos.
export function resolverSeleccionAlta<T extends { id: string }>(valores: string[], lista: T[]): T | null {
  const id = valores[0]
  return id ? lista.find((x) => x.id === id) ?? null : null
}
