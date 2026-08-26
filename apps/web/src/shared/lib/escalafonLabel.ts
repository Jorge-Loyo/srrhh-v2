// Pedido de Jorge (2026-08-26): mostrar "CPH" en vez de "Médicos" en los
// dropdowns de escalafón (primero en PersonasPage, luego en CargosPage) —
// solo el label visual. El value real (id del escalafón) no cambia,
// Escalafon.nombre en la base sigue siendo "Médicos" — esto no toca datos
// ni el back, es puramente cosmético en la UI.
export function escalafonLabel(nombre: string): string {
  return nombre === 'Médicos' ? 'CPH' : nombre
}
