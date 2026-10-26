// ETL Concursos -> REFINADO (ETAPA 2, Opcion B mixta)
// -----------------------------------------------------------------------------
// Parte del xlsx YA EDITADO por el usuario (NO de los CSV crudos), preserva
// TODAS sus ediciones (incluida la columna `Respuesta` de CPH) y aplica ENCIMA:
//   - saneo de fechas por celda: basura -> vacio, serial Excel -> ISO,
//     anios rotos -> 2026 (conservando mes/dia);
//   - aplicacion de las respuestas del usuario (columna `Respuesta` de CPH),
//     incluyendo el reemplazo de la fecha OUTLIER por un dd/mm/aaaa explicito
//     cuando se identifica con certeza (si no, se deja y se reporta);
//   - normalizacion de puestos/especialidades contra
//     prisma/catalogo-puestos-curado.json (forma canonica EXACTA del catalogo);
//   - re-validacion de las reglas del ETL anterior (CUIL 11 digitos, EE con
//     espacios colapsados, textos sin-designar -> vacio, etapa canonica,
//     duplicados por expediente, NO descartar filas, ee_baja puede ser RES...).
//
// Principio rector: NO pisar un dato bueno con uno peor. Si una celda ya esta
// bien, se deja; si esta rota, se corrige; si una regla no aplica, no se toca.
//
// NO toca Neon, NO red, NO prisma. Solo lee archivos locales y escribe un xlsx
// NUEVO con sufijo incremental (no sobrescribe la entrada). El xlsx esta en
// .gitignore (no se commitea); SI se commitea este script.
//
// Uso:
//   node scripts/etl_concursos_refinar.mjs [rutaEntrada.xlsx]
// Default de entrada:
//   Doc/Referencias/Concursos/2CONCURSOS_LIMPIO_2026-10-23 limpio.xlsx
// -----------------------------------------------------------------------------

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..') // worktree raiz (.../etl-refinar)
const BASE_REPO = path.resolve(REPO_ROOT, '..', '..') // repo base (dos niveles arriba)

const DEFAULT_INPUT =
  'c:\\Desarrollo\\SRH\\SRRHH-Legacy\\Doc\\Referencias\\Concursos\\2CONCURSOS_LIMPIO_2026-10-23 limpio.xlsx'

function primerExistente(...paths) {
  for (const p of paths) if (p && fs.existsSync(p)) return p
  return paths.find(Boolean)
}

const CATALOGO_PATH = primerExistente(
  path.join(REPO_ROOT, 'prisma', 'catalogo-puestos-curado.json'),
  path.join(BASE_REPO, 'prisma', 'catalogo-puestos-curado.json')
)

// -----------------------------------------------------------------------------
// Carga de la libreria xlsx (el brief pide apps/web/node_modules/xlsx)
// -----------------------------------------------------------------------------
async function loadXLSX() {
  const candidates = [
    'c:\\Desarrollo\\SRH\\SRRHH-Legacy\\apps\\web\\node_modules\\xlsx\\xlsx.mjs',
    path.join(BASE_REPO, 'apps', 'web', 'node_modules', 'xlsx', 'xlsx.mjs'),
    path.join(REPO_ROOT, 'apps', 'web', 'node_modules', 'xlsx', 'xlsx.mjs'),
  ]
  // fallback al store pnpm del repo base (como el ETL anterior)
  const pnpmDir = path.join(BASE_REPO, 'node_modules', '.pnpm')
  if (fs.existsSync(pnpmDir)) {
    for (const entry of fs.readdirSync(pnpmDir)) {
      if (/^xlsx@/.test(entry)) {
        candidates.push(path.join(pnpmDir, entry, 'node_modules', 'xlsx', 'xlsx.mjs'))
      }
    }
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return await import(pathToFileURL(c).href)
  }
  throw new Error("No se encontro la libreria 'xlsx'. Candidatos:\n" + candidates.join('\n'))
}

// -----------------------------------------------------------------------------
// Helpers base (portados / adaptados del ETL anterior)
// -----------------------------------------------------------------------------
const BASURA = new Set([
  '', '-', '--', 'no hallado', '#value!', '#name?', '#ref!', '#n/a', 'n/a',
  'false', 'true', '#div/0!', '#null!', '#num!',
])

