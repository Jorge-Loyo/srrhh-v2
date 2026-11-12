// "(sin especificar)" es un placeholder interno del import del padrón (puesto con
// literal vacío): no es un puesto real y no debe ofrecerse en ningún selector.
export function esPuestoSinEspecificar(nombre: string | null | undefined): boolean {
  return (nombre ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[()]/g, '').trim() === 'sin especificar'
}

/** Quita el placeholder "(sin especificar)" de una lista de puestos con `nombre`. */
export function sinPuestoSinEspecificar<T extends { nombre: string }>(puestos: T[]): T[] {
  return puestos.filter((p) => !esPuestoSinEspecificar(p.nombre))
}
