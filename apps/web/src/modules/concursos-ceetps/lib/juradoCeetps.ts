import type { JuradoCeetpsDto } from '@srrhh/types'

// Etapa 2 del wizard CEETPS: jurado asignado a mano. Está completo cuando los
// lugares (titulares y suplentes) están definidos y todos cubiertos.

type Rol = 'titular' | 'suplente'

export function lugaresLibres(j: JuradoCeetpsDto | null | undefined, rol: Rol): number {
  const cant = rol === 'titular' ? j?.cantTitulares : j?.cantSuplentes
  if (cant == null) return 0
  const asignados = j?.miembros.filter((m) => m.rol === rol).length ?? 0
  return Math.max(0, cant - asignados)
}

export function faltantesJurado(j: JuradoCeetpsDto | null | undefined): string[] {
  if (j?.cantTitulares == null || j?.cantSuplentes == null) {
    return ['Definir cuántos titulares y suplentes tiene el jurado']
  }
  const faltan: string[] = []
  for (const rol of ['titular', 'suplente'] as const) {
    const n = lugaresLibres(j, rol)
    if (n === 1) faltan.push(`Falta asignar 1 ${rol}`)
    else if (n > 1)
      faltan.push(`Faltan asignar ${n} ${rol === 'titular' ? 'titulares' : 'suplentes'}`)
  }
  return faltan
}

export function juradoCompleto(j: JuradoCeetpsDto | null | undefined): boolean {
  return faltantesJurado(j).length === 0
}
