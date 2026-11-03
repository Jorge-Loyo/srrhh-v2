// ─── Helpers puros de la carga masiva de concursos (CPH + CEETPS) ────────────
//
// Normalizadores de celdas del Excel limpio de Etapa 1 + utilidades de CUIL,
// serial Excel y prefijo determinístico CEETPS. SIN dependencias de Prisma ni
// de la base: todo testeable aislado (ver helpers.test.ts). Reglas tomadas del
// DISEÑO (§c/§e/§d/§g) y de .agents/tasks/etl-concursos/MAPEO.md §4.
//
// El Excel limpio YA trae las fechas en ISO (YYYY-MM-DD) y los textos
// normalizados; estos helpers no re-transforman (eso lo hizo Etapa 1), solo
// validan/convierten tipos y acumulan warnings no-fatales.

// Acumulador de advertencias por fila. El caller (script) lo crea por fila y lo
// vuelca al reporte final / a `observaciones`.
export type Warnings = string[]

// Rango plausible de fechas del dominio (decisión D6 de Etapa 1). Fuera de
// rango NO descarta: conserva el valor + warning. Excepción: el centinela
// 2000-01-01 (fechaVacante sin fecha_baja) no genera warning.
const ANIO_MIN = 2018
const ANIO_MAX = 2045
export const FECHA_CENTINELA = '2000-01-01'

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/

// Valores basura que el Excel/ETL dejan en celdas y que equivalen a "sin dato".
function esVacioOErrorCelda(s: string): boolean {
  const up = s.toUpperCase()
  return (
    s === '' ||
    s === '-' ||
    up === 'NAN' ||
    up === 'FALSE' ||
    up.startsWith('#') // #N/A, #VALUE!, #REF!, etc.
  )
}

// str(v): trim; vacío/basura → null.
export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (esVacioOErrorCelda(s)) return null
  return s
}

// num(v): entero; vacío/no-numérico → null. Si `smallInt` y excede el rango de
// SmallInt de Postgres (±32767) → null + warning (ej. carga_horaria).
export function num(
  v: unknown,
  opts?: { smallInt?: boolean; campo?: string; warnings?: Warnings },
): number | null {
  const s = str(v)
  if (s === null) return null
  const n = typeof v === 'number' ? v : parseInt(s.replace(/\D+$/g, ''), 10)
  if (!Number.isFinite(n) || Number.isNaN(n)) return null
  const entero = Math.trunc(n)
  if (opts?.smallInt && (entero < -32768 || entero > 32767)) {
    opts.warnings?.push(
      `${opts.campo ?? 'valor'}=${entero} excede SmallInt (±32767) — descartado (null)`,
    )
    return null
  }
  return entero
}

// bool(v): SI/TRUE/1/X → true; NO/FALSE/0 → false; vacío → null.
export function bool(v: unknown): boolean | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return v
  const s = String(v).trim().toUpperCase()
  if (s === '') return null
  if (s === 'SI' || s === 'SÍ' || s === 'TRUE' || s === '1' || s === 'X') return true
  if (s === 'NO' || s === 'FALSE' || s === '0') return false
  return null
}

// serialExcelAFecha(n): serial de Excel (días desde 1899-12-30) → Date UTC.
// Base documentada: Date.UTC(1899, 11, 30) + serial * 86400000.
export function serialExcelAFecha(serial: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
}

