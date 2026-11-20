import XLSX from 'xlsx'
import { PrismaClient, Prisma } from '@prisma/client'

const DEV_URL = 'postgresql://neondb_owner:npg_Sse7auT1knHB@ep-rough-pond-aeuzuxh9-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require'

const prisma = new PrismaClient({ datasources: { db: { url: DEV_URL } } })

function str(v: unknown): string { return String(v ?? '').trim() }
function normCuil(v: unknown): string { return String(v ?? '').replace(/\D/g, '') }
function nil(v: string): string | null { return v === '' ? null : v }

// ── 1. Crear tablas ───────────────────────────────────────────────────────────
console.log('Creando tablas...')
await prisma.$executeRaw`DROP TABLE IF EXISTS msgc_hechos_cargo_persona CASCADE`
await prisma.$executeRaw`DROP TABLE IF EXISTS msgc_puestos CASCADE`
await prisma.$executeRaw`DROP TABLE IF EXISTS msgc_personas CASCADE`
await prisma.$executeRaw`DROP TABLE IF EXISTS msgc_cargos CASCADE`
await prisma.$executeRaw`
  CREATE TABLE msgc_puestos (
    id SERIAL PRIMARY KEY, literal_puesto VARCHAR(200) NOT NULL,
    especialidad VARCHAR(200), UNIQUE (literal_puesto, especialidad)
  )`
await prisma.$executeRaw`
  CREATE TABLE msgc_personas (
    cuil VARCHAR(11) PRIMARY KEY, apellido_nombre VARCHAR(200),
    id_sial VARCHAR(50), id_sial_rol VARCHAR(50),
    situacion_revista VARCHAR(50), especialidad VARCHAR(200)
  )`
await prisma.$executeRaw`
  CREATE TABLE msgc_cargos (
    codigo_cargo VARCHAR(30) PRIMARY KEY, codigo_registro VARCHAR(10),
    carrera VARCHAR(150), sigla VARCHAR(20), nombre_cargo VARCHAR(200),
    tipo VARCHAR(50), planta_guardia VARCHAR(50), estado VARCHAR(30),
    situacion VARCHAR(30), acronimo VARCHAR(10), especialidad_cargo VARCHAR(200),
    nivel_conduccion VARCHAR(50), universo TEXT, linea_pou TEXT,
    reparticion TEXT, unidad_arbol TEXT, bloque VARCHAR(50), suma_en_total VARCHAR(5)
  )`
await prisma.$executeRaw`
  CREATE TABLE msgc_hechos_cargo_persona (
    id SERIAL PRIMARY KEY, codigo_cargo VARCHAR(30) NOT NULL REFERENCES msgc_cargos(codigo_cargo),
    cuil VARCHAR(11) REFERENCES msgc_personas(cuil), puesto_id INTEGER REFERENCES msgc_puestos(id),
    id_sial_rol VARCHAR(50), situacion VARCHAR(30),
    cargo_id_sistema UUID, persona_id_sistema UUID
  )`
console.log('Tablas creadas.')

// ── 2. Leer Excel ─────────────────────────────────────────────────────────────
const wb = XLSX.readFile('/tmp/mapeo-cargos.xlsx')
const ws = wb.Sheets['NOMINAL DE CARGOS']
const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', range: 1 })
console.log(`Excel: ${rawRows.length} filas`)

// ── 3. Puestos (createMany) ───────────────────────────────────────────────────
console.log('Cargando puestos...')
const puestosSet = new Map<string, { literal_puesto: string; especialidad: string | null }>()
for (const r of rawRows) {
  const literal = str(r['Literal Puesto'])
  if (!literal) continue
  const esp = nil(str(r['Especialidad del cargo']))
  const key = `${literal}||${esp ?? ''}`
  if (!puestosSet.has(key)) puestosSet.set(key, { literal_puesto: literal, especialidad: esp })
}
// Usar $queryRaw con unnest para insert masivo
const pLiterals = [...puestosSet.values()].map(p => p.literal_puesto)
const pEsps     = [...puestosSet.values()].map(p => p.especialidad)
await prisma.$executeRaw`
  INSERT INTO msgc_puestos (literal_puesto, especialidad)
  SELECT * FROM unnest(${pLiterals}::varchar[], ${pEsps}::varchar[])
  ON CONFLICT DO NOTHING
`
console.log(`  ${puestosSet.size} puestos`)