function raw(v) {
  return (v ?? '').toString()
}

// texto limpio: trim + colapsar espacios; '' si es basura.
function txt(v) {
  const s = raw(v).replace(/\s+/g, ' ').trim()
  if (BASURA.has(s.toLowerCase())) return ''
  return s
}

// texto SOLO trim (preserva mayus/minus); '' si basura.
function txtKeep(v) {
  const s = raw(v).trim()
  if (BASURA.has(s.toLowerCase())) return ''
  return s
}

// normaliza para matchear: minuscula, sin acentos, espacios colapsados.
// (minuscula porque el catalogo del sistema esta en minuscula)
function norm(s) {
  return raw(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function colapsarEspacios(v) {
  return raw(v).replace(/\s+/g, ' ').trim()
}

// ee_baja puede ser una RESOLUCION (RES/..., RESOL-...) en vez de EX-...: valido.
function esResolucion(v) {
  return /^res(ol)?\b|^res[\/-]|^resol/i.test(colapsarEspacios(v))
}

// Validacion de CUIL argentino (prefijo + digito verificador).
const CUIL_PREFIJOS = new Set(['20', '23', '24', '27', '30', '33', '34'])
function validarCuil(digits) {
  if (!/^\d{11}$/.test(digits)) return false
  if (!CUIL_PREFIJOS.has(digits.slice(0, 2))) return false
  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  let sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i], 10) * mult[i]
  let dv = 11 - (sum % 11)
  if (dv === 11) dv = 0
  else if (dv === 10) dv = 9
  return dv === parseInt(digits[10], 10)
}

// Textos "sin designar" en campos de nombre/designacion -> '' .
const SIN_DESIGNAR = new Set([
  'vacante a cubrir', 'vacante', 'no hallado', 'solicitado', 'dotacion',
  'dotación', 's/d', 'sin designar',
])

// -----------------------------------------------------------------------------
// FECHAS
// -----------------------------------------------------------------------------
function parseIso(s) {
  const m = raw(s).trim().match(/^(\d{1,4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return null
  const y = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10)
  const d = parseInt(m[3], 10)
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return { y, m: mo, d }
}

function fmtIso(y, m, d) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// dd/mm/aaaa -> ISO ; null si no parsea.
function parseDmy(s) {
  const m = raw(s).trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (!m) return null
  let d = parseInt(m[1], 10)
  let mo = parseInt(m[2], 10)
  let y = parseInt(m[3], 10)
  if (y < 100) y += 2000
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return fmtIso(y, mo, d)
}

// Serial Excel -> ISO (base 1899-12-30). 46318 -> 2026-10-19.
function serialExcelAIso(n) {
  const ms = Date.UTC(1899, 11, 30) + Math.round(n) * 86400000
  const dt = new Date(ms)
  return fmtIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

const SERIAL_MIN = 40000
const SERIAL_MAX = 50000

// Saneo de una celda de fecha. Devuelve { valor, warning, cambio }
//   cambio: 'basura' | 'serial' | 'anio' | '' (sin cambio)
// NO toca fechas ISO ya validas con anio en rango.
function limpiarFecha(v, col) {
  // valores vacios/nulos: dejar vacio sin warning (celda vacia a proposito)
  if (v === '' || v == null) return { valor: '', warning: '', cambio: '' }

  // numero (serial Excel) -> ISO
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (Number.isInteger(v) && v >= SERIAL_MIN && v <= SERIAL_MAX) {
      const iso = serialExcelAIso(v)
      return { valor: iso, warning: `serial Excel ${v} convertido a ${iso} en ${col}`, cambio: 'serial' }
    }
    // numero fuera del rango serial: tratarlo como texto para evaluarlo abajo
    v = String(v)
  }

  const s = raw(v).trim()

  // basura -> vacio
  if (BASURA.has(s.toLowerCase())) return { valor: '', warning: '', cambio: s ? 'basura' : '' }

  // string numerico que parece serial Excel
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10)
    if (n >= SERIAL_MIN && n <= SERIAL_MAX) {
      const iso = serialExcelAIso(n)
      return { valor: iso, warning: `serial Excel ${n} convertido a ${iso} en ${col}`, cambio: 'serial' }
    }
  }

  const p = parseIso(s)
  if (!p) {
    // no es ISO ni serial ni basura conocida: dejar tal cual + warning informativo
    return { valor: s, warning: `fecha no parseable conservada: "${s}" en ${col}`, cambio: '' }
  }

  // ISO valido: evaluar el anio.
  // Correccion a 2026 SOLO para anios CLARAMENTE imposibles (ceros a la
  // izquierda / siglos rotos, y < 100 de un dd/mm/aaaa mal parseado), o el
  // 2006 que el usuario confirmo que es 2026. Casos reales: 0206, 0226, 2006.
  // Los anios viejos PLAUSIBLES de una baja (2012, 2017...) el usuario los
  // valido como correctos ("la fecha esta ok" / "deducible esta bien"): NO se
  // tocan, solo se deja un warning informativo si caen fuera de 2018..2045.
  const anioRoto = p.y < 1900 || p.y === 2006
  if (anioRoto) {
    const iso = fmtIso(2026, p.m, p.d)
    return {
      valor: iso,
      warning: `año corregido a 2026 (era ${p.y}) en ${col}`,
      cambio: 'anio',
    }
  }
  if (p.y < 2018 || p.y > 2045) {
    // fuera de rango pero plausible / validado por el usuario -> conservar + warning informativo
    return {
      valor: fmtIso(p.y, p.m, p.d),
      warning: `año fuera de rango 2018..2045 conservado (era ${p.y}) en ${col}`,
      cambio: '',
    }
  }
  // anio en rango plausible -> NO tocar
  return { valor: fmtIso(p.y, p.m, p.d), warning: '', cambio: '' }
}