// fecha(v): ISO YYYY-MM-DD (lo que trae el Excel limpio) → Date (UTC medianoche).
//   - null/-/#…/FALSE/'' → null (sin warning).
//   - serial numérico de Excel → se convierte con serialExcelAFecha.
//   - fuera del rango 2018–2045 → conserva el valor + warning (no descarta),
//     EXCEPTO el centinela 2000-01-01 (sin warning).
//   - no parseable → null + warning.
export function fecha(v: unknown, campo?: string, warnings?: Warnings): Date | null {
  if (v === null || v === undefined) return null

  // Serial numérico de Excel (raro, pero posible — ver Respuesta fila 71).
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = serialExcelAFecha(v)
    return validarRango(d, campo, warnings)
  }
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? null : validarRango(v, campo, warnings)
  }

  const s = String(v).trim()
  if (esVacioOErrorCelda(s) || s === '0') return null

  const m = ISO_RE.exec(s)
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`)
    if (isNaN(d.getTime())) {
      warnings?.push(`${campo ?? 'fecha'}="${s}" no parseable — descartada (null)`)
      return null
    }
    return validarRango(d, campo, warnings)
  }

  // Fallback: intentar Date() nativo (ya raro en el Excel limpio).
  const d = new Date(s)
  if (isNaN(d.getTime())) {
    warnings?.push(`${campo ?? 'fecha'}="${s}" no parseable — descartada (null)`)
    return null
  }
  return validarRango(d, campo, warnings)
}

function validarRango(d: Date, campo?: string, warnings?: Warnings): Date {
  const iso = d.toISOString().slice(0, 10)
  if (iso === FECHA_CENTINELA) return d // centinela intencional, sin warning
  const anio = d.getUTCFullYear()
  if (anio < ANIO_MIN || anio > ANIO_MAX) {
    warnings?.push(
      `${campo ?? 'fecha'}=${iso} fuera de rango ${ANIO_MIN}-${ANIO_MAX} — conservada (revisar)`,
    )
  }
  return d
}

// ─── CUIL ────────────────────────────────────────────────────────────────────
// normalizarCuil(v): 11 dígitos, quita guiones, valida dígito verificador.
// Inválido (≠11 díg, prefijo malo o verificador malo) → null + warning.
const MULT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

export function normalizarCuil(v: unknown, warnings?: Warnings): string | null {
  const s = str(v)
  if (s === null) return null
  const soloDig = s.replace(/\D/g, '')
  if (soloDig.length !== 11) {
    warnings?.push(`CUIL "${s}" inválido (no tiene 11 dígitos) — ignorado`)
    return null
  }
  // Prefijo de tipo (20/23/24/27/30/33/34...) — validación laxa: primeros 2
  // dígitos entre 20 y 34 (personas físicas/jurídicas habituales).
  const prefijo = parseInt(soloDig.slice(0, 2), 10)
  if (prefijo < 20 || prefijo > 34) {
    warnings?.push(`CUIL "${soloDig}" con prefijo inusual (${prefijo}) — ignorado`)
    return null
  }
  let suma = 0
  for (let i = 0; i < 10; i++) suma += parseInt(soloDig[i]!, 10) * MULT[i]!
  let verif = 11 - (suma % 11)
  if (verif === 11) verif = 0
  if (verif === 10) verif = 9
  if (verif !== parseInt(soloDig[10]!, 10)) {
    warnings?.push(`CUIL "${soloDig}" con dígito verificador inválido — ignorado`)
    return null
  }
  return soloDig
}

// ─── Nombre del designado ─────────────────────────────────────────────────────
// Un concurso está "sin designar" si el nombre es VACANTE A CUBRIR / - / vacío.
export function esDesignadoVacante(nombre: unknown): boolean {
  const s = str(nombre)
  if (s === null) return true
  const up = s.toUpperCase()
  return up === 'VACANTE A CUBRIR' || up === 'VACANTE' || up === '-'
}

// ─── Prefijo determinístico CEETPS por sub_carrera (DISEÑO §d) ───────────────
// ENFERMERIA → ENF
// TECNICOS   → TEC-POU si el puesto contiene GUARDIA, si no TEC-POF
// ANEXO2     → EG-J si el puesto es jefatura/conducción, si no EG
export function prefijoCeetpsPorSubCarrera(
  subCarrera: string | null,
  puestoSolicitado: string | null,
): string {
  const sc = (subCarrera ?? '').trim().toUpperCase()
  const puesto = (puestoSolicitado ?? '').toUpperCase()
  if (sc === 'ENFERMERIA' || sc === 'ENFERMERÍA') return 'ENF'
  if (sc === 'TECNICOS' || sc === 'TÉCNICOS') {
    return puesto.includes('GUARDIA') ? 'TEC-POU' : 'TEC-POF'
  }
  // ANEXO2 (Escalafón General / Administrativa)
  const esJefatura =
    puesto.includes('JEFE') || puesto.includes('JEFATURA') || puesto.includes('DIRECTOR')
  return esJefatura ? 'EG-J' : 'EG'
}
