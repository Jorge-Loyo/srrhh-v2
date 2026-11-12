import { NOMBRES_ESCALAFON_CPH } from '@srrhh/types'
// ─── Escalafón CPH con dos estados de base ───────────────────────────────────
//
// Base actual de producción: escalafón código '22', nombre "Nueva Carrera Prof. Hosp".
// Base nueva (sync-cargos-msgc, Fase 2): código '37', nombre "Nueva Carrera Profesional Hospitalaria".
// El padrón y otros orígenes de texto pueden traer CUALQUIERA de los dos nombres, y el código se despliega antes
// o después del cambio de base: todo lookup por NOMBRE del escalafón debe tolerar los dos.
// Si el mapa tiene UNO de los dos nombres, agrega el otro apuntando al mismo valor. `clave` normaliza el nombre
// igual que las claves del mapa (por defecto, el nombre tal cual).
export function completarAliasEscalafonCph<T>(mapa: Map<string, T>, clave: (nombre: string) => string = (n) => n): void {
  const presente = NOMBRES_ESCALAFON_CPH.map((n) => mapa.get(clave(n))).find((v) => v !== undefined)
  if (presente === undefined) return
  for (const n of NOMBRES_ESCALAFON_CPH) if (!mapa.has(clave(n))) mapa.set(clave(n), presente)
}