// -----------------------------------------------------------------------------
// Columnas de fecha por hoja (orden canonico del flujo CPH para outlier)
// -----------------------------------------------------------------------------
const FECHAS_CPH = [
  'fecha_ee_concurso', 'fecha_baja', 'fecha_autorizacion', 'sorteo_jurado',
  'fecha_insc_desde', 'fecha_insc_hasta', 'fecha_examen', 'fecha_orden_merito',
  'fecha_ifacs', 'fecha_insal', 'fecha_apto_medico', 'fecha_ite',
  'fecha_resolucion', 'fecha_dispo_desierta',
]
// orden temporal del flujo de etapas (excluye fecha_baja y fecha_ee_concurso:
// son fechas de origen que legitimamente anteceden al flujo)
const FLUJO_CPH = [
  'fecha_autorizacion', 'sorteo_jurado', 'fecha_insc_desde', 'fecha_insc_hasta',
  'fecha_examen', 'fecha_orden_merito', 'fecha_ifacs', 'fecha_insal',
  'fecha_apto_medico', 'fecha_ite', 'fecha_resolucion',
]
const FECHAS_CEETPS = ['fecha_caratulacion', 'fecha_ifacs', 'fecha_insal', 'fecha_baja']

// -----------------------------------------------------------------------------
// Detección de la fecha OUTLIER de una fila CPH (D-OUTLIER).
// Secuencia = fechas del FLUJO_CPH presentes, en su orden canonico. Una celda es
// outlier si rompe la monotonia creciente respecto a sus vecinas Y su reemplazo
// por `isoNuevo` restaura la monotonia. Si EXACTAMENTE una celda cumple -> es el
// outlier. Si 0 o >1 -> no se puede determinar (no adivinar).
// Devuelve la columna outlier o null.
// -----------------------------------------------------------------------------
function monotona(valores) {
  for (let i = 1; i < valores.length; i++) {
    if (valores[i] < valores[i - 1]) return false
  }
  return true
}

function detectarOutlier(row, isoNuevo) {
  const presentes = FLUJO_CPH.filter((c) => parseIso(row[c]))
  if (presentes.length < 2) return null // no hay secuencia que comparar
  const base = presentes.map((c) => raw(row[c]))
  // si ya es monotona, no hay outlier que reemplazar
  if (monotona(base)) return null
  const candidatas = []
  for (let i = 0; i < presentes.length; i++) {
    const probado = base.slice()
    probado[i] = isoNuevo
    if (monotona(probado)) candidatas.push(presentes[i])
  }
  if (candidatas.length === 1) return candidatas[0]
  return null
}

