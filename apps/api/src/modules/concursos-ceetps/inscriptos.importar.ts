// =============================================================================
// Importación por Excel de los pasos del concurso CEETPS (Etapa 3)
// =============================================================================
// El front lee el .xlsx y manda las filas tal cual (encabezado → valor). Acá se
// normalizan los encabezados, se interpreta cada fila según el paso y se la
// cruza con los inscriptos del concurso por DNI o CUIL. Lógica pura y testeable:
// la persistencia vive en inscriptos.service.ts.

export const PASOS_IMPORTABLES = ['inscripcion', 'admisibilidad', 'examen', 'cv', 'entrevista'] as const
export type PasoImportable = (typeof PASOS_IMPORTABLES)[number]

export type CeldaExcel = string | number | boolean | null
export type FilaExcel = Record<string, CeldaExcel>

export interface DatosFilaImportada {
  /** Para cruzar con un inscripto existente (solo dígitos). */
  dni: string | null
  cuil: string | null
  /** Campos a guardar (solo los que vinieron con valor). */
  cambios: Record<string, string | number | boolean | null>
}

export type FilaInterpretada =
  | { ok: true; datos: DatosFilaImportada }
  | { ok: false; motivo: string }

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

// Encabezado → clave canónica. Se ignora mayúsculas, acentos, espacios y signos.
const ALIAS: Record<string, string> = {
  apellido: 'apellido',
  apellidos: 'apellido',
  nombre: 'nombre',
  nombres: 'nombre',
  dni: 'dni',
  documento: 'dni',
  cuil: 'cuil',
  email: 'email',
  mail: 'email',
  correo: 'email',
  correoelectronico: 'email',
  telefono: 'telefono',
  tel: 'telefono',
  celular: 'telefono',
  entregodocumentacion: 'entregoDocumentacion',
  documentacion: 'entregoDocumentacion',
  admitido: 'admitido',
  admision: 'admitido',
  motivo: 'motivoNoAdmision',
  motivonoadmision: 'motivoNoAdmision',
  sepresento: 'presentoExamen',
  presento: 'presentoExamen',
  presentoexamen: 'presentoExamen',
  asistio: 'presentoExamen',
  nota: 'notaExamen',
  notaexamen: 'notaExamen',
  puntaje: 'puntaje',
  puntajecv: 'puntaje',
  puntajeentrevista: 'puntaje',
  entrevista: 'puntaje',
  cv: 'puntaje',
}

export function claveColumna(encabezado: string): string | null {
  const limpio = sinAcentos(encabezado).toLowerCase().replace(/[^a-z0-9]/g, '')
  return ALIAS[limpio] ?? null
}

const soloDigitos = (v: CeldaExcel | undefined): string | null => {
  const d = String(v ?? '').replace(/\D/g, '')
  return d === '' ? null : d
}

const texto = (v: CeldaExcel | undefined): string | null => {
  if (v === null || v === undefined) return null
  const t = String(v).trim()
  return t === '' ? null : t
}

/** SI/NO (y variantes) → boolean; null si la celda está vacía; undefined si no se entiende. */
export function aBooleano(v: CeldaExcel | undefined): boolean | null | undefined {
  if (typeof v === 'boolean') return v
  const t = texto(v)
  if (t === null) return null
  const s = sinAcentos(t).toLowerCase()
  if (['si', 's', 'x', '1', 'true', 'verdadero', 'admitido', 'presente'].includes(s)) return true
  if (['no', 'n', '0', 'false', 'falso', 'no admitido', 'ausente'].includes(s)) return false
  return undefined
}

export function aPuntaje(v: CeldaExcel | undefined): number | null | undefined {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 && v <= 1000 ? v : undefined
  const t = texto(v)
  if (t === null) return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : undefined
}

export function interpretarFila(paso: PasoImportable, fila: FilaExcel): FilaInterpretada {
  const c: Record<string, CeldaExcel> = {}
  for (const [encabezado, valor] of Object.entries(fila)) {
    const clave = claveColumna(encabezado)
    if (clave) c[clave] = valor
  }

  const dni = soloDigitos(c.dni)
  const cuil = soloDigitos(c.cuil)
  if (!dni && !cuil) return { ok: false, motivo: 'Falta el DNI o el CUIL.' }

  const cambios: DatosFilaImportada['cambios'] = {}
  const poner = (campo: string, valor: string | number | boolean | null) => {
    cambios[campo] = valor
  }

  if (paso === 'inscripcion') {
    const apellido = texto(c.apellido)
    const nombre = texto(c.nombre)
    if (apellido) poner('apellido', apellido)
    if (nombre) poner('nombre', nombre)
    if (dni) poner('dni', dni)
    if (cuil) poner('cuil', cuil)
    for (const k of ['email', 'telefono'] as const) {
      const t = texto(c[k])
      if (t) poner(k, t)
    }
    if ('entregoDocumentacion' in c) {
      const b = aBooleano(c.entregoDocumentacion)
      if (b === undefined) return { ok: false, motivo: 'Entregó documentación debe ser SI o NO.' }
      if (b !== null) poner('entregoDocumentacion', b)
    }
  }

  if (paso === 'admisibilidad') {
    const b = aBooleano(c.admitido)
    if (b === undefined || b === null) return { ok: false, motivo: 'Admitido debe ser SI o NO.' }
    poner('admitido', b)
    const motivo = texto(c.motivoNoAdmision)
    if (motivo) poner('motivoNoAdmision', motivo)
  }

  if (paso === 'examen') {
    const b = aBooleano(c.presentoExamen)
    if (b === undefined) return { ok: false, motivo: 'Se presentó debe ser SI o NO.' }
    const nota = aPuntaje(c.notaExamen)
    if (nota === undefined) return { ok: false, motivo: 'La nota debe ser un número entre 0 y 1000.' }
    if (b === null && nota === null) return { ok: false, motivo: 'Falta la nota o si se presentó.' }
    // Con nota cargada se da por presentado salvo que diga explícitamente que no.
    poner('presentoExamen', b ?? true)
    if (nota !== null) poner('notaExamen', nota)
  }

  if (paso === 'cv' || paso === 'entrevista') {
    const p = aPuntaje(c.puntaje)
    if (p === undefined || p === null)
      return { ok: false, motivo: 'El puntaje debe ser un número entre 0 y 1000.' }
    poner(paso === 'cv' ? 'puntajeCv' : 'puntajeEntrevista', p)
  }

  return { ok: true, datos: { dni, cuil, cambios } }
}