const puestosRows = await prisma.$queryRaw<{ id: number; literal_puesto: string; especialidad: string | null }[]>`
  SELECT id, literal_puesto, especialidad FROM msgc_puestos`
const puestoIdMap = new Map<string, number>()
for (const p of puestosRows) puestoIdMap.set(`${p.literal_puesto}||${p.especialidad ?? ''}`, p.id)

// ── 4. Personas (unnest) ──────────────────────────────────────────────────────
console.log('Cargando personas...')
const personasMap = new Map<string, [string, string, string|null, string|null, string|null, string|null]>()
for (const r of rawRows) {
  const cuil = normCuil(r['CUIL / Expediente'])
  if (cuil.length !== 11 || personasMap.has(cuil)) continue
  const idSialRol = nil(str(r['ID SIAL Rol']))
  personasMap.set(cuil, [
    cuil,
    str(r['Apellido y nombre (control)']),
    idSialRol ? idSialRol.split('-')[0] ?? null : null,
    idSialRol,
    nil(str(r['Situación de revista del ocupante'])),
    nil(str(r['Especialidad del ocupante'])),
  ])
}
const pArr = [...personasMap.values()]
await prisma.$executeRaw`
  INSERT INTO msgc_personas (cuil, apellido_nombre, id_sial, id_sial_rol, situacion_revista, especialidad)
  SELECT * FROM unnest(
    ${pArr.map(p=>p[0])}::varchar[],
    ${pArr.map(p=>p[1])}::varchar[],
    ${pArr.map(p=>p[2])}::varchar[],
    ${pArr.map(p=>p[3])}::varchar[],
    ${pArr.map(p=>p[4])}::varchar[],
    ${pArr.map(p=>p[5])}::varchar[]
  )
  ON CONFLICT (cuil) DO NOTHING
`
console.log(`  ${personasMap.size} personas`)

// ── 5. Cargos (unnest, deduplicado) ──────────────────────────────────────────
console.log('Cargando cargos...')
const cargosMap = new Map<string, Record<string, string|null>>()
for (const r of rawRows) {
  const codigo = str(r['Código de Cargo'])
  if (!codigo || cargosMap.has(codigo)) continue
  cargosMap.set(codigo, {
    codigo_registro:    nil(str(r['Código de Registro'])),
    carrera:            nil(str(r['Carrera'])),
    sigla:              nil(str(r['Sigla'])),
    nombre_cargo:       nil(str(r['Nombre del cargo'])),
    tipo:               nil(str(r['Tipo'])),
    planta_guardia:     nil(str(r['Planta / Guardia (CPH)'])),
    estado:             nil(str(r['Estado'])),
    situacion:          nil(str(r['Situación'])),
    acronimo:           nil(str(r['Acrónimo'])),
    especialidad_cargo: nil(str(r['Especialidad del cargo'])),
    nivel_conduccion:   nil(str(r['Nivel conducción'])),
    universo:           nil(str(r['Universo'])),
    linea_pou:          nil(str(r['Línea POU'])),
    reparticion:        nil(str(r['Repartición'])),
    unidad_arbol:       nil(str(r['Unidad árbol (COD_REP)'])),
    bloque:             nil(str(r['Bloque'])),
    suma_en_total:      nil(str(r['Suma en total'])),
  })
}
const cArr = [...cargosMap.entries()]
await prisma.$executeRaw`
  INSERT INTO msgc_cargos (
    codigo_cargo, codigo_registro, carrera, sigla, nombre_cargo, tipo, planta_guardia,
    estado, situacion, acronimo, especialidad_cargo, nivel_conduccion,
    universo, linea_pou, reparticion, unidad_arbol, bloque, suma_en_total
  )
  SELECT * FROM unnest(
    ${cArr.map(([k])=>k)}::varchar[],
    ${cArr.map(([,v])=>v.codigo_registro)}::varchar[],
    ${cArr.map(([,v])=>v.carrera)}::varchar[],
    ${cArr.map(([,v])=>v.sigla)}::varchar[],
    ${cArr.map(([,v])=>v.nombre_cargo)}::varchar[],
    ${cArr.map(([,v])=>v.tipo)}::varchar[],
    ${cArr.map(([,v])=>v.planta_guardia)}::varchar[],
    ${cArr.map(([,v])=>v.estado)}::varchar[],
    ${cArr.map(([,v])=>v.situacion)}::varchar[],
    ${cArr.map(([,v])=>v.acronimo)}::varchar[],
    ${cArr.map(([,v])=>v.especialidad_cargo)}::varchar[],
    ${cArr.map(([,v])=>v.nivel_conduccion)}::varchar[],
    ${cArr.map(([,v])=>v.universo)}::text[],
    ${cArr.map(([,v])=>v.linea_pou)}::text[],
    ${cArr.map(([,v])=>v.reparticion)}::text[],
    ${cArr.map(([,v])=>v.unidad_arbol)}::text[],
    ${cArr.map(([,v])=>v.bloque)}::varchar[],
    ${cArr.map(([,v])=>v.suma_en_total)}::varchar[]
  )
  ON CONFLICT (codigo_cargo) DO NOTHING
`
console.log(`  ${cargosMap.size} cargos`)

