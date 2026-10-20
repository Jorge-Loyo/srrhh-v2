// Módulo compartido para los dos gráficos de "Evolución de dotación" (§6.1 del
// diseño): orden canónico de las series por situación de revista + un mapa
// estable estado→color. Al asignar color por CLAVE (no por índice de
// aparición), la serie `activo` de una carrera es siempre del mismo color y
// ocupa la misma posición de leyenda, exista o no `comision`/`retencion` ese
// mes. Lo usan `EvolucionDotacionChart` (tarjetas) y `EvolucionEspecialidadChart`
// (consulta individual) para color/orden consistentes.
import { ORDEN_SITUACION_REVISTA } from '@srrhh/types'

// Claves sintéticas de las dos líneas derivadas (NO son estados del catálogo):
// la línea TOTAL (count DISTINCT cuil, campo `total`) y la línea "activos y
// comisionados" (campo `activosYComisionados`).
export const CLAVE_TOTAL = '(total)'
export const CLAVE_ACTIVOS_Y_COMISIONADOS = '(activos y comisionados)'

// Reexport del orden canónico de @srrhh/types para que ambos charts importen de
// un solo lugar. Los estados no listados van después, ordenados alfabéticamente.
export { ORDEN_SITUACION_REVISTA }

// Color + variante tenue (para áreas/líneas finas) por estilo de serie.
export interface EstiloSerie {
  color: string
  colorLight: string
  dashed?: boolean
}

// Mapa fijo estado→color (§6.1): activo=verde, comision=ámbar,
// retencion de cargo=gris-azul, (sin dato)=gris tenue, TOTAL=azul oscuro/grueso,
// "activos y comisionados"=verde punteado.
const ESTILOS: Record<string, EstiloSerie> = {
  'activo': { color: '#2D7D46', colorLight: '#DCFCE7' },
  'comision': { color: '#B45309', colorLight: '#FEF3C7' },
  'retencion de cargo': { color: '#5B6FA8', colorLight: '#E0E7FF' },
  '(sin dato)': { color: '#9CA3AF', colorLight: '#F3F4F6' },
  [CLAVE_TOTAL]: { color: '#0F3D6B', colorLight: '#DBEAFE' },
  [CLAVE_ACTIVOS_Y_COMISIONADOS]: { color: '#2D7D46', colorLight: '#DCFCE7', dashed: true },
}

// Paleta de reserva para un 4º estado inesperado (§9): se asigna por hash
// estable de la clave para que el color no cambie entre cargas.
const PALETA_RESERVA: EstiloSerie[] = [
  { color: '#7C3AED', colorLight: '#EDE9FE' },
  { color: '#C2410C', colorLight: '#FFEDD5' },
  { color: '#BE185D', colorLight: '#FCE7F3' },
  { color: '#0369A1', colorLight: '#E0F2FE' },
  { color: '#4D7C0F', colorLight: '#ECFCCB' },
]

// Hash determinístico (djb2) de la clave → índice en la paleta de reserva.
function hashKey(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i)
  return Math.abs(h)
}

// Estilo estable para una clave de serie (estado del catálogo, TOTAL o
// "activos y comisionados"); un valor inesperado cae en la paleta de reserva
// por hash estable de la clave.
export function estiloSerie(clave: string): EstiloSerie {
  return ESTILOS[clave] ?? PALETA_RESERVA[hashKey(clave) % PALETA_RESERVA.length]!
}

// Índice en el orden canónico (los no listados van al final, pero el
// desempate alfabético lo hace `ordenarSituaciones`).
function indiceCanonico(s: string): number {
  const i = (ORDEN_SITUACION_REVISTA as readonly string[]).indexOf(s)
  return i === -1 ? ORDEN_SITUACION_REVISTA.length : i
}

