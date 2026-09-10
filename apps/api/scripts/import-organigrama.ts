/**
 * Carga (y recarga) la tabla `organigramas` desde el dump MySQL de la app
 * vieja — pese al nombre, `dotacion-rrhh/Doc/schema_only.sql` SÍ tiene los
 * datos reales (no solo el esquema): ~4.300 filas repartidas en 2 sentencias
 * `INSERT INTO \`organigramas\` VALUES (...)`. No hay ningún otro lugar con
 * esta data — no viene de un Excel ni de un servicio, es un volcado directo
 * de la tabla legacy.
 *
 * Contexto completo en
 * Doc/Planificacion/Sprints/POST_SPRINT_14_migracion_legacy_organigrama.md.
 *
 * Es re-ejecutable: borra todo `organigramas` y lo vuelve a cargar entero en
 * cada corrida (es una tabla de referencia estática, no incremental — mismo
 * criterio que services/dotaneitor/scripts/seed_referencias.py).
 *
 * Uso:
 *   cd apps/api
 *   pnpm exec tsx scripts/import-organigrama.ts --archivo "/ruta/a/schema_only.sql"
 *
 * Si no se pasa --archivo, prueba la ubicación relativa esperada en este
 * monorepo: ../../../dotacion-rrhh/Doc/schema_only.sql (repo viejo y nuevo
 * como hermanos bajo el mismo directorio, que es como está en esta máquina).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaClient, type Prisma } from '@prisma/client'

const MARCADOR = 'INSERT INTO `organigramas` VALUES '
const LOTE = 500 // filas por createMany — conservador frente al límite de bind variables de Postgres

const prisma = new PrismaClient()

// ── Desescapar strings al estilo mysqldump (\\, \', \", \n, \r, \t, \0, \Z) ──
const ESCAPES: Record<string, string> = {
  '0': '\0', "'": "'", '"': '"', b: '\b', n: '\n', r: '\r', t: '\t', Z: '\x1a', '\\': '\\',
}
function unescapeMysql(raw: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '\\' && i + 1 < raw.length) {
      const next = raw[i + 1]
      out += ESCAPES[next] !== undefined ? ESCAPES[next] : next
      i++
    } else {
      out += raw[i]
    }
  }
  return out
}

// ── Parser de tuplas `(v1,v2,...),(v1,v2,...)...;` respetando strings entre
// comillas simples con escape por backslash. No es un parser SQL genérico —
// alcanza para el formato exacto que produce mysqldump para este dump. ──
function parseValuesTuples(sql: string, start: number): { rows: unknown[][]; endIndex: number } {
  const rows: unknown[][] = []
  let i = start
  const n = sql.length
  const skipWs = () => {
    while (i < n && /\s/.test(sql[i])) i++
  }

  while (i < n) {
    skipWs()
    if (sql[i] === ';') {
      i++
      break
    }
    if (sql[i] !== '(') {
      i++
      continue
    }
    i++ // consume '('
    const row: unknown[] = []
    for (;;) {
      skipWs()
      if (sql[i] === "'") {
        i++
        let raw = ''
        while (i < n) {
          if (sql[i] === '\\') {
            raw += sql[i] + sql[i + 1]
            i += 2
            continue
          }
          if (sql[i] === "'") {
            i++
            break
          }
          raw += sql[i]
          i++
        }
        row.push(unescapeMysql(raw))
      } else if (sql.startsWith('NULL', i)) {
        row.push(null)
        i += 4
      } else {
        const numStart = i
        while (i < n && sql[i] !== ',' && sql[i] !== ')') i++
        row.push(Number(sql.slice(numStart, i).trim()))
      }
      skipWs()
      if (sql[i] === ',') {
        i++
        continue
      }
      if (sql[i] === ')') {
        i++
        break
      }
    }
    rows.push(row)
    skipWs()
    if (sql[i] === ',') {
      i++
      continue
    }
    if (sql[i] === ';') {
      i++
      break
    }
  }
  return { rows, endIndex: i }
}

function extraerFilas(contenido: string): unknown[][] {
  const filas: unknown[][] = []
  let desde = 0
  for (;;) {
    const idx = contenido.indexOf(MARCADOR, desde)
    if (idx === -1) break
    const { rows, endIndex } = parseValuesTuples(contenido, idx + MARCADOR.length)
    filas.push(...rows)
    desde = endIndex
  }
  return filas
}

// Orden de columnas del CREATE TABLE original (ver migración
// 20260908120000_organigramas): lvl, tipo, codigo_reparticion,
// universo_totalizador, regimen_empleo, desc_rep, sigla, padre, path, path_nombres.
function filaAOrganigrama(fila: unknown[]): Prisma.OrganigramaCreateManyInput {
  const [lvl, tipo, codigoReparticion, universoTotalizador, regimenEmpleo, descRep, sigla, padre, path, pathNombres] =
    fila
  return {
    lvl: Number(lvl),
    tipo: String(tipo),
    codigoReparticion: String(codigoReparticion),
    universoTotalizador: universoTotalizador == null ? null : String(universoTotalizador),
    regimenEmpleo: regimenEmpleo == null ? null : String(regimenEmpleo),
    descRep: descRep == null ? null : String(descRep),
    sigla: String(sigla),
    padre: padre == null ? null : String(padre),
    path: String(path),
    pathNombres: String(pathNombres),
  }
}

async function main() {
  const argFlag = process.argv.indexOf('--archivo')
  const archivo = resolve(
    argFlag !== -1 && process.argv[argFlag + 1]
      ? process.argv[argFlag + 1]
      : process.env.DOTACION_LEGACY_SCHEMA_PATH ??
          '../../../dotacion-rrhh/Doc/schema_only.sql'
  )

  console.log(`Leyendo ${archivo}...`)
  const contenido = readFileSync(archivo, 'utf-8')

  const filasRaw = extraerFilas(contenido)
  if (filasRaw.length === 0) {
    throw new Error(
      `No se encontraron filas de "organigramas" en ${archivo} — ¿es el archivo correcto?`
    )
  }
  console.log(`Filas parseadas: ${filasRaw.length}`)

  const filas = filasRaw.map(filaAOrganigrama)

  // Chequeo de integridad antes de tocar la base: codigoReparticion es UNIQUE.
  const codigos = new Set<string>()
  let duplicados = 0
  for (const f of filas) {
    if (codigos.has(f.codigoReparticion)) duplicados++
    codigos.add(f.codigoReparticion)
  }
  if (duplicados > 0) {
    console.warn(
      `⚠️  ${duplicados} codigo_reparticion duplicados en el dump — createMany con skipDuplicates los va a ignorar.`
    )
  }

  if (process.argv.includes('--dry-run')) {
    console.log('--dry-run: no se tocó la base. Muestra de las primeras 3 filas parseadas:')
    console.dir(filas.slice(0, 3), { depth: null })
    return
  }

  console.log('Borrando `organigramas` existente...')
  await prisma.organigrama.deleteMany()

  console.log(`Insertando en lotes de ${LOTE}...`)
  let insertadas = 0
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE)
    const res = await prisma.organigrama.createMany({ data: lote, skipDuplicates: true })
    insertadas += res.count
    process.stdout.write(`\r${insertadas}/${filas.length}`)
  }
  console.log(`\n✅ Listo — ${insertadas} filas cargadas en organigramas.`)
}

main()
  .catch((err) => {
    console.error('❌ Error:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