// ── 6. Hechos (unnest) ────────────────────────────────────────────────────────
console.log('Cargando hechos...')
const hCodigos:   string[]      = []
const hCuils:     (string|null)[] = []
const hPuestos:   (number|null)[] = []
const hRoles:     (string|null)[] = []
const hSituacion: (string|null)[] = []

for (const r of rawRows) {
  const codigo = str(r['Código de Cargo'])
  if (!codigo) continue
  const cuil = normCuil(r['CUIL / Expediente'])
  const literal = str(r['Literal Puesto'])
  const esp = nil(str(r['Especialidad del cargo']))
  hCodigos.push(codigo)
  hCuils.push(cuil.length === 11 ? cuil : null)
  hPuestos.push(literal ? (puestoIdMap.get(`${literal}||${esp ?? ''}`) ?? null) : null)
  hRoles.push(nil(str(r['ID SIAL Rol'])))
  hSituacion.push(nil(str(r['Situación'])))
}

await prisma.$executeRaw`
  INSERT INTO msgc_hechos_cargo_persona (codigo_cargo, cuil, puesto_id, id_sial_rol, situacion)
  SELECT * FROM unnest(
    ${hCodigos}::varchar[],
    ${hCuils}::varchar[],
    ${hPuestos}::integer[],
    ${hRoles}::varchar[],
    ${hSituacion}::varchar[]
  )
`
console.log(`  ${hCodigos.length} hechos`)

// ── 7. FKs al sistema ─────────────────────────────────────────────────────────
console.log('Cruzando FKs...')
await prisma.$executeRaw`
  UPDATE msgc_hechos_cargo_persona h
  SET cargo_id_sistema = c.id
  FROM cargos c WHERE c.codigo = h.codigo_cargo AND c.deleted_at IS NULL`
await prisma.$executeRaw`
  UPDATE msgc_hechos_cargo_persona h
  SET persona_id_sistema = p.id
  FROM personas p WHERE p.cuil = h.cuil`

// ── 8. Resumen ────────────────────────────────────────────────────────────────
const tot = await prisma.$queryRaw<{p:bigint;pe:bigint;c:bigint;h:bigint;fkc:bigint;fkp:bigint}[]>`
  SELECT
    (SELECT COUNT(*) FROM msgc_puestos) AS p,
    (SELECT COUNT(*) FROM msgc_personas) AS pe,
    (SELECT COUNT(*) FROM msgc_cargos) AS c,
    (SELECT COUNT(*) FROM msgc_hechos_cargo_persona) AS h,
    (SELECT COUNT(*) FROM msgc_hechos_cargo_persona WHERE cargo_id_sistema   IS NOT NULL) AS fkc,
    (SELECT COUNT(*) FROM msgc_hechos_cargo_persona WHERE persona_id_sistema IS NOT NULL) AS fkp`

console.log('\n── Neon_BD ──')
console.log(`  msgc_puestos:              ${tot[0]?.p}`)
console.log(`  msgc_personas:             ${tot[0]?.pe}`)
console.log(`  msgc_cargos:               ${tot[0]?.c}`)
console.log(`  msgc_hechos_cargo_persona: ${tot[0]?.h}`)
console.log(`  FK cargo resueltas:        ${tot[0]?.fkc}`)
console.log(`  FK persona resueltas:      ${tot[0]?.fkp}`)

await prisma.$disconnect()