// -----------------------------------------------------------------------------
// CATALOGO puestos / especialidades (D-MATCH)
// -----------------------------------------------------------------------------
function cargarCatalogo() {
  const data = JSON.parse(fs.readFileSync(CATALOGO_PATH, 'utf8'))
  const puestos = new Map() // norm -> canonico
  const especialidades = new Map()
  for (const item of data) {
    const nombre = raw(item.nombre).trim()
    if (nombre) {
      const k = norm(nombre)
      if (!puestos.has(k)) puestos.set(k, nombre)
    }
    for (const esp of item.especialidades || []) {
      const e = raw(esp).trim()
      if (e) {
        const k = norm(e)
        if (!especialidades.has(k)) especialidades.set(k, e)
      }
    }
  }
  // Alias controlados para los desfases reales detectados (norm input -> norm catalogo)
  const alias = new Map([
    ['jefe unidad (05)', 'jefe de unidad (05)'],
    ['jefe seccion (06)', 'jefe de seccion (06)'],
    ['jefe division (04)', 'jefe de division (04)'],
    ['jefe departamento (02)', 'jefe de departamento (02)'],
  ])
  return { puestos, especialidades, alias }
}

// Resuelve un valor contra un mapa del catalogo. Devuelve { valor, warning, match }.
// Orden: exacto -> sin parentesis -> alias -> sin match (dejar valor + warning).
function resolverCatalogo(mapa, alias, valorCrudo, etiqueta) {
  const crudo = txt(valorCrudo)
  if (!crudo) return { valor: '', warning: '', match: true }
  const k = norm(crudo)
  if (mapa.has(k)) return { valor: mapa.get(k), warning: '', match: true }

  // variante sin sufijo entre parentesis
  const sinParen = norm(crudo.replace(/\s*\([^)]*\)\s*/g, ' '))
  if (sinParen && sinParen !== k && mapa.has(sinParen)) {
    return { valor: mapa.get(sinParen), warning: '', match: true }
  }

  // alias controlado -> clave del catalogo
  if (alias.has(k)) {
    const destino = alias.get(k)
    if (mapa.has(destino)) return { valor: mapa.get(destino), warning: '', match: true }
  }

  return { valor: crudo, warning: `${etiqueta} sin match en catalogo: "${crudo}"`, match: false }
}

// -----------------------------------------------------------------------------
// Re-validacion de celdas (no romper lo bueno)
// -----------------------------------------------------------------------------
// CUIL: si ya son 11 digitos validos, dejar; si no, intentar extraer 11 digitos
// y validar; si no valida, conservar lo que haya (no destruir) + warning.
function revalidarCuil(v, etiqueta, warns) {
  const s = raw(v).trim()
  if (!s || BASURA.has(s.toLowerCase())) return ''
  const digits = s.replace(/\D/g, '')
  if (digits.length === 11) {
    if (validarCuil(digits)) return digits
    warns.push(`${etiqueta}: CUIL no pasa validacion (prefijo/digito): "${digits}"`)
    return digits // conservar: es dato del usuario, no inventamos otro
  }
  // no tiene 11 digitos
  if (!digits) return ''
  warns.push(`${etiqueta}: CUIL con ${digits.length} digitos (invalido): "${s}"`)
  return digits
}

function nombreDesignado(v) {
  const s = colapsarEspacios(v)
  if (!s) return ''
  if (BASURA.has(s.toLowerCase()) || SIN_DESIGNAR.has(s.toLowerCase())) return ''
  if (/^\d{6,}$/.test(s.replace(/\D/g, '')) && /^\d[\d-]*$/.test(s)) return ''
  return s
}

// EE concurso/designacion: colapsar espacios; warning si no es EX- (salvo que
// se permita RES en esa columna).
function revalidarEE(v, etiqueta, warns, permitirResolucion) {
  const s = colapsarEspacios(v)
  if (!s || BASURA.has(s.toLowerCase())) return ''
  if (/^EX[-\s]/i.test(s)) return s
  if (permitirResolucion && esResolucion(s)) return s // ee_baja puede ser RES...
  warns.push(`${etiqueta}: expediente no tiene formato EX-: "${s}"`)
  return s
}

