/**
 * Enriquece el catálogo `hospitales` con la metadata del maestro de siglas del
 * Ministerio (Doc/Referencias/Siglas MSGC.xlsx - Siglas del Ministerio.csv):
 * universo totalizador, tipo, monovalencia + nombre resumido, comuna,
 * coordenadas, tamaño y tipificación SSAH. El CSV es la fuente LIMPIA (con
 * tildes correctas), así que al actualizar también resuelve el mojibake que
 * tenían algunos valores viejos en la BD.
 *
 * Match por SIGLA exacta. Hace UPSERT:
 *   - sigla existente → UPDATE de los campos del CSV (no toca `activo`).
 *   - sigla nueva     → INSERT (activo=true por defecto).
 * Las siglas que están en la BD pero NO en el CSV se dejan intactas.
 *
 * Re-ejecutable (idempotente). Uso:
 *   cd apps/api
 *   pnpm exec tsx scripts/import-hospitales-siglas.ts --archivo "C:/Desarrollo/SRH/SRRHH-Legacy/Doc/Referencias/Siglas MSGC.xlsx - Siglas del Ministerio.csv"
 *
 * Si no se pasa --archivo usa la ruta relativa esperada en el repo.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const RUTA_DEFECTO = resolve(
  process.cwd(),
  '../../Doc/Referencias/Siglas MSGC.xlsx - Siglas del Ministerio.csv',
)

// Vacío/espacios → null. Colapsa espacios internos y recorta.
function limpiar(v: string | undefined): string | null {
  if (v == null) return null
  const s = v.replace(/\s+/g, ' ').trim()
  return s === '' ? null : s
}

// Parser CSV mínimo que respeta comillas dobles (las coordenadas vienen como
// "lat, lng" entre comillas, con coma interna). Devuelve array de celdas.
function parseLineaCsv(linea: string): string[] {
  const out: string[] = []
  let cur = ''
  let enComillas = false
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i]
    if (ch === '"') {
      if (enComillas && linea[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        enComillas = !enComillas
      }
    } else if (ch === ',' && !enComillas) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

async function main() {
  const argIdx = process.argv.indexOf('--archivo')
  const ruta = argIdx >= 0 && process.argv[argIdx + 1] ? process.argv[argIdx + 1]! : RUTA_DEFECTO

  // Quita BOM si viene con él.
  const contenido = readFileSync(ruta, 'utf8').replace(/^\uFEFF/, '')
  const lineas = contenido.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lineas.length < 2) {
    throw new Error(`CSV sin filas de datos: ${ruta}`)
  }

  // Encabezado posicional (ver el CSV): 0 SIGLA, 1 DESC_SIGLA, 2 UNIVERSO
  // TOTALIZADOR, 3 Tipo de Hospital/Sigla, 4 Monovalencia, 5 Coordenadas,
  // 6 Tamaño, 7 Nombre Resumido, 8 Comuna, 9 Tipificacion SSAH.
  const filas = lineas.slice(1).map(parseLineaCsv)

  let creados = 0
  let actualizados = 0
  const sinSigla: number[] = []

  for (let i = 0; i < filas.length; i++) {
    const c = filas[i]!
    const sigla = limpiar(c[0])
    if (!sigla) {
      sinSigla.push(i + 2) // +2: 1 por el header, 1 por índice base 1
      continue
    }

    const datos = {
      nombre: limpiar(c[1]) ?? sigla,
      universoTotalizador: limpiar(c[2]),
      tipo: limpiar(c[3]),
      monovalencia: limpiar(c[4]),
      coordenadas: limpiar(c[5]),
      tamanio: limpiar(c[6]),
      nombreResumido: limpiar(c[7]),
      comuna: limpiar(c[8]),
      tipificacionSsah: limpiar(c[9]),
    }

    const existente = await prisma.hospital.findUnique({ where: { sigla } })
    if (existente) {
      // No piso `nombre` ni `activo` del registro existente: el nombre oficial
      // ya está curado en la BD y `activo` lo gobierna la dotación (61/15).
      await prisma.hospital.update({
        where: { sigla },
        data: {
          universoTotalizador: datos.universoTotalizador,
          tipo: datos.tipo,
          monovalencia: datos.monovalencia,
          coordenadas: datos.coordenadas,
          tamanio: datos.tamanio,
          nombreResumido: datos.nombreResumido,
          comuna: datos.comuna,
          tipificacionSsah: datos.tipificacionSsah,
        },
      })
      actualizados++
    } else {
      await prisma.hospital.create({ data: { sigla, ...datos } })
      creados++
    }
  }

  console.log(`Hospitales — actualizados: ${actualizados}, creados: ${creados}`)
  if (sinSigla.length) console.log(`Filas sin sigla (ignoradas), líneas: ${sinSigla.join(', ')}`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
