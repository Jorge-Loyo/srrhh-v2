// carga_seguimientos_cph.mjs
// Carga el CSV seguimientos_concursos_limpio.csv (7.377 registros) a la BD.
//
// Estrategia:
//   1. Por cada fila, busca el ConcursoCph por cargo_baja (id_sial del cargo).
//   2. Si lo encuentra, actualiza los campos del CSV que no estén ya cargados.
//   3. Si no lo encuentra, lo registra como PENDIENTE (no crea registros huérfanos).
//
// Uso:
//   wsl bash -c "cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy && DATABASE_URL='postgresql://srrhh_user:srrhh_pass@localhost:5432/srrhh_db' node scripts/carga_seguimientos_cph.mjs"
//
// Flags:
//   --dry-run   Solo muestra estadísticas sin escribir en BD
//   --limit=N   Procesa solo los primeros N registros

import { createReadStream } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CSV_PATH = resolve(__dirname, '../../Seguimientos-Alexis/output/seguimientos_concursos_limpio.csv')

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const LIMIT = (() => {
  const f = args.find(a => a.startsWith('--limit='))
  return f ? parseInt(f.split('=')[1]) : Infinity
})()

const prisma = new PrismaClient()

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDate(val) {
  if (!val || val.trim() === '' || val === 'false' || val === 'true') return null
  // Formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(val.trim())) return new Date(val.trim())
  return null
}

function parseBool(val) {
  if (val === 'true' || val === 'TRUE' || val === '1' || val === 'SI' || val === 'si') return true
  if (val === 'false' || val === 'FALSE' || val === '0' || val === 'NO' || val === 'no') return false
  return null
}

function parseIntVal(val) {
  const n = parseInt(val)
  return isNaN(n) ? null : n
}

// Parsea CSV respetando campos entre comillas con comas internas
function parseCsvLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

// ─── Mapeo CSV → BD ──────────────────────────────────────────────────────────
// Columnas del CSV (índice 0-based):
// 0  usuario
// 1  descripcion_efector
// 2  sigla
// 3  tipo_de_efector
// 4  tipificador_1_origen
// 5  tipificador_2
// 6  tipificador_3
// 7  estado
// 8  sub_estado
// 9  sub_estado3
// 10 cambio_especialidad
// 11 tipo_de_baja
// 12 cargo_baja           ← id_sial del cargo (clave de búsqueda)
// 13 ee_baja_ampliacion
// 14 cuil_baja
// 15 nombre_baja
// 16 fecha_baja
// 17 escalafon_1
// 18 puesto_1
// 19 especialidad_baja
// 20 tiempo_desde_que_se_genero_la_baja
// 21 ee_concurso
// 22 fecha_ee_concurso
// 23 escalafon_2
// 24 puesto_2
// 25 especialidad_solicitada_2
// 26 fecha_autorizacion
// 27 sorteo_de_jurado     ← bool en CSV (true/false), Date en BD → null si true (pendiente)
// 28 tiempo_desde_que_se_solicito_autorizacion
// 29 disposicion
// 30 fecha_insc_desde
// 31 fecha_insc_hasta
// 32 q_inscriptos
// 33 tiempo_que_tiene_autorizacion
// 34 examen_publicado
// 35 fecha_examen
// 36 tiempo_que_falta_para_el_cierre_de_inscripcion_tiempos_sin_fecha_de_examen
// 37 orden_de_merito      ← expediente IF del OM (string)
// 38 fecha_om             ← fecha real del OM
// 39 tiempo_hasta_el_examen_tiempo_pendiente_sin_orden_de_merito
// 40 finalizado
// 41 fecha_ifacs
// 42 tiempo_pendiente_ifac
// 43 insal                ← expediente IF del INSAL
// 44 fecha_insal
// 45 tiempo_pendiente_firmar_insal
// 46 tiempo_total_de_adjudicion
// 47 ee_designacion
// 48 fecha_ee_designacion
// 49 nombre_designacion
// 50 cuil                 ← cuil del designado
// 51 tiempo_pendiente_generar_tad
// 52 carga_de_documentacion
// 53 fecha_apto_medico
// 54 arco_temporal_tad_apto
// 55 fecha_ite
// 56 arco_temporal_tad_ite
// 57 fecha_resolucion
// 58 proyecto_de_resolucion
// 59 reso_a_la_firma
// 60 resolucion_de_designacion
// 61 fecha_resolucion_1   ← fecha real de la resolución
// 62 arco_temporal_prox_a_designarse
// 63 fecha_cargo
// 64 cargo_sial
// 65 suspendido
// 66 dispo_desierta
// 67 fecha_dispo_desierta
// 68 observaciones
// 69 conteo_concurso
// 70 clave_pou
// 71 subestado_3_pou