// -----------------------------------------------------------------------------
// Clasificacion de respuestas (D-RESPUESTA)
// -----------------------------------------------------------------------------
function clasificarRespuesta(texto) {
  const t = norm(texto)
  if (!t) return { tipo: 'vacia' }
  // dd/mm/aaaa explicito dentro del texto
  const m = texto.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/)
  if (m) {
    const iso = parseDmy(m[1])
    if (iso) return { tipo: 'fecha_explicita', iso, origen: m[1] }
  }
  if (/2026/.test(t) && /(agrega|edita|coloca|el ano|año)/.test(t)) return { tipo: 'anio_cubierto' }
  if (/46318|numero en excel|serial/.test(t)) return { tipo: 'serial_cubierto' }
  if (/deja vacio|queda vacia|pendiente|no a iniciado|no ha iniciado|no se conocen/.test(t)) {
    return { tipo: 'respetar_vacio' }
  }
  if (/resolucion|resol/.test(t)) return { tipo: 'baja_resolucion' }
  if (/esta bien|esta ok|deducible|dedicible|analiza que esta bien/.test(t)) return { tipo: 'ok' }
  if (/diagnostico por imagenes|imágenes/.test(t)) return { tipo: 'esp_cubierto' }
  return { tipo: 'informativa' }
}

// -----------------------------------------------------------------------------
// Refinado por fila CPH
// -----------------------------------------------------------------------------
const ETAPA_CEETPS = new Map([
  ['1', '1 - Sin Autorizar'],
  ['2', '2 - Autorizado'],
  ['3', '3 - Dispo Llamado'],
  ['4', '4 - IFACS'],
  ['5', '5 - INSAL'],
  ['6', '6 - TAD'],
  ['VALIDANDO', 'Validando'],
])

function etapaCeetpsCanonica(v) {
  const s = colapsarEspacios(v)
  if (!s || BASURA.has(s.toLowerCase())) return s
  const numMatch = s.match(/^(\d+)\b/)
  if (numMatch && ETAPA_CEETPS.has(numMatch[1])) return ETAPA_CEETPS.get(numMatch[1])
  const up = s.toUpperCase()
  if (ETAPA_CEETPS.has(up)) return ETAPA_CEETPS.get(up)
  return s // no mapeado: conservar
}

function acumularWarnings(row, nuevos) {
  if (!nuevos.length) return
  const prev = raw(row._warnings).trim()
  row._warnings = (prev ? prev + ' | ' : '') + nuevos.join(' | ')
}

