// Helpers puros del diff del padrón — SIN dependencias de Prisma/axios/env, para
// poder testearlos (padron.diff.test.ts) sin levantar Postgres ni validar env.
// padron.service.ts los importa y re-exporta como única fuente.

// Fechas del padrón real vienen como "DD/MM/YYYY" (string). new Date("DD/MM/YYYY")
// las interpreta mal (Node asume MM/DD), así que se parsean los componentes a mano
// y se anclan a UTC con Date.UTC.
export function parseFechaDDMMYYYY(v: string | undefined): Date | null {
  if (!v) return null
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v)
  if (!m) return null
  const [, d, mo, y] = m
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
  return Number.isNaN(date.getTime()) ? null : date
}

// Fecha centinela "sin fin" (cargo_hasta): la BD guarda null y el Excel puede
// traer 01/01/4000. Ambos se colapsan a '' para que no generen diff espurio.
export const CENTINELA_ISO = '4000-01-01'

// Normaliza una fecha a ISO 'YYYY-MM-DD' para comparar BD (Date @db.Date, a
// medianoche UTC) vs Excel ('DD/MM/YYYY'). Para la rama Date se leen las partes
// UTC explícitas (NO .toISOString().slice(0,10)) para evitar el corrimiento de
// un día en zonas con offset negativo (UTC-3). Invariante: toISO asume un Date
// anclado a UTC (verdadero para @db.Date y parseFechaDDMMYYYY). Colapsa
// null/''/CENTINELA_ISO a ''.
export function toISO(v: unknown): string {
  if (v == null || v === '') return ''
  let iso = ''
  if (v instanceof Date) {
    iso = `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`
  } else {
    iso = parseFechaDDMMYYYY(String(v))?.toISOString().slice(0, 10) ?? ''
  }
  return iso === CENTINELA_ISO ? '' : iso
}

// Despoja el prefijo 'completado:' de un campo de diff. Idempotente para campos
// no prefijados (incluido el marcador '__reabrir_ocupacion__').
export function stripCompletado(campo: string): string {
  return campo.startsWith('completado:') ? campo.slice('completado:'.length) : campo
}

// empty → value es un alta de dato (completado), no una modificación. Devuelve
// true solo cuando el lado anterior está vacío y el nuevo tiene valor.
export function esCompletado(anterior: string, nuevo: string): boolean {
  return anterior === '' && nuevo !== ''
}

// Categoriza una baja (cargo ausente del padrón nuevo). Baja NUEVA de la semana
// = cargo vigente + ocupación vigente (hasta IS NULL) + persona activa
// (persona.activo === true, DECISIÓN 2); cualquier otro caso ⇒ 'baja_previa'.
// El valor devuelto es lo que se persiste en `campo` (null = baja nueva).
export function categoriaBaja(
  estado: string | null | undefined,
  ocup: { hasta?: Date | null; persona?: { activo?: boolean | null } | null } | null | undefined,
): null | 'baja_previa' {
  const esBajaNueva =
    estado === 'vigente' && ocup != null && ocup.hasta == null && ocup.persona?.activo === true
  return esBajaNueva ? null : 'baja_previa'
}
