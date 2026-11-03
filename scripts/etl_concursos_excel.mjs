// ETL Concursos -> Excel limpio (ETAPA 1)
// -----------------------------------------------------------------------------
// Lee los 6 CSV de concursos (Doc/Referencias/Concursos/), normaliza y limpia,
// y produce UN libro .xlsx con 3 hojas: CPH, CEETPS, RESUMEN.
//
// NO toca Neon, NO modifica schema, NO hace red. Solo lee archivos locales y
// escribe el .xlsx de salida. El catalogo de puestos/especialidades se lee del
// archivo JSON prisma/catalogo-puestos-curado.json (sin tocar la base).
//
// Decisiones del usuario aplicadas (ver .agents/tasks/etl-concursos/MAPEO.md §7):
//   D1: FECHA RESOLUCION duplicada (CPH col 57 y 61) -> usar col 57; si difieren, warning.
//   D2: NO descartar filas. Procesar TODAS las filas con datos reales; marcar
//       las dudosas en _warnings y reportarlas en RESUMEN (no forzar 281/88).
//   D3: Puestos/especialidades -> matchear (normalizado) contra el catalogo del
//       sistema; si matchea, valor del sistema; si no, texto crudo + warning.
//   D4: Dejar VACIAS las celdas que no correspondan a la etapa. No inventar,
//       no rellenar, no volcar a observaciones. Warning solo si se pierde un dato.
//   D5: Columna 'etapa' con el punto REAL del proceso (CPH: SUB ESTADO col 8;
//       CEETPS: ESTADO CONCURSO col 0 mapeado a etapa legible).
//   D6: Fechas con anios inverosimiles -> conservar tal cual + warning.
//   D7: id_cargo_legacy / cargos_2_0 se transportan tal cual (sin equiparar).
//   D8: CEETPS -> mapear ESTADO CONCURSO (jerga numerada) a etapa legible.
//   D9: Revisar y REPORTAR expedientes duplicados (intra e inter archivo), sin
//       borrar; marcar en _warnings.
// -----------------------------------------------------------------------------

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..') // .worktrees/etl-concursos-excel

// Los CSV de concursos y el .xlsx de salida viven en el repo BASE
// (Doc/Referencias/*.csv esta en .gitignore, por eso no estan dentro del
// worktree). El worktree vive en <base>/.worktrees/etl-concursos-excel, asi que
// el repo base esta dos niveles arriba. Si por algun layout distinto el
// directorio no existiera alli, se cae de vuelta al propio worktree.
const BASE_REPO = path.resolve(REPO_ROOT, '..', '..')
function primerDirExistente(...dirs) {
  for (const d of dirs) if (fs.existsSync(d)) return d
  return dirs[0]
}
const CONCURSOS_DIR = primerDirExistente(
  path.join(BASE_REPO, 'Doc', 'Referencias', 'Concursos'),
  path.join(REPO_ROOT, 'Doc', 'Referencias', 'Concursos')
)
// El catalogo si esta versionado dentro del worktree; preferir el del worktree.
const CATALOGO_PATH = primerDirExistente(
  path.join(REPO_ROOT, 'prisma', 'catalogo-puestos-curado.json'),
  path.join(BASE_REPO, 'prisma', 'catalogo-puestos-curado.json')
)

// -----------------------------------------------------------------------------
// Carga de la libreria xlsx (ya esta en el repo; el worktree no tiene
// node_modules propio, asi que la buscamos en el store pnpm del repo base).
// -----------------------------------------------------------------------------
async function loadXLSX() {
  const candidates = [
    // repo base (dos niveles arriba del worktree): node_modules/.pnpm/xlsx@*
    path.resolve(REPO_ROOT, '..', '..', 'node_modules', 'xlsx', 'xlsx.mjs'),
  ]
  // buscar cualquier version de xlsx dentro del store pnpm del repo base
  const pnpmDir = path.resolve(REPO_ROOT, '..', '..', 'node_modules', '.pnpm')
  if (fs.existsSync(pnpmDir)) {
    for (const entry of fs.readdirSync(pnpmDir)) {
      if (/^xlsx@/.test(entry)) {
        candidates.push(path.join(pnpmDir, entry, 'node_modules', 'xlsx', 'xlsx.mjs'))
      }
    }
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return await import(pathToFileURL(c).href)
    }
  }
  throw new Error(
    "No se encontro la libreria 'xlsx' en el store del repo. Candidatos:\n" +
      candidates.join('\n')
  )
}