function refinarCph(row, cat, stats) {
  const warns = []

  // 1-3) saneo de fechas por celda (basura, serial, anio roto)
  for (const col of FECHAS_CPH) {
    const r = limpiarFecha(row[col], col)
    row[col] = r.valor
    if (r.warning) warns.push(r.warning)
    if (r.cambio === 'anio') stats.aniosCorregidos++
    if (r.cambio === 'serial') stats.serialesConvertidos++
  }

  // 4) aplicar Respuesta del usuario (sobre fechas ya saneadas)
  const respuesta = raw(row.Respuesta)
  if (respuesta.trim()) {
    const cls = clasificarRespuesta(respuesta)
    switch (cls.tipo) {
      case 'fecha_explicita': {
        const col = detectarOutlier(row, cls.iso)
        if (col) {
          if (row[col] !== cls.iso) {
            warns.push(`Respuesta aplicada: ${col} ${raw(row[col])} -> ${cls.iso} (outlier, era ${cls.origen})`)
            row[col] = cls.iso
          }
          stats.respuestasAutomaticas++
        } else {
          warns.push(
            `Revisar manual: Respuesta indica fecha ${cls.origen} pero no se identifico la celda outlier`
          )
          stats.respuestasPendientes++
        }
        break
      }
      case 'anio_cubierto':
      case 'serial_cubierto':
        stats.respuestasCubiertasPorFecha++
        break
      case 'respetar_vacio':
      case 'baja_resolucion':
      case 'ok':
      case 'esp_cubierto':
      case 'informativa':
      default:
        // no requieren accion adicional (cubiertas por otras reglas o informativas)
        break
    }
  }

  // 5) normalizacion puesto / especialidad
  const psol = resolverCatalogo(cat.puestos, cat.alias, row.puesto_solicitado, 'puesto_solicitado')
  row.puesto_solicitado = psol.valor
  if (psol.warning) { warns.push(psol.warning); stats.puestosSinMatch.add(txt(row.puesto_solicitado)) }

  const esol = resolverCatalogo(cat.especialidades, cat.alias, row.especialidad_solicitada, 'especialidad_solicitada')
  row.especialidad_solicitada = esol.valor
  if (esol.warning) { warns.push(esol.warning); stats.especialidadesSinMatch.add(txt(row.especialidad_solicitada)) }

  const pbaja = resolverCatalogo(cat.puestos, cat.alias, row.puesto_baja, 'puesto_baja')
  row.puesto_baja = pbaja.valor
  if (pbaja.warning) { warns.push(pbaja.warning); stats.puestosSinMatch.add(txt(row.puesto_baja)) }

  const ebaja = resolverCatalogo(cat.especialidades, cat.alias, row.especialidad_baja, 'especialidad_baja')
  row.especialidad_baja = ebaja.valor
  if (ebaja.warning) { warns.push(ebaja.warning); stats.especialidadesSinMatch.add(txt(row.especialidad_baja)) }

  // 6) re-validacion reglas ETL anterior (sin romper lo bueno)
  row.cuil_baja = revalidarCuil(row.cuil_baja, 'baja', warns)
  row.cuil_designado = revalidarCuil(row.cuil_designado, 'designado', warns)
  row.ee_concurso = revalidarEE(row.ee_concurso, 'ee_concurso', warns, false)
  row.ee_baja = revalidarEE(row.ee_baja, 'ee_baja', warns, true) // puede ser RES...
  row.ee_designacion = revalidarEE(row.ee_designacion, 'ee_designacion', warns, false)
  row.nombre_designado = nombreDesignado(row.nombre_designado)
  row.etapa = colapsarEspacios(row.etapa).toUpperCase()

  acumularWarnings(row, warns)
  return row
}

function refinarCeetps(row, cat, stats) {
  const warns = []

  for (const col of FECHAS_CEETPS) {
    const r = limpiarFecha(row[col], col)
    row[col] = r.valor
    if (r.warning) warns.push(r.warning)
    if (r.cambio === 'anio') stats.aniosCorregidos++
    if (r.cambio === 'serial') stats.serialesConvertidos++
  }

  const psol = resolverCatalogo(cat.puestos, cat.alias, row.puesto_solicitado, 'puesto_solicitado')
  row.puesto_solicitado = psol.valor
  if (psol.warning) { warns.push(psol.warning); stats.puestosSinMatch.add(txt(row.puesto_solicitado)) }

  const pdes = resolverCatalogo(cat.puestos, cat.alias, row.puesto_designado, 'puesto_designado')
  row.puesto_designado = pdes.valor
  if (pdes.warning) { warns.push(pdes.warning); stats.puestosSinMatch.add(txt(row.puesto_designado)) }

  const ebaja = resolverCatalogo(cat.especialidades, cat.alias, row.especialidad_baja, 'especialidad_baja')
  row.especialidad_baja = ebaja.valor
  if (ebaja.warning) { warns.push(ebaja.warning); stats.especialidadesSinMatch.add(txt(row.especialidad_baja)) }

  row.cuil_baja = revalidarCuil(row.cuil_baja, 'baja', warns)
  row.cuil_designado = revalidarCuil(row.cuil_designado, 'designado', warns)
  row.expediente_concurso = revalidarEE(row.expediente_concurso, 'expediente_concurso', warns, false)
  row.expediente_designacion = revalidarEE(row.expediente_designacion, 'expediente_designacion', warns, false)
  row.ee_baja = revalidarEE(row.ee_baja, 'ee_baja', warns, true) // puede ser RES...
  row.nombre_designado = nombreDesignado(row.nombre_designado)
  row.etapa = etapaCeetpsCanonica(row.etapa)

  acumularWarnings(row, warns)
  return row
}

