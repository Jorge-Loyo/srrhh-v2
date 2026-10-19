// Helpers puros del diff del padrón — SIN dependencias de Prisma/axios/env, para
// poder testearlos (padron.diff.test.ts) sin levantar Postgres ni validar env.
// padron.service.ts los importa y re-exporta como única fuente.

import { especialidadSialReal } from './resolverPuestoCargo.js'

// Forma mínima de una fila del padrón que llega del Dotaneitor. Se declara acá
// (igual que en padron.service.ts) para no acoplar los helpers puros al módulo
// de servicio; es un simple mapa clave→valor.
export type RegistroPython = Record<string, unknown>

// Normaliza cualquier valor a string trim-eado ('' para null/undefined). Es la
// ÚNICA fuente de este helper: padron.service.ts lo re-importa de acá (antes
// tenía una copia local). Puro, sin dependencias.
export function strVal(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

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

// ─── DESDOBLADO (24 Residencias / 07 Docentes) ───────────────────────────────
// Fix del pipeline: estos dos cod_registro llevan un cargo 1:1 por rol (1 cargo
// = 1 rol = 1 persona), identificado por id_sial_rol, NO por cargo.id_sial. El
// resto de las carreras sigue por id_sial sin cambios. Ver design.md §2/§3.

// Cod_registros cuyos cargos están desdoblados (1:1 por rol).
export const COD_REGISTROS_DESDOBLADOS = new Set(['24', '07'])

// true si el cod_registro corresponde a una carrera desdoblada (24/07).
export function esDesdoblado(codRegistro: string | null | undefined): boolean {
  return COD_REGISTROS_DESDOBLADOS.has((codRegistro ?? '').trim())
}

// Réplica EXACTA en TS de la función SQL norm_esp(text) del script
// scripts/fix_desdoblado_cargos.sql (B.0). Se reimplementa acá para no depender
// de que la función SQL persista fuera de la transacción del split y para poder
// testearla sin BD. Pasos (en orden): unaccent, lower, quita "(...)" y su
// contenido, quita el bullet "•", quita guiones, colapsa espacios, trim final.
// El trim final es imprescindible: sin él "pediatria (clinica)" quedaría
// "pediatria " (con espacio de cola) y no matchearía el catálogo.
export function normEspDesdoblado(txt: string | null | undefined): string {
  return (txt ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // unaccent
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // quita "(...)" y su contenido
    .replace(/•/g, ' ') // quita el bullet
    .replace(/-/g, ' ') // quita guiones
    .replace(/\s+/g, ' ') // colapsa espacios
    .trim()
}

export interface ParticionRegistros {
  nuevosMap: Map<string, RegistroPython> // resto de carreras (clave id_sial)
  nuevosDesdobladosMap: Map<string, RegistroPython> // 24/07 (clave id_sial_rol)
}

// Clasifica cada fila del padrón en dos conjuntos: las carreras normales van a
// `nuevosMap` keyed por id_sial (comportamiento actual); las 24/07 van a
// `nuevosDesdobladosMap` keyed por id_sial_rol = `${idSial}-${cuilYRol}`.
// Invariante central del fix: una fila 24/07 NUNCA entra a `nuevosMap`, así los
// loops por id_sial jamás regeneran un cargo compartido.
export function particionarRegistros(registros: RegistroPython[]): ParticionRegistros {
  const nuevosMap = new Map<string, RegistroPython>()
  const nuevosDesdobladosMap = new Map<string, RegistroPython>()
  for (let i = 0; i < registros.length; i++) {
    const r = registros[i]!
    const idSial = strVal(r['ID SIAL'] ?? r['id_sial'])
    if (!idSial) continue
    const codReg = strVal(r['CODIGO DE REGISTRO'] ?? r['codigo_de_registro'])
    if (esDesdoblado(codReg)) {
      const cuilYRol = strVal(r['CUIL Y ROL'] ?? r['cuil_y_rol'])
      const idSialRol = cuilYRol ? `${idSial}-${cuilYRol}` : idSial
      // Clave duplicada (dos filas 24/07 que colapsan al mismo id_sial_rol —
      // p. ej. ambas sin CUIL Y ROL → clave degradada a idSial): NO se pisa en
      // silencio. Se conserva la primera y se descarta la segunda con warn.
      if (nuevosDesdobladosMap.has(idSialRol)) {
        console.warn(
          `[padron][desdoblado] clave id_sial_rol duplicada "${idSialRol}" (fila ${i}); se conserva la primera, se descarta la segunda`,
        )
        continue
      }
      if (!cuilYRol) {
        console.warn(
          `[padron][desdoblado] registro 24/07 sin CUIL Y ROL (id_sial ${idSial}, fila ${i}); clave degradada a id_sial`,
        )
      }
      nuevosDesdobladosMap.set(idSialRol, r)
    } else {
      nuevosMap.set(idSial, r)
    }
  }
  return { nuevosMap, nuevosDesdobladosMap }
}

// Resolver ESTRICTO de especialidad para el alta 1:1 desdoblada (réplica de la
// regla 5 / REGLA DE ORO del script SQL): match exacto de `especialidadRaw`
// contra las EspecialidadPuesto del MISMO puesto, usando la misma normalización
// que norm_esp. Devuelve NULL si el rol no trae especialidad real o no hay
// match. PURA por construcción: no recibe `tx`, por lo que NO puede derivar por
// puesto ni auto-crear (a diferencia de resolverEspecialidadPuestoId). El índice
// `catalogoNormEsp` tiene clave `${puestoId}:${normEspDesdoblado(nombre)}`.
export function resolverEspecialidadDesdobladaId(
  catalogoNormEsp: Map<string, string>,
  puestoId: string,
  especialidadRaw: string | null | undefined,
): string | null {
  const real = especialidadSialReal(especialidadRaw ?? null) // descarta placeholders "SIN ESPECIALIDAD"
  if (!real) return null // regla de oro: sin especialidad real → NULL
  const key = `${puestoId}:${normEspDesdoblado(real)}`
  return catalogoNormEsp.get(key) ?? null // sin match → NULL (regla de oro)
}

// Prefijo correcto del cargo desdoblado FORZADO por la carrera (el cod_registro
// manda, igual que el script): '24' → 'RES', '07' → 'DOC'. SIN guion (es lo que
// espera maxSecuencialCargo, que arma el LIKE `${prefijo}-%`). Recibe el prefijo
// que calculó prefijoDeCargo y, si no coincide con el esperado por carrera, lo
// fuerza. Puro y testeable sin Prisma.
export function prefijoDesdobladoForzado(
  codRegistro: string | null | undefined,
  prefijoCalculado: string | null | undefined,
): 'RES' | 'DOC' {
  const esperado: 'RES' | 'DOC' = (codRegistro ?? '').trim() === '07' ? 'DOC' : 'RES' // 24 → RES
  if (prefijoCalculado !== esperado) {
    if (prefijoCalculado != null && prefijoCalculado !== '') {
      console.warn(
        `[padron][desdoblado] prefijo ${prefijoCalculado} != ${esperado} para cod_registro ${codRegistro}; se fuerza ${esperado}`,
      )
    }
    return esperado
  }
  return esperado
}

// Decide el tipo de diff de un rol 24/07 del padrón nuevo según exista o no su
// cargo 1:1 (resuelto por id_sial_rol vía ocupación viva o mapeo). Puro: la
// resolución real del "actual" vive en calcularDiff (toca BD); acá solo la
// regla. 'alta' = rol nunca visto → cargo 1:1 nuevo; 'modificado' = ya existe.
export function tipoDiffDesdoblado(existeActual: boolean): 'alta' | 'modificado' {
  return existeActual ? 'modificado' : 'alta'
}

// Clasificación informativa de una baja desdoblada para el listado (§3.6): se
// decide por el estado del cargo 1:1 guardado en valorAnterior (id_sial es NULL
// en los clones, no se puede usar el lookup por id_sial). Puro y testeable.
export function clasificacionEliminadoDesdoblado(
  estadoCargo: string | null | undefined,
): 'en_validacion' | 'sin_persona' {
  return estadoCargo === 'validacion_vacante' ? 'en_validacion' : 'sin_persona'
}

// Formatea un código correlativo de cargo desdoblado: `${prefijo}-${n 6 dígitos}`
// (ej. 'RES' + 1 → 'RES-000001', 'DOC' + 460 → 'DOC-000460'). El prefijo va SIN
// guion. Puro; la unicidad/blindaje contra huecos se maneja en el call site con
// la BD (maxSecuencialCargo + count), acá solo el formateo determinista.
export function formatearCodigoDesdoblado(prefijo: string, n: number): string {
  return `${prefijo}-${String(n).padStart(6, '0')}`
}