function rowToPatch(cols) {
  const v = (i) => (cols[i] ?? '').trim()

  return {
    // Baja
    eeBaja:               v(13) || null,
    fechaBaja:            parseDate(v(16)),
    // Concurso
    eeConcurso:           v(21) || null,
    fechaEeConcurso:      parseDate(v(22)),
    especialidadSolicitada: v(25) || null,
    // Autorización
    fechaAutorizacion:    parseDate(v(26)),
    // sorteo_de_jurado es bool en CSV — si true, hay sorteo pero sin fecha exacta → null
    // Si ya tiene fecha en BD, no pisamos
    sorteoJurado:         null, // se maneja aparte
    disposicion:          v(29) || null,
    // Inscripción
    fechaInscDesde:       parseDate(v(30)),
    fechaInscHasta:       parseDate(v(31)),
    qInscriptos:          parseIntVal(v(32)),
    // Examen
    fechaExamen:          parseDate(v(35)),
    // Orden de mérito
    fechaOrdenMerito:     parseDate(v(38)),
    // IFACS / INSAL
    ifacs:                v(37) || null,   // expediente IF del OM (columna orden_de_merito)
    insal:                v(43) || null,   // expediente IF del INSAL
    fechaIfacs:           parseDate(v(41)),
    fechaInsal:           parseDate(v(44)),
    // Designación
    eeDesignacion:        v(47) || null,
    cargaDocumentacion:   parseBool(v(52)),
    fechaAptoMedico:      parseDate(v(53)),
    fechaIte:             parseDate(v(55)),
    proyectoResolucion:   parseBool(v(58)),
    resoALaFirma:         parseBool(v(59)),
    resolucionDesignacion: v(60) || null,
    fechaResolucion:      parseDate(v(61)),
    cargoSial:            v(64) || null,
    // Desierto
    dispoDesierta:        v(66) || null,
    fechaDispoDesierta:   parseDate(v(67)),
    // Extras
    cambioEspecialidad:   parseBool(v(10)) ?? false,
    suspendido:           parseBool(v(65)) ?? false,
    observaciones:        v(68) || null,
    // Tipificador de origen → se guarda en la Baja asociada, no en ConcursoCph
    _tipificadorOrigen:   v(4) || null,
    _sorteoJuradoBool:    parseBool(v(27)),
    _cargoBaja:           v(12),
    _sigla:               v(2),
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n📂 CSV: ${CSV_PATH}`)
  console.log(`🔧 Modo: ${DRY_RUN ? 'DRY RUN' : 'ESCRITURA'}${LIMIT < Infinity ? ` | Límite: ${LIMIT}` : ''}\n`)

  // Leer CSV completo
  const content = await new Promise((resolve, reject) => {
    let data = ''
    createReadStream(CSV_PATH, { encoding: 'utf-8' })
      .on('data', chunk => { data += chunk })
      .on('end', () => resolve(data))
      .on('error', reject)
  })

  const lines = content.split('\n').filter(l => l.trim())
  const rows = lines.slice(1) // skip header
  const total = Math.min(rows.length, LIMIT)

  console.log(`📊 Total filas a procesar: ${total}\n`)

  const stats = { actualizados: 0, sinCargo: 0, sinConcurso: 0, errores: 0, saltados: 0 }
  const pendientes = []

  for (let i = 0; i < total; i++) {
    const cols = parseCsvLine(rows[i])
    const patch = rowToPatch(cols)
    const cargoBaja = patch._cargoBaja
    const sigla = patch._sigla

    if (!cargoBaja) {
      stats.sinCargo++
      continue
    }

    try {
      // Buscar el cargo por id_sial
      const cargo = await prisma.cargo.findUnique({ where: { idSial: cargoBaja } })
      if (!cargo) {
        stats.sinCargo++
        pendientes.push({ motivo: 'cargo_no_encontrado', cargoBaja, sigla })
        continue
      }

      // Buscar el ConcursoCph activo para ese cargo
      // Puede haber múltiples — tomamos el más reciente
      const concurso = await prisma.concursoCph.findFirst({
        where: { cargoId: cargo.id },
        orderBy: { createdAt: 'desc' },
      })

      if (!concurso) {
        stats.sinConcurso++
        pendientes.push({ motivo: 'concurso_no_encontrado', cargoBaja, sigla })
        continue
      }

      // Construir el update — solo pisamos campos null en BD
      const data = {}

      const camposFecha = [
        'fechaBaja', 'fechaEeConcurso', 'fechaAutorizacion', 'fechaInscDesde',
        'fechaInscHasta', 'fechaExamen', 'fechaOrdenMerito', 'fechaIfacs',
        'fechaInsal', 'fechaAptoMedico', 'fechaIte', 'fechaResolucion', 'fechaDispoDesierta',
      ]
      const camposString = [
        'eeBaja', 'eeConcurso', 'especialidadSolicitada', 'disposicion',
        'eeDesignacion', 'resolucionDesignacion', 'cargoSial', 'dispoDesierta',
        'observaciones', 'ifacs', 'insal',
      ]
      const camposBool = ['cargaDocumentacion', 'proyectoResolucion', 'resoALaFirma', 'suspendido', 'cambioEspecialidad']
      const camposInt = ['qInscriptos']

      for (const campo of camposFecha) {
        if (patch[campo] !== null && concurso[campo] === null) data[campo] = patch[campo]
      }
      for (const campo of camposString) {
        if (patch[campo] !== null && !concurso[campo]) data[campo] = patch[campo]
      }
      for (const campo of camposBool) {
        if (patch[campo] !== null && concurso[campo] === null) data[campo] = patch[campo]
      }
      for (const campo of camposInt) {
        if (patch[campo] !== null && concurso[campo] === null) data[campo] = patch[campo]
      }

      // suspendido y cambioEspecialidad siempre se actualizan (tienen default false)
      if (patch.suspendido !== null) data.suspendido = patch.suspendido
      if (patch.cambioEspecialidad !== null) data.cambioEspecialidad = patch.cambioEspecialidad

      if (Object.keys(data).length === 0) {
        stats.saltados++
        continue
      }

      if (!DRY_RUN) {
        await prisma.concursoCph.update({ where: { id: concurso.id }, data })
      }

      stats.actualizados++

      if ((i + 1) % 500 === 0) {
        console.log(`  ⏳ ${i + 1}/${total} procesados...`)
      }
    } catch (err) {
      stats.errores++
      pendientes.push({ motivo: 'error', cargoBaja, sigla, error: err.message })
    }
  }

  // Resultado
  console.log('\n═══════════════════════════════════════')
  console.log('  RESULTADO CARGA SEGUIMIENTOS CPH')
  console.log('═══════════════════════════════════════')
  console.log(`  Total procesados : ${total}`)
  console.log(`  Actualizados     : ${stats.actualizados}`)
  console.log(`  Saltados (ya OK) : ${stats.saltados}`)
  console.log(`  Sin cargo en BD  : ${stats.sinCargo}`)
  console.log(`  Sin concurso     : ${stats.sinConcurso}`)
  console.log(`  Errores          : ${stats.errores}`)
  console.log('═══════════════════════════════════════\n')

  if (pendientes.length > 0) {
    console.log(`⚠️  ${pendientes.length} registros pendientes. Primeros 20:`)
    pendientes.slice(0, 20).forEach(p => console.log(`   ${p.motivo} | cargo=${p.cargoBaja} | sigla=${p.sigla}${p.error ? ` | ${p.error}` : ''}`))
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