// -----------------------------------------------------------------------------
// Duplicados por expediente (D9, solo reporte)
// -----------------------------------------------------------------------------
function detectarDuplicados(filas, keyCol) {
  const mapa = new Map()
  filas.forEach((row, i) => {
    const k = raw(row[keyCol]).trim().toUpperCase()
    if (!k) return
    if (!mapa.has(k)) mapa.set(k, [])
    mapa.get(k).push(i)
  })
  const dups = []
  for (const [k, idxs] of mapa) if (idxs.length > 1) dups.push({ expediente: k, filas: idxs })
  return dups
}

// -----------------------------------------------------------------------------
// Nombre de salida incremental (no sobrescribe la entrada)
// -----------------------------------------------------------------------------
function nombreSalidaIncremental(inputPath) {
  const dir = path.dirname(inputPath)
  const hoy = new Date()
  const fechaStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  const base = path.basename(inputPath)
  const m = base.match(/^(\d+)/)
  const prefijo = m ? parseInt(m[1], 10) + 1 : 3
  let out = path.join(dir, `${prefijo}CONCURSOS_LIMPIO_${fechaStr}.xlsx`)
  let n = 2
  while (fs.existsSync(out) || path.resolve(out) === path.resolve(inputPath)) {
    out = path.join(dir, `${prefijo}CONCURSOS_LIMPIO_${fechaStr}_v${n}.xlsx`)
    n++
  }
  return out
}

