import { esConduccionPorPrefijo } from '../../shared/codigoCargo.js'

// Rango jerárquico de un cargo de conducción: menor = más alto en la pirámide.
// Cuando una misma repartición tiene VARIOS cargos de conducción (ej. un
// Subsecretario y un Jefe de División conviviendo en el mismo nodo), gana el de
// menor rango para que el titular del nodo sea la autoridad, no una jefatura
// subordinada.
//
// UNA sola escala para todas las fuentes de rango (JCAT, prefijo del código,
// escalafón). Antes el JCAT valía `10 + número` (P60 = 70, Z26 = 36) mientras
// el prefijo valía 10–15: un Jefe sin JCAT (15) le ganaba al Director con JCAT
// P60 (70) y un Jefe de Sección Z26 (36) a un Director P60. Caso testigo:
// Hospital Oftalmológico Santa Lucía (40260010).
//
// Escala (nivel de la jefatura): 10 dirección · 11 subdirección · 12 depto ·
// 14 división · 15 unidad · 16 sección. Los cargos sin JCAT cuyo nivel solo se
// infiere del código llevan +0,5 (menos certeza que un JCAT del mismo nivel).

const NIVEL_PG: Record<string, number> = { '0': 10, '1': 11, '2': 12, '3': 14, '4': 15, '5': 16 }
const NIVEL_Z: Record<string, number> = { '2': 12, '4': 14, '6': 16 }

// Nivel de jefatura según el JCAT (P/G: 60–65, Z: 22/24/26/32). null si no es JCAT.
export function nivelPorJcat(codigoJefaturas: string | null | undefined): number | null {
  const j = (codigoJefaturas ?? '').trim().toUpperCase()
  if (!/^[PGZ]\d{2}$/.test(j)) return null
  const ultimo = j.slice(2)
  if (j[0] === 'Z') return NIVEL_Z[ultimo] ?? 15
  return NIVEL_PG[ultimo] ?? 15
}

// Nivel derivado del prefijo del código de cargo, para cargos de conducción sin
// JCAT. Devuelve null si el código no es de conducción.
export function rangoPorPrefijoCodigo(codigoCargo: string | null | undefined): number | null {
  if (!esConduccionPorPrefijo(codigoCargo)) return null
  const c = codigoCargo!.replace(/^(R|TTR)-/, '')
  if (c.startsWith('AS-')) return 0
  if (c.startsWith('RG-CG') || c.startsWith('GER-')) return 1
  if (c.startsWith('CPH-D') || c.startsWith('EG-D')) return 10.5 // dirección
  if (c.startsWith('CPH-SD')) return 11.5 // subdirección
  if (c.startsWith('EG-G')) return 10.5 // gerencial ≈ dirección
  // Jefaturas (depto/división/unidad/sección): el código no distingue el
  // sub-nivel, así que va debajo de cualquier jefatura con JCAT.
  if (c.startsWith('CPH-J') || c.startsWith('TEC-J') || c.startsWith('ENF-J') || c.startsWith('EG-J')) return 16.5
  return 20
}

export function rangoConduccion(
  codigoRegistro: string | undefined,
  codigoJefaturas: string | null,
  escalafon: string | null,
  codigoCargo?: string | null,
): number {
  if (codigoRegistro === '25') return 0 // Autoridades Superiores (ministro/subsecretario/DG)
  if (codigoRegistro === '60') return 1 // Gerencias

  // El JCAT manda la jerarquía REAL por sobre el escalafón (un cargo puede ser
  // "Carrera Gerencial" pero traer un JCAT de nivel alto, y no debe quedar
  // debajo de un Jefe de Depto, ni al revés).
  const nivelJcat = nivelPorJcat(codigoJefaturas)
  if (nivelJcat !== null) return nivelJcat

  const rangoPrefijo = rangoPorPrefijoCodigo(codigoCargo)
  if (rangoPrefijo !== null) return rangoPrefijo

  // Carrera Gerencial SIN JCAT: gerente/subgerente operativo puro (nodos GO/SGO).
  if (escalafon && escalafon.toLowerCase().includes('gerencial')) return 50

  return 99
}
