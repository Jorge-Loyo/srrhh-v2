// El nombre del escalafón se muestra tal cual viene de la BD.
// Anteriormente convertía 'Médicos' → 'CPH' pero ese escalafón fue
// renombrado a 'Carrera Profesional Hospitalaria' en BD (Sprint 7).
export function escalafonLabel(nombre: string): string {
  return nombre
}