// -----------------------------------------------------------------------------
// RESUMEN
// -----------------------------------------------------------------------------
function construirResumen(stats, filasCph, filasCeetps, dupsCph, dupsCeetps) {
  const rows = []
  const push = (seccion, detalle = '', valor = '') => rows.push({ seccion, detalle, valor })

  push('ETL Concursos - REFINADO (ETAPA 2)')
  push('Generado', new Date().toISOString())
  push('Entrada', stats.inputPath)
  push('')
  push('CONTEOS POR HOJA')
  push('CPH', 'filas', filasCph.length)
  push('CEETPS', 'filas', filasCeetps.length)
  push('TOTAL', '', filasCph.length + filasCeetps.length)
  push('')
  push('CORRECCIONES DE FECHA')
  push('años corregidos a 2026', '', stats.aniosCorregidos)
  push('seriales Excel convertidos', '', stats.serialesConvertidos)
  push('')
  push('RESPUESTAS DEL USUARIO (columna Respuesta, CPH)')
  push('aplicadas automaticamente (outlier reemplazada)', '', stats.respuestasAutomaticas)
  push('pendientes de revision manual', '', stats.respuestasPendientes)
  push('cubiertas por reglas de fecha (año/serial)', '', stats.respuestasCubiertasPorFecha)
  push('')

  const puestos = [...stats.puestosSinMatch].filter(Boolean).sort()
  push('PUESTOS SIN MATCH DE CATALOGO', `distintos=${puestos.length}`, puestos.length)
  for (const p of puestos) push('  puesto', p)
  push('')

  const esp = [...stats.especialidadesSinMatch].filter(Boolean).sort()
  push('ESPECIALIDADES SIN MATCH DE CATALOGO', `distintas=${esp.length}`, esp.length)
  for (const e of esp) push('  especialidad', e)
  push('')

  push('EXPEDIENTES DUPLICADOS (CPH)', `cantidad=${dupsCph.length}`, dupsCph.length)
  for (const d of dupsCph) push('  dup', d.expediente, `filas ${d.filas.join(', ')}`)
  push('EXPEDIENTES DUPLICADOS (CEETPS)', `cantidad=${dupsCeetps.length}`, dupsCeetps.length)
  for (const d of dupsCeetps) push('  dup', d.expediente, `filas ${d.filas.join(', ')}`)
  push('')

  const dudCph = filasCph.filter((r) => raw(r._warnings)).length
  const dudCeetps = filasCeetps.filter((r) => raw(r._warnings)).length
  push('FILAS CON _warnings (dudosas/revisar)')
  push('CPH', '', dudCph)
  push('CEETPS', '', dudCeetps)

  return rows
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  const inputPath = process.argv[2] || DEFAULT_INPUT
  if (!fs.existsSync(inputPath)) {
    throw new Error(`No existe el archivo de entrada: ${inputPath}`)
  }

  const XLSX = await loadXLSX()
  if (typeof XLSX.set_fs === 'function') XLSX.set_fs(fs)

  const cat = cargarCatalogo()
  const stats = {
    inputPath,
    aniosCorregidos: 0,
    serialesConvertidos: 0,
    respuestasAutomaticas: 0,
    respuestasPendientes: 0,
    respuestasCubiertasPorFecha: 0,
    puestosSinMatch: new Set(),
    especialidadesSinMatch: new Set(),
  }

  const wb = XLSX.read(fs.readFileSync(inputPath), { type: 'buffer', raw: true })
  const leer = (name) =>
    wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: true }) : []

  const filasCph = leer('CPH')
  const filasCeetps = leer('CEETPS')

  // unir claves para preservar TODAS las columnas/orden de la entrada
  const colsCph = filasCph.length ? Object.keys(filasCph[0]) : []
  const colsCeetps = filasCeetps.length ? Object.keys(filasCeetps[0]) : []

  for (const row of filasCph) refinarCph(row, cat, stats)
  for (const row of filasCeetps) refinarCeetps(row, cat, stats)

  const dupsCph = detectarDuplicados(filasCph, 'ee_concurso')
  const dupsCeetps = detectarDuplicados(filasCeetps, 'expediente_concurso')
  // marcar duplicados en _warnings sin borrar lo previo
  const dupSetCph = new Set(dupsCph.map((d) => d.expediente))
  for (const row of filasCph) {
    const k = raw(row.ee_concurso).trim().toUpperCase()
    if (k && dupSetCph.has(k)) acumularWarnings(row, ['DUPLICADO: expediente repetido (ver RESUMEN)'])
  }
  const dupSetCeetps = new Set(dupsCeetps.map((d) => d.expediente))
  for (const row of filasCeetps) {
    const k = raw(row.expediente_concurso).trim().toUpperCase()
    if (k && dupSetCeetps.has(k)) acumularWarnings(row, ['DUPLICADO: expediente repetido (ver RESUMEN)'])
  }

  const resumen = construirResumen(stats, filasCph, filasCeetps, dupsCph, dupsCeetps)

  // escribir el libro, preservando orden/union de columnas
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(filasCph, { header: colsCph }), 'CPH')
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(filasCeetps, { header: colsCeetps }), 'CEETPS')
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(resumen), 'RESUMEN')

  const outPath = nombreSalidaIncremental(inputPath)
  XLSX.writeFile(book, outPath)

  // --- log por consola ---
  console.log('===== ETL CONCURSOS -> REFINADO (ETAPA 2) =====')
  console.log(`Entrada: ${inputPath}`)
  console.log(`Salida : ${outPath}`)
  console.log('')
  console.log(`CPH filas    : ${filasCph.length}`)
  console.log(`CEETPS filas : ${filasCeetps.length}`)
  console.log('')
  console.log(`Años corregidos a 2026        : ${stats.aniosCorregidos}`)
  console.log(`Seriales Excel convertidos    : ${stats.serialesConvertidos}`)
  console.log(`Respuestas aplicadas (auto)   : ${stats.respuestasAutomaticas}`)
  console.log(`Respuestas pendientes (manual): ${stats.respuestasPendientes}`)
  console.log(`Respuestas cubiertas x fecha  : ${stats.respuestasCubiertasPorFecha}`)
  console.log('')
  console.log(`Puestos sin match (distintos)       : ${stats.puestosSinMatch.size}`)
  console.log(`Especialidades sin match (distintas): ${stats.especialidadesSinMatch.size}`)
  console.log(`Duplicados CPH    : ${dupsCph.length}`)
  console.log(`Duplicados CEETPS : ${dupsCeetps.length}`)
  console.log('===============================================')
}

main().catch((err) => {
  console.error('ERROR en ETL refinar:', err)
  process.exit(1)
})
