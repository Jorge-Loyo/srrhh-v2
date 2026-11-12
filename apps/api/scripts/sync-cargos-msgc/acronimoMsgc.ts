// ─────────────────────────────────────────────────────────────────────────────
// Acrónimo MSGC (hoja `Criterios` del Excel) y recodificación del código de cargo.
// Funciones PURAS, sin BD ni datos personales. En Fase 2 se moverá a
// apps/api/src/shared/ cuando lo consuma el generador de códigos.
//
// Los acrónimos son los 23 de la columna Q del Excel (incluye CPH-J-POF y
// CPH-J-POU: así los emite el Excel para las jefaturas CPH).
// ─────────────────────────────────────────────────────────────────────────────
import { normalizarTexto } from '@srrhh/normalizacion'
import { esAnexoIIExcel } from './equivalencias.js'

export const ACRONIMOS_MSGC = [
  'AS', 'CPH-D', 'CPH-G', 'CPH-J-POF', 'CPH-J-POU', 'CPH-P', 'CPH-SD', 'DOC', 'EG', 'EG-J',
  'ENF', 'ENF-J', 'GER', 'PEP', 'PGAB', 'RB', 'RES-J', 'RM', 'RPB', 'SG', 'SGAII', 'TEC', 'TEC-J',
] as const
export type AcronimoMsgc = (typeof ACRONIMOS_MSGC)[number]

export interface EntradaAcronimo {
  /** Código de registro (carrera): '37', '87', '85', '83', '24', '25', '17B', '16T', ... */
  cr: string
  /** Literal del puesto (se normaliza acá). */
  literalPuesto: string
  /** Planta / Guardia (CPH) del Excel: 'Planta', 'Decreto 315', 'POU SAME', 'GUARDIA EAIT', ... */
  plantaGuardia?: string | null
  /** Nivel de conducción: SECC, UNID, DIV, DEPT, DHOS, SDHOS, ... Vacío si no es jefatura/dirección. */
  nivelConduccion?: string | null
  /** El cargo coincide con una línea del árbol (organigrama). Un jefe sin línea es cargo de ejecución. */
  tieneLineaArbol: boolean
  /** La persona figura como reemplazante (solo cambia el prefijo del código, no el acrónimo). */
  reemplazante?: boolean
}

const NIVELES_JEFATURA = new Set(['SECC', 'UNID', 'DIV', 'DEPT'])

const up = (s: string | null | undefined) => String(s ?? '').trim().toUpperCase()

/**
 * Acrónimo del Excel para un cargo, o null si no hay regla (no se inventa).
 * Reglas (Criterios):
 *  - CR 37/22: CPH-D / CPH-SD solo con línea de árbol y nivel DHOS / SDHOS; CPH-J-POF/POU solo con
 *    línea de árbol y nivel de jefatura (POF si es Planta, si no POU); un jefe sin línea es ejecución:
 *    CPH-G si es guardia (planta/guardia distinto de Planta, o el puesto dice GUARDIA), si no CPH-P.
 *  - CR 87 -> ENF; CR 85: Auxiliar de Enfermería -> ENF, resto -> TEC. Con línea de árbol: ENF-J / TEC-J.
 *  - CR 83: Anexo II del Excel -> SGAII (prevalece sobre -J); con línea de árbol -> EG-J; resto EG.
 *    CR 19 / 65 -> EG. CR 70 PEP. CR 24 RB / RPB / RES-J por literal. 07 DOC, 23 SG, 60 GER,
 *    16T RM, 17 y 17B PGAB, 25 AS (todos los CR 25).
 */
export function acronimoMsgc(e: EntradaAcronimo): AcronimoMsgc | null {
  const cr = up(e.cr)
  const puesto = normalizarTexto(e.literalPuesto)
  switch (cr) {
    case '37':
    case '22': {
      const nivel = up(e.nivelConduccion)
      const guardia = (up(e.plantaGuardia) !== '' && up(e.plantaGuardia) !== 'PLANTA') || puesto.includes('guardia')
      if (e.tieneLineaArbol && nivel === 'DHOS') return 'CPH-D'
      if (e.tieneLineaArbol && nivel === 'SDHOS') return 'CPH-SD'
      if (e.tieneLineaArbol && NIVELES_JEFATURA.has(nivel)) {
        return up(e.plantaGuardia) === 'PLANTA' ? 'CPH-J-POF' : 'CPH-J-POU'
      }
      return guardia ? 'CPH-G' : 'CPH-P'
    }
    case '87':
      return e.tieneLineaArbol ? 'ENF-J' : 'ENF'
    case '85':
      if (puesto === 'auxiliar de enfermeria') return 'ENF'
      return e.tieneLineaArbol ? 'TEC-J' : 'TEC'
    case '83':
      if (esAnexoIIExcel(puesto)) return 'SGAII'
      return e.tieneLineaArbol ? 'EG-J' : 'EG'
    case '19':
    case '65':
      return 'EG'
    case '70':
      return 'PEP'
    case '24':
      if (puesto.includes('instructor') || puesto.includes('jefe de residentes')) return 'RES-J'
      if (/post[ -]?basica/.test(puesto)) return 'RPB'
      if (puesto.includes('basica')) return 'RB'
      return null
    case '07':
      return 'DOC'
    case '23':
      return 'SG'
    case '60':
      return 'GER'
    case '16T':
      return 'RM'
    case '17':
    case '17B':
      return 'PGAB'
    case '25':
      return 'AS'
    default:
      return null
  }
}

/** Prefijo de código de cargo: el acrónimo, con `R-` ADELANTE si es reemplazante (R-CPH-G). */
export function prefijoCodigoMsgc(e: EntradaAcronimo): string | null {
  const a = acronimoMsgc(e)
  if (a === null) return null
  return e.reemplazante ? `R-${a}` : a
}

const ACRONIMOS = new Set<string>(ACRONIMOS_MSGC)

/**
 * Recodifica un código del sistema al acrónimo nuevo conservando los 6 dígitos del sistema:
 *   CPH-POF-000123   + CPH-P -> CPH-P-000123
 *   CPH-POU-R-000123 + CPH-G -> R-CPH-G-000123   (sufijo -R- pasa a R- adelante)
 * Devuelve null (sin regla) para `-TTR-`, formato desconocido o acrónimo desconocido. No inventa.
 */
export function recodificarCodigo(codigoViejo: string, acronimoNuevo: string): string | null {
  if (!ACRONIMOS.has(acronimoNuevo)) return null
  const m = /^(R-)?([A-Z0-9]+(?:-[A-Z0-9]+)*?)(-R)?-(\d{6})$/.exec(String(codigoViejo ?? '').trim())
  if (!m) return null
  const [, rAdelante, prefijoViejo, rSufijo, numero] = m
  if (prefijoViejo.split('-').includes('TTR') || prefijoViejo.endsWith('-TTR')) return null
  const reemplazante = Boolean(rAdelante || rSufijo)
  return `${reemplazante ? 'R-' : ''}${acronimoNuevo}-${numero}`
}