// -----------------------------------------------------------------------------
// Parser CSV RFC4180 propio: comillas, "" escapadas, saltos de linea embebidos
// dentro de celdas entre comillas, y CRLF. NO parte por lineas.
// -----------------------------------------------------------------------------
function parseCSV(text) {
  // Quitar BOM si existe
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === ',') {
        row.push(field)
        field = ''
      } else if (c === '\r') {
        // ignorar CR; el LF cierra la fila
      } else if (c === '\n') {
        row.push(field)
        rows.push(row)
        row = []
        field = ''
      } else {
        field += c
      }
    }
  }
  // ultima celda/fila si el archivo no termina en \n
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// -----------------------------------------------------------------------------
// Helpers de normalizacion (MAPEO.md §4)
// -----------------------------------------------------------------------------

// Tokens de celda que significan "vacio / basura" -> celda en blanco.
const BASURA = new Set([
  '',
  '-',
  '--',
  'no hallado',
  '#value!',
  '#name?',
  '#ref!',
  '#n/a',
  'n/a',
  'false',
  'true',
  '#div/0!',
  '#null!',
  '#num!',
])

function raw(v) {
  return (v ?? '').toString()
}

// texto limpio: trim + colapsar espacios internos. Devuelve '' si es basura.
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

// normaliza para matchear contra catalogo/claves: mayus, sin acentos, sin
// espacios multiples.
function norm(s) {
  return raw(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

// Sigla de efector/hospital: trim + mayus; '' si es basura (-, vacio, etc.).
function sigla(v) {
  const s = norm(v)
  if (BASURA.has(s.toLowerCase())) return ''
  return s
}

// Fecha dd/mm/aaaa (con o sin cero) -> ISO YYYY-MM-DD.
// Devuelve { iso, warning } ; iso='' si no es fecha valida.
function fecha(v) {
  const s = raw(v).trim()
  if (BASURA.has(s.toLowerCase())) return { iso: '', warning: '' }
  // tolerar separadores / o -
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (!m) {
    // podria ser una fecha serial de Excel o texto raro -> warning, no romper
    return { iso: '', warning: `fecha no parseable: "${s}"` }
  }
  let [, d, mo, y] = m
  d = parseInt(d, 10)
  mo = parseInt(mo, 10)
  y = parseInt(y, 10)
  if (y < 100) y += 2000 // aaaa de 2 digitos
  if (mo < 1 || mo > 12 || d < 1 || d > 31) {
    return { iso: '', warning: `fecha fuera de rango: "${s}"` }
  }
  const iso = `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  let warning = ''
  if (y < 2018 || y > 2028) {
    // D6: conservar + warning (anios inverosimiles 2029/2036/2040, o muy viejos)
    warning = `fecha con anio inverosimil: "${s}" -> ${iso}`
  }
  return { iso, warning }
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
  else if (dv === 10) dv = 9 // caso especial AFIP
  return dv === parseInt(digits[10], 10)
}

// CUIL -> 11 digitos validados. Devuelve { cuil, warning }.
// `alt` es un CUIL alternativo (p.ej. 'CUIL SIN GUION') para completar/validar.
function cuil(v, alt) {
  const s = raw(v).trim()
  const sClean = s.toLowerCase()
  const altS = raw(alt).trim()
  const digits = s.replace(/\D/g, '')
  const altDigits = altS.replace(/\D/g, '')
  // elegir el primero que tenga 11 digitos
  const cand = digits.length === 11 ? digits : altDigits.length === 11 ? altDigits : digits || altDigits
  if (!cand) return { cuil: '', warning: '' }
  if (BASURA.has(sClean) && !altDigits) return { cuil: '', warning: '' }
  if (cand.length !== 11) {
    return { cuil: '', warning: `CUIL con ${cand.length} digitos (invalido): "${s || altS}"` }
  }
  if (!validarCuil(cand)) {
    return { cuil: cand, warning: `CUIL no pasa validacion (prefijo/digito): "${cand}"` }
  }
  return { cuil: cand, warning: '' }
}

// Expediente EE -> colapsar espacios multiples + trim; conservar string.
// Marca warning si no parece un EX-... valido.
function expediente(v) {
  const s = raw(v).replace(/\s+/g, ' ').trim()
  if (BASURA.has(s.toLowerCase())) return { ee: '', warning: '' }
  let warning = ''
  if (!/^EX[-\s]/i.test(s)) {
    warning = `expediente no tiene formato EX-: "${s}"`
  }
  return { ee: s, warning }
}

// Booleanos SI/TRUE/X/1 -> true ; NO/FALSE/0/vacio -> false.
function bool(v) {
  const s = raw(v).trim().toLowerCase()
  if (['si', 'sí', 'true', 'x', '1', 'verdadero'].includes(s)) return true
  return false
}

// Entero (Q INSCRIPTOS, carga horaria). Devuelve '' si no es numero.
function entero(v) {
  const s = raw(v).trim()
  if (BASURA.has(s.toLowerCase())) return ''
  const n = parseInt(s.replace(/[^\d-]/g, ''), 10)
  return Number.isFinite(n) ? n : ''
}

// Textos "sin designar" en campos de nombre/designacion -> '' .
const SIN_DESIGNAR = new Set([
  'vacante a cubrir',
  'vacante',
  'no hallado',
  'solicitado',
  'dotacion',
  'dotación',
  's/d',
  'sin designar',
])
function nombreDesignado(v) {
  const s = raw(v).replace(/\s+/g, ' ').trim()
  if (!s) return ''
  if (BASURA.has(s.toLowerCase()) || SIN_DESIGNAR.has(s.toLowerCase())) return ''
  // si es solo digitos (un CUIL mal ubicado) no es un nombre
  if (/^\d{6,}$/.test(s.replace(/\D/g, '')) && /^\d[\d-]*$/.test(s)) return ''
  return s
}

// -----------------------------------------------------------------------------
// Catalogo de puestos / especialidades (match D3)
// -----------------------------------------------------------------------------
function cargarCatalogo() {
  const data = JSON.parse(fs.readFileSync(CATALOGO_PATH, 'utf8'))
  // mapa norm(nombre) -> nombre canonico del sistema
  const puestos = new Map()
  // mapa norm(especialidad) -> especialidad canonica del sistema
  const especialidades = new Map()
  for (const item of data) {
    const nombre = raw(item.nombre).trim()
    if (nombre) {
      const key = norm(nombre)
      if (!puestos.has(key)) puestos.set(key, nombre)
    }
    for (const esp of item.especialidades || []) {
      const e = raw(esp).trim()
      if (e) {
        const key = norm(e)
        if (!especialidades.has(key)) especialidades.set(key, e)
      }
    }
  }
  return { puestos, especialidades }
}

// Resuelve un puesto contra el catalogo. Devuelve { valor, warning }.
// Si matchea -> valor del sistema; si no -> texto crudo + warning.
function resolverCatalogo(mapa, textoCrudo, etiqueta) {
  const crudo = txt(textoCrudo)
  if (!crudo) return { valor: '', warning: '' }
  const key = norm(crudo)
  if (mapa.has(key)) {
    return { valor: mapa.get(key), warning: '' }
  }
  return { valor: crudo, warning: `${etiqueta} sin match en catalogo: "${crudo}"` }
}

// -----------------------------------------------------------------------------
// Mapeo de etapas
// -----------------------------------------------------------------------------

// CPH: el SUB ESTADO (col 8) ya es canonico. Lo llevamos tal cual (trim),
// normalizando solo el separador/espacios. Mantiene el codigo de letra.
function etapaCph(subEstadoRaw) {
  const s = raw(subEstadoRaw).replace(/\s+/g, ' ').trim()
  if (!s || BASURA.has(s.toLowerCase())) return { etapa: '', warning: 'CPH sin SUB ESTADO' }
  return { etapa: s.toUpperCase(), warning: '' }
}

// CEETPS: ESTADO CONCURSO en jerga numerada -> etapa legible (D8).
// No se fuerza al enum del sistema; se deja la etapa descriptiva.
const ETAPA_CEETPS = new Map([
  ['1', '1 - Sin Autorizar'],
  ['2', '2 - Autorizado'],
  ['3', '3 - Dispo Llamado'],
  ['4', '4 - IFACS'],
  ['5', '5 - INSAL'],
  ['6', '6 - TAD'],
  ['VALIDANDO', 'Validando'],
])
function etapaCeetps(estadoRaw) {
  const s = raw(estadoRaw).replace(/\s+/g, ' ').trim()
  if (!s || BASURA.has(s.toLowerCase())) {
    return { etapa: '', warning: 'CEETPS sin ESTADO CONCURSO' }
  }
  // extraer el numero inicial si existe ("3 - Dispo Llamado" -> "3")
  const numMatch = s.match(/^(\d+)\b/)
  if (numMatch && ETAPA_CEETPS.has(numMatch[1])) {
    return { etapa: ETAPA_CEETPS.get(numMatch[1]), warning: '' }
  }
  const up = s.toUpperCase()
  if (ETAPA_CEETPS.has(up)) {
    return { etapa: ETAPA_CEETPS.get(up), warning: '' }
  }
  // estado no reconocido: conservar crudo + warning
  return { etapa: s, warning: `CEETPS estado no mapeado: "${s}"` }
}

// -----------------------------------------------------------------------------
// Procesamiento CPH (POF / POU / JEFES)
// -----------------------------------------------------------------------------
function procesarCph(rows, subCarrera, cat, stats) {
  const out = []
  const header = rows[0]
  for (let r = 1; r < rows.length; r++) {
    const c = rows[r]
    const col = (i) => raw(c[i])
    const warnings = []

    // --- fechas ---
    const fBaja = fecha(col(16))
    const fEeConc = fecha(col(22))
    const fAut = fecha(col(26))
    const fSorteo = fecha(col(27))
    const fInscD = fecha(col(30))
    const fInscH = fecha(col(31))
    const fExam = fecha(col(35))
    const fOm = fecha(col(38))
    const fIfacs = fecha(col(41))
    const fInsal = fecha(col(44))
    const fApto = fecha(col(53))
    const fIte = fecha(col(55))
    const fDispoD = fecha(col(67))
    // D1: FECHA RESOLUCION col 57 (primera) y 61 (segunda)
    const fReso57 = fecha(col(57))
    const fReso61 = fecha(col(61))
    for (const f of [
      fBaja, fEeConc, fAut, fSorteo, fInscD, fInscH, fExam, fOm, fIfacs, fInsal,
      fApto, fIte, fDispoD, fReso57, fReso61,
    ]) {
      if (f.warning) warnings.push(f.warning)
    }
    // usar col 57; si ambas tienen valor y difieren -> warning (D1)
    const fechaResolucion = fReso57.iso || ''
    if (fReso57.iso && fReso61.iso && fReso57.iso !== fReso61.iso) {
      warnings.push(`FECHA RESOLUCION difiere col57=${fReso57.iso} col61=${fReso61.iso} (se usa col57)`)
    } else if (!fReso57.iso && fReso61.iso) {
      warnings.push(`FECHA RESOLUCION col57 vacia, col61=${fReso61.iso} (se respeta D1: col57 vacia)`)
    }

    // --- cuils ---
    const cuilBaja = cuil(col(14))
    if (cuilBaja.warning) warnings.push('baja: ' + cuilBaja.warning)
    const cuilDes = cuil(col(50))
    if (cuilDes.warning) warnings.push('designado: ' + cuilDes.warning)

    // --- expedientes ---
    const eeConc = expediente(col(21))
    if (eeConc.warning) warnings.push('ee_concurso: ' + eeConc.warning)
    const eeBaja = expediente(col(13))
    if (eeBaja.warning) warnings.push('ee_baja: ' + eeBaja.warning)
    const eeDes = expediente(col(47))
    if (eeDes.warning) warnings.push('ee_designacion: ' + eeDes.warning)

    // --- puesto / especialidad (D3) ---
    const puestoSol = resolverCatalogo(cat.puestos, col(24), 'puesto_solicitado')
    if (puestoSol.warning) warnings.push(puestoSol.warning)
    const espSol = resolverCatalogo(cat.especialidades, col(25), 'especialidad_solicitada')
    if (espSol.warning) warnings.push(espSol.warning)
    const puestoBaja = resolverCatalogo(cat.puestos, col(18), 'puesto_baja')
    if (puestoBaja.warning) warnings.push(puestoBaja.warning)
    const espBaja = resolverCatalogo(cat.especialidades, col(19), 'especialidad_baja')
    if (espBaja.warning) warnings.push(espBaja.warning)

    // --- etapa (D5) ---
    const et = etapaCph(col(8))
    if (et.warning) warnings.push(et.warning)

    // --- sigla efector ---
    const siglaEfector = sigla(col(2))

    // --- identificadores de cargo (D7, transportar tal cual) ---
    const idCargoLegacy = txtKeep(col(75))
    const cargos20 = txtKeep(col(76))

    // --- deteccion de fila dudosa (D2: NO descartar, solo marcar) ---
    const tieneExpediente = !!eeConc.ee
    const estadoCsv = txt(col(7))
    const subEstadoCsv = txt(col(8))
    const dudosa = !tieneExpediente || !subEstadoCsv
    if (!tieneExpediente) warnings.push('DUDOSA: sin EE CONCURSO')
    if (!subEstadoCsv) warnings.push('DUDOSA: sin SUB ESTADO')

    const rowObj = {
      carrera: 'CPH',
      sub_carrera: subCarrera,
      etapa: et.etapa,
      sigla_efector: siglaEfector,
      hospital_descripcion: txt(col(1)),
      motivo_origen: txt(col(4)),
      ee_concurso: eeConc.ee,
      fecha_ee_concurso: fEeConc.iso,
      ee_baja: eeBaja.ee,
      fecha_baja: fBaja.iso,
      cuil_baja: cuilBaja.cuil,
      puesto_baja: puestoBaja.valor,
      especialidad_baja: espBaja.valor,
      puesto_solicitado: puestoSol.valor,
      especialidad_solicitada: espSol.valor,
      fecha_autorizacion: fAut.iso,
      sorteo_jurado: fSorteo.iso,
      fecha_insc_desde: fInscD.iso,
      fecha_insc_hasta: fInscH.iso,
      q_inscriptos: entero(col(32)),
      fecha_examen: fExam.iso,
      fecha_orden_merito: fOm.iso,
      fecha_ifacs: fIfacs.iso,
      insal: txt(col(43)),
      fecha_insal: fInsal.iso,
      ee_designacion: eeDes.ee,
      carga_documentacion: bool(col(52)) ? 'SI' : '',
      fecha_apto_medico: fApto.iso,
      fecha_ite: fIte.iso,
      proyecto_resolucion: bool(col(58)) ? 'SI' : '',
      reso_a_la_firma: bool(col(59)) ? 'SI' : '',
      resolucion_designacion: txt(col(60)),
      fecha_resolucion: fechaResolucion,
      cargo_sial: txtKeep(col(64)),
      suspendido: bool(col(65)) ? 'SI' : '',
      dispo_desierta: txt(col(66)),
      fecha_dispo_desierta: fDispoD.iso,
      cuil_designado: cuilDes.cuil,
      nombre_designado: nombreDesignado(col(49)),
      observaciones: txtKeep(col(68)),
      id_cargo_legacy: idCargoLegacy,
      cargos_2_0: cargos20,
      _warnings: warnings.join(' | '),
    }

    // registrar expediente para deteccion de duplicados (D9)
    stats.registrarExpediente(eeConc.ee, 'CPH', subCarrera, r)

    out.push(rowObj)
    stats.contarFila('CPH', subCarrera, dudosa)
  }
  return out
}

// -----------------------------------------------------------------------------
// Procesamiento CEETPS (ENFERMERIA / TECNICOS / ANEXO 2)
// -----------------------------------------------------------------------------
function procesarCeetps(rows, subCarrera, cat, stats) {
  const out = []
  for (let r = 1; r < rows.length; r++) {
    const c = rows[r]
    const col = (i) => raw(c[i])
    const warnings = []

    const et = etapaCeetps(col(0))
    if (et.warning) warnings.push(et.warning)

    const fIfacs = fecha(col(11))
    const fInsal = fecha(col(12))
    const fCarat = fecha(col(7))
    const fBaja = fecha(col(34))
    for (const f of [fIfacs, fInsal, fCarat, fBaja]) {
      if (f.warning) warnings.push(f.warning)
    }

    const expConc = expediente(col(5))
    if (expConc.warning) warnings.push('expediente_concurso: ' + expConc.warning)
    const expDes = expediente(col(13))
    if (expDes.warning) warnings.push('expediente_designacion: ' + expDes.warning)
    const eeBaja = expediente(col(26))
    if (eeBaja.warning) warnings.push('ee_baja: ' + eeBaja.warning)

    // CUIL designado col 15 ; baja col 30 con alterno 'CUIL SIN GUION' col 40
    const cuilDes = cuil(col(15))
    if (cuilDes.warning) warnings.push('designado: ' + cuilDes.warning)
    const cuilBaja = cuil(col(30), col(40))
    if (cuilBaja.warning) warnings.push('baja: ' + cuilBaja.warning)

    const puestoSol = resolverCatalogo(cat.puestos, col(9), 'puesto_solicitado')
    if (puestoSol.warning) warnings.push(puestoSol.warning)
    const puestoDes = resolverCatalogo(cat.puestos, col(14), 'puesto_designado')
    // puesto_designado: puede traer un CUIL mal ubicado -> si es solo digitos, no lo tratamos como puesto
    let puestoDesignadoValor = puestoDes.valor
    if (/^\d{6,}$/.test(norm(col(14)).replace(/\D/g, '')) && /^[\d-]+$/.test(txt(col(14)))) {
      puestoDesignadoValor = ''
      warnings.push(`puesto_designado parece un CUIL mal ubicado: "${txt(col(14))}"`)
    } else if (puestoDes.warning) {
      warnings.push(puestoDes.warning)
    }
    const puestoBaja = resolverCatalogo(cat.puestos, col(32), 'puesto_baja')
    if (puestoBaja.warning) warnings.push(puestoBaja.warning)
    const espBaja = resolverCatalogo(cat.especialidades, col(33), 'especialidad_baja')
    if (espBaja.warning) warnings.push(espBaja.warning)

    const siglaEfector = sigla(col(2))
    const idCargoLegacy = txtKeep(col(24))

    const cargaHoraria = entero(col(35))

    // D2: fila dudosa si no tiene expediente o no tiene estado claro
    const tieneExpediente = !!expConc.ee
    const estadoCrudo = txt(col(0))
    const dudosa = !tieneExpediente || !estadoCrudo
    if (!tieneExpediente) warnings.push('DUDOSA: sin EXPEDIENTE CONCURSO')
    if (!estadoCrudo) warnings.push('DUDOSA: sin ESTADO CONCURSO')

    const rowObj = {
      carrera: 'CEETPS',
      sub_carrera: subCarrera,
      etapa: et.etapa,
      sigla_efector: siglaEfector,
      hospital_descripcion: txt(col(3)),
      motivo_origen: txt(col(4)),
      expediente_concurso: expConc.ee,
      fecha_caratulacion: fCarat.iso,
      puesto_solicitado: puestoSol.valor,
      dispo_llamado: txtKeep(col(10)),
      carga_horaria: cargaHoraria,
      fecha_ifacs: fIfacs.iso,
      fecha_insal: fInsal.iso,
      expediente_designacion: expDes.ee,
      dispo_designacion: txtKeep(col(20)),
      resolucion_designacion: txtKeep(col(21)),
      cuil_designado: cuilDes.cuil,
      nombre_designado: nombreDesignado(col(16)),
      puesto_designado: puestoDesignadoValor,
      estado_apto: txt(col(17)),
      ee_baja: eeBaja.ee,
      sigla_baja: sigla(col(27)),
      cuil_baja: cuilBaja.cuil,
      fecha_baja: fBaja.iso,
      puesto_baja: puestoBaja.valor,
      especialidad_baja: espBaja.valor,
      motivo_baja: txt(col(36)),
      doc_respaldatoria_baja: txtKeep(col(37)),
      observaciones: txtKeep(col(23)),
      id_cargo_legacy: idCargoLegacy,
      _warnings: warnings.join(' | '),
    }

    stats.registrarExpediente(expConc.ee, 'CEETPS', subCarrera, r)
    out.push(rowObj)
    stats.contarFila('CEETPS', subCarrera, dudosa)
  }
  return out
}

// -----------------------------------------------------------------------------
// Acumulador de estadisticas / calidad
// -----------------------------------------------------------------------------
function crearStats() {
  const porArchivo = new Map() // subCarrera -> {carrera, leidas, dudosas}
  const expedientes = new Map() // ee -> [{hoja, subCarrera, fila}]
  const siglasSinMatch = new Map() // (se completa aparte si hay catalogo offline)
  return {
    porArchivo,
    expedientes,
    siglasSinMatch,
    setLeidas(carrera, subCarrera, leidas) {
      const e = porArchivo.get(subCarrera) || { carrera, leidas: 0, conDatos: 0, dudosas: 0 }
      e.carrera = carrera
      e.leidas = leidas
      porArchivo.set(subCarrera, e)
    },
    contarFila(carrera, subCarrera, dudosa) {
      const e = porArchivo.get(subCarrera) || { carrera, leidas: 0, conDatos: 0, dudosas: 0 }
      e.carrera = carrera
      e.conDatos += 1
      if (dudosa) e.dudosas += 1
      porArchivo.set(subCarrera, e)
    },
    registrarExpediente(ee, hoja, subCarrera, fila) {
      if (!ee) return
      const key = ee.toUpperCase()
      if (!expedientes.has(key)) expedientes.set(key, [])
      expedientes.get(key).push({ hoja, subCarrera, fila })
    },
  }
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  const XLSX = await loadXLSX()
  // En Node ESM, xlsx necesita que se le inyecte el modulo fs para escribir.
  if (typeof XLSX.set_fs === 'function') XLSX.set_fs(fs)
  const cat = cargarCatalogo()
  const stats = crearStats()

  const archivosCph = [
    ['CONTABILIZACION CARGOS - POF.csv', 'POF'],
    ['CONTABILIZACION CARGOS - POU.csv', 'POU'],
    ['CONTABILIZACION CARGOS - JEFES.csv', 'JEFES'],
  ]
  const archivosCeetps = [
    ['CONTABILIZACION CARGOS - ENFERMERIA.csv', 'ENFERMERIA'],
    ['CONTABILIZACION CARGOS - TECNICOS.csv', 'TECNICOS'],
    ['CONTABILIZACION CARGOS - ANEXO 2.csv', 'ANEXO2'],
  ]

  const filasCph = []
  for (const [file, sub] of archivosCph) {
    const full = path.join(CONCURSOS_DIR, file)
    const text = fs.readFileSync(full, 'utf8')
    const rows = parseCSV(text)
    stats.setLeidas('CPH', sub, rows.length - 1)
    const procesadas = procesarCph(rows, sub, cat, stats)
    filasCph.push(...procesadas)
  }

  const filasCeetps = []
  for (const [file, sub] of archivosCeetps) {
    const full = path.join(CONCURSOS_DIR, file)
    const text = fs.readFileSync(full, 'utf8')
    const rows = parseCSV(text)
    stats.setLeidas('CEETPS', sub, rows.length - 1)
    const procesadas = procesarCeetps(rows, sub, cat, stats)
    filasCeetps.push(...procesadas)
  }

  // --- duplicados por expediente (D9) ---
  const duplicados = []
  for (const [ee, apariciones] of stats.expedientes) {
    if (apariciones.length > 1) {
      duplicados.push({ expediente: ee, apariciones })
    }
  }
  // marcar los duplicados en _warnings de cada fila afectada
  const dupSet = new Set(duplicados.map((d) => d.expediente))
  for (const row of filasCph) {
    if (row.ee_concurso && dupSet.has(row.ee_concurso.toUpperCase())) {
      row._warnings = (row._warnings ? row._warnings + ' | ' : '') + 'DUPLICADO: expediente repetido (ver RESUMEN)'
    }
  }
  for (const row of filasCeetps) {
    if (row.expediente_concurso && dupSet.has(row.expediente_concurso.toUpperCase())) {
      row._warnings = (row._warnings ? row._warnings + ' | ' : '') + 'DUPLICADO: expediente repetido (ver RESUMEN)'
    }
  }

  // --- metricas de calidad ---
  const puestosSinMatch = new Set()
  const especialidadesSinMatch = new Set()
  const siglasRevisar = new Set()
  const contarSinMatch = (rows, puestoCols, espCols) => {
    for (const row of rows) {
      const w = row._warnings || ''
      if (/puesto_\w+ sin match/.test(w)) {
        const m = w.match(/puesto_\w+ sin match en catalogo: "([^"]+)"/g) || []
        m.forEach((x) => puestosSinMatch.add(x.replace(/.*"([^"]+)"$/, '$1')))
      }
      if (/especialidad_\w+ sin match/.test(w)) {
        const m = w.match(/especialidad_\w+ sin match en catalogo: "([^"]+)"/g) || []
        m.forEach((x) => especialidadesSinMatch.add(x.replace(/.*"([^"]+)"$/, '$1')))
      }
    }
  }
  contarSinMatch(filasCph)
  contarSinMatch(filasCeetps)

  // --- construir hoja RESUMEN ---
  const resumenRows = []
  resumenRows.push({ seccion: 'ETL Concursos - Excel limpio (ETAPA 1)', detalle: '', valor: '' })
  resumenRows.push({ seccion: 'Generado', detalle: new Date().toISOString(), valor: '' })
  resumenRows.push({ seccion: '', detalle: '', valor: '' })
  resumenRows.push({ seccion: 'CONTEOS POR ARCHIVO', detalle: 'filas leidas / con datos / dudosas', valor: '' })

  let totalCph = 0
  let totalCeetps = 0
  let totalDudosas = 0
  const ordenSub = ['POF', 'POU', 'JEFES', 'ENFERMERIA', 'TECNICOS', 'ANEXO2']
  for (const sub of ordenSub) {
    const e = stats.porArchivo.get(sub)
    if (!e) continue
    resumenRows.push({
      seccion: `${e.carrera} / ${sub}`,
      detalle: `leidas=${e.leidas}  conDatos=${e.conDatos}  dudosas=${e.dudosas}`,
      valor: e.conDatos,
    })
    if (e.carrera === 'CPH') totalCph += e.conDatos
    else totalCeetps += e.conDatos
    totalDudosas += e.dudosas
  }
  resumenRows.push({ seccion: '', detalle: '', valor: '' })
  resumenRows.push({ seccion: 'TOTAL CPH', detalle: 'POF+POU+JEFES', valor: totalCph })
  resumenRows.push({ seccion: 'TOTAL CEETPS', detalle: 'ENF+TEC+ANEXO2', valor: totalCeetps })
  resumenRows.push({ seccion: 'TOTAL GENERAL', detalle: '', valor: totalCph + totalCeetps })
  resumenRows.push({ seccion: 'FILAS DUDOSAS', detalle: 'sin expediente y/o sin estado (NO descartadas, D2)', valor: totalDudosas })

  resumenRows.push({ seccion: '', detalle: '', valor: '' })
  resumenRows.push({ seccion: 'EXPEDIENTES DUPLICADOS (D9)', detalle: `cantidad=${duplicados.length}`, valor: duplicados.length })
  for (const d of duplicados) {
    const where = d.apariciones.map((a) => `${a.subCarrera}#fila${a.fila}`).join(', ')
    resumenRows.push({ seccion: '  dup', detalle: d.expediente, valor: where })
  }

  resumenRows.push({ seccion: '', detalle: '', valor: '' })
  resumenRows.push({
    seccion: 'PUESTOS SIN MATCH DE CATALOGO',
    detalle: `valores distintos=${puestosSinMatch.size}`,
    valor: puestosSinMatch.size,
  })
  for (const p of [...puestosSinMatch].sort()) {
    resumenRows.push({ seccion: '  puesto', detalle: p, valor: '' })
  }
  resumenRows.push({ seccion: '', detalle: '', valor: '' })
  resumenRows.push({
    seccion: 'ESPECIALIDADES SIN MATCH DE CATALOGO',
    detalle: `valores distintos=${especialidadesSinMatch.size}`,
    valor: especialidadesSinMatch.size,
  })
  for (const p of [...especialidadesSinMatch].sort()) {
    resumenRows.push({ seccion: '  especialidad', detalle: p, valor: '' })
  }

  // conteo de filas con warnings
  const warnCph = filasCph.filter((r) => r._warnings).length
  const warnCeetps = filasCeetps.filter((r) => r._warnings).length
  resumenRows.push({ seccion: '', detalle: '', valor: '' })
  resumenRows.push({ seccion: 'FILAS CON _warnings (CPH)', detalle: '', valor: warnCph })
  resumenRows.push({ seccion: 'FILAS CON _warnings (CEETPS)', detalle: '', valor: warnCeetps })

  // --- escribir el libro ---
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(filasCph), 'CPH')
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(filasCeetps), 'CEETPS')
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(resumenRows), 'RESUMEN')

  const hoy = new Date()
  const fechaStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  const outPath = path.join(CONCURSOS_DIR, `CONCURSOS_LIMPIO_${fechaStr}.xlsx`)
  XLSX.writeFile(book, outPath)

  // --- resumen por consola ---
  console.log('===== ETL CONCURSOS -> EXCEL LIMPIO =====')
  console.log(`Salida: ${outPath}`)
  console.log('')
  console.log('Conteos por archivo (leidas / conDatos / dudosas):')
  for (const sub of ordenSub) {
    const e = stats.porArchivo.get(sub)
    if (!e) continue
    console.log(`  ${e.carrera.padEnd(7)} ${sub.padEnd(11)} leidas=${e.leidas}  conDatos=${e.conDatos}  dudosas=${e.dudosas}`)
  }
  console.log('')
  console.log(`TOTAL CPH    : ${totalCph}`)
  console.log(`TOTAL CEETPS : ${totalCeetps}`)
  console.log(`TOTAL GENERAL: ${totalCph + totalCeetps}`)
  console.log(`Filas dudosas (no descartadas, D2): ${totalDudosas}`)
  console.log('')
  console.log(`Expedientes duplicados (D9): ${duplicados.length}`)
  for (const d of duplicados.slice(0, 20)) {
    console.log(`  ${d.expediente}  ->  ${d.apariciones.map((a) => `${a.subCarrera}#fila${a.fila}`).join(', ')}`)
  }
  console.log('')
  console.log(`Puestos sin match de catalogo (distintos): ${puestosSinMatch.size}`)
  console.log(`Especialidades sin match de catalogo (distintos): ${especialidadesSinMatch.size}`)
  console.log(`Filas con _warnings: CPH=${warnCph}  CEETPS=${warnCeetps}`)
  console.log('=========================================')
}

main().catch((err) => {
  console.error('ERROR en ETL:', err)
  process.exit(1)
})