// Ordena una lista de situaciones de revista en el orden canónico §6.1:
// activo, comision, retencion de cargo, (sin dato), y luego cualquier valor
// inesperado ordenado alfabéticamente entre sí.
export function ordenarSituaciones(situaciones: readonly string[]): string[] {
  return [...situaciones].sort((a, b) => {
    const ia = indiceCanonico(a)
    const ib = indiceCanonico(b)
    if (ia !== ib) return ia - ib
    return a.localeCompare(b, 'es')
  })
}

// ─── Color por CARRERA (código de registro) ─────────────────────────────────
// Para que cada tarjeta de "Evolución de dotación" tenga un color propio en su
// línea total, se asigna un color estable por código de registro. Los códigos
// conocidos tienen un color fijo; cualquier otro cae en la paleta de reserva
// por hash estable del código (no cambia entre cargas).
const COLOR_CARRERA: Record<string, EstiloSerie> = {
  '37': { color: '#0F3D6B', colorLight: '#DBEAFE' }, // CPH — azul oscuro
  '22': { color: '#2563EB', colorLight: '#DBEAFE' }, // CPH (código secundario) — azul
  '87': { color: '#BE185D', colorLight: '#FCE7F3' }, // Enfermería — magenta
  '83': { color: '#C2410C', colorLight: '#FFEDD5' }, // Administrativa — naranja
  '19': { color: '#C2410C', colorLight: '#FFEDD5' }, // Escalafón General (Admin) — naranja
  '85': { color: '#0D9488', colorLight: '#CCFBF1' }, // CEETPS — teal
  '24': { color: '#7C3AED', colorLight: '#EDE9FE' }, // Residencias — violeta
  '23': { color: '#0369A1', colorLight: '#E0F2FE' }, // Salud-Guardias — celeste
  '07': { color: '#4D7C0F', colorLight: '#ECFCCB' }, // Docentes Históricos — verde oliva
  '60': { color: '#9333EA', colorLight: '#F3E8FF' }, // Carrera Gerencial — púrpura
  '25': { color: '#B45309', colorLight: '#FEF3C7' }, // Autoridades Superiores — ámbar
  '70': { color: '#0891B2', colorLight: '#CFFAFE' }, // Cuerpo Especialistas — cian
  '17': { color: '#DB2777', colorLight: '#FCE7F3' }, // Gabinete — rosa
  '65': { color: '#CA8A04', colorLight: '#FEF9C3' }, // Plantas Transitorias Acta — dorado
  '16T': { color: '#65A30D', colorLight: '#ECFCCB' }, // Plantas Transitorias Mod. Op. — lima
  '17B': { color: '#DC2626', colorLight: '#FEE2E2' }, // Régimen Modular Extraordinario — rojo
}

// Paleta de reserva para códigos no listados (colores distintos de los fijos).
const PALETA_CARRERA: EstiloSerie[] = [
  { color: '#7C3AED', colorLight: '#EDE9FE' },
  { color: '#DB2777', colorLight: '#FCE7F3' },
  { color: '#0891B2', colorLight: '#CFFAFE' },
  { color: '#CA8A04', colorLight: '#FEF9C3' },
  { color: '#4D7C0F', colorLight: '#ECFCCB' },
  { color: '#9333EA', colorLight: '#F3E8FF' },
  { color: '#0369A1', colorLight: '#E0F2FE' },
  { color: '#C2410C', colorLight: '#FFEDD5' },
]

// Color estable para una carrera por su código de registro. Código conocido →
// color fijo; cualquier otro → paleta de reserva por hash estable del código.
export function colorCarrera(codigo: string): EstiloSerie {
  return COLOR_CARRERA[codigo] ?? PALETA_CARRERA[hashKey(codigo) % PALETA_CARRERA.length]!
}

// Etiqueta legible de un estado para la leyenda.
export function etiquetaSituacion(s: string): string {
  if (s === CLAVE_TOTAL) return 'Total'
  if (s === CLAVE_ACTIVOS_Y_COMISIONADOS) return 'Activos y comisionados'
  if (s === '(sin dato)') return 'Sin dato'
  // Estados del catálogo vienen en minúscula sin tilde → capitalizar.
  return s.charAt(0).toUpperCase() + s.slice(1)
}
