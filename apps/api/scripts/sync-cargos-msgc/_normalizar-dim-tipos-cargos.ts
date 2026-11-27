// Normaliza dim_tipos_cargos y dim_especialidades.
//
// Fuente del catálogo: dim_puestos (padrón real de Hacienda).
// Agrupa (codigo_registro, literal_puesto) únicos → dim_tipos_cargos.
// Agrupa (codigo_registro, literal_puesto, especialidad) únicos → dim_especialidades.
//
// Regla tipo_cargo (todo leído desde BD, sin hardcodeo):
//   1. formacion  → CR en dim_carreras con escalafon/lit_cod_reg ILIKE '%Docente%' o '%Residencia%'
//   2. estructura → jcat en jcat_cargo_jefatura con familia='P' y cod_puesto IN ('01','03')
//   3. conduccion → jcat tiene cualquier valor no nulo
//   4. ejecucion  → jcat IS NULL
//
// Link dim_cargos: por (codigo_registro, literal_puesto) contra dim_tipos_cargos.
// Idempotente: limpia y repobla.

import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  // ── 1. Leer reglas desde BD ───────────────────────────────────────────────
  const [carrerasFormacion, jcatsEstructura] = await Promise.all([
    p.$queryRaw<{ codigo_registro: string }[]>`
      SELECT codigo_registro FROM dim_carreras
      WHERE escalafon   ILIKE '%Docente%' OR escalafon   ILIKE '%Residencia%'
         OR lit_cod_reg ILIKE '%Docente%' OR lit_cod_reg ILIKE '%Residencia%'
    `,
    p.$queryRaw<{ jcat: string }[]>`
      SELECT jcat FROM jcat_cargo_jefatura
      WHERE familia = 'P' AND cod_puesto IN ('01', '03')
    `,
  ])

  const CR_FORMACION    = new Set(carrerasFormacion.map(c => c.codigo_registro))
  const JCAT_ESTRUCTURA = new Set(jcatsEstructura.map(j => j.jcat.toUpperCase()))

  console.log(`CRs formación:    ${[...CR_FORMACION].join(', ')}`)
  console.log(`JCATs estructura: ${[...JCAT_ESTRUCTURA].join(', ')}`)

  function clasificar(cr: string, jcat: string | null): string {
    if (CR_FORMACION.has(cr))                              return 'formacion'
    if (jcat && JCAT_ESTRUCTURA.has(jcat.toUpperCase()))   return 'estructura'
    if (jcat)                                              return 'conduccion'
    return 'ejecucion'
  }

  // ── 2. Combinaciones únicas desde dim_puestos ─────────────────────────────
  // jcat más frecuente para cada (codigo_registro, literal_puesto)
  const combis = await p.$queryRaw<{
    codigo_registro: string
    literal_puesto: string
    jcat: string | null
  }[]>`
    SELECT
      codigo_registro,
      literal_puesto,
      (
        SELECT jcat FROM dim_puestos dp2
        WHERE dp2.codigo_registro = dp.codigo_registro
          AND dp2.literal_puesto  = dp.literal_puesto
          AND dp2.jcat IS NOT NULL
          AND dp2.jcat <> '0'
        GROUP BY jcat
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ) AS jcat
    FROM dim_puestos dp
    WHERE codigo_registro IS NOT NULL
      AND literal_puesto  IS NOT NULL
    GROUP BY codigo_registro, literal_puesto
    ORDER BY codigo_registro, literal_puesto
  `
  console.log(`\nCombinaciones únicas (codigo_registro, literal_puesto): ${combis.length}`)

  const dist: Record<string, number> = {}
  for (const c of combis) {
    const t = clasificar(c.codigo_registro, c.jcat)
    dist[t] = (dist[t] ?? 0) + 1
  }
  console.log('Distribución a insertar:')
  for (const [k, v] of Object.entries(dist)) console.log(`  ${k.padEnd(12)} ${v}`)

  // ── 3. Limpiar y repoblar dim_tipos_cargos ────────────────────────────────
  console.log('\nLimpiando...')
  await p.$executeRaw`UPDATE dim_cargos SET tipo_cargo_id = NULL, especialidad_id = NULL`
  await p.$executeRaw`DELETE FROM dim_especialidades`
  await p.$executeRaw`DELETE FROM dim_tipos_cargos`
  await p.$executeRaw`ALTER SEQUENCE dim_tipos_cargos_id_seq RESTART WITH 1`
  await p.$executeRaw`ALTER SEQUENCE dim_especialidades_id_seq RESTART WITH 1`
  console.log('OK')

  for (const c of combis) {
    const tipoCargo = clasificar(c.codigo_registro, c.jcat)
    await p.$executeRaw`
      INSERT INTO dim_tipos_cargos (codigo_registro, nombre, tipo_cargo)
      VALUES (${c.codigo_registro}, ${c.literal_puesto}, ${tipoCargo})
      ON CONFLICT (codigo_registro, nombre) DO NOTHING
    `
  }
  console.log(`dim_tipos_cargos: ${combis.length} filas insertadas`)

  // ── 4. Poblar dim_especialidades desde dim_puestos ────────────────────────
  const especialidades = await p.$queryRaw<{
    codigo_registro: string
    literal_puesto: string
    especialidad: string
  }[]>`
    SELECT DISTINCT codigo_registro, literal_puesto, especialidad
    FROM dim_puestos
    WHERE codigo_registro IS NOT NULL
      AND literal_puesto  IS NOT NULL
      AND especialidad    IS NOT NULL
      AND especialidad    <> ''
    ORDER BY codigo_registro, literal_puesto, especialidad
  `
  console.log(`\nEspecialidades únicas desde dim_puestos: ${especialidades.length}`)

  let espInsertadas = 0
  for (const e of especialidades) {
    const r = await p.$executeRaw`
      INSERT INTO dim_especialidades (tipo_cargo_id, nombre)
      SELECT tc.id, ${e.especialidad}
      FROM dim_tipos_cargos tc
      WHERE tc.codigo_registro = ${e.codigo_registro}
        AND tc.nombre          = ${e.literal_puesto}
      ON CONFLICT (tipo_cargo_id, nombre) DO NOTHING
    `
    if (r > 0) espInsertadas++
  }
  console.log(`dim_especialidades: ${espInsertadas} filas insertadas`)

  // ── 5. Linkear dim_cargos.tipo_cargo_id ──────────────────────────────────
  const linkedTipo = await p.$executeRaw`
    UPDATE dim_cargos dc
    SET tipo_cargo_id = tc.id
    FROM dim_tipos_cargos tc
    WHERE tc.codigo_registro = dc.codigo_registro
      AND tc.nombre          = dc.literal_puesto
  `
  console.log(`\ndim_cargos.tipo_cargo_id linkeado: ${linkedTipo} filas`)

  // ── 6. Linkear dim_cargos.especialidad_id ────────────────────────────────
  const linkedEsp = await p.$executeRaw`
    UPDATE dim_cargos dc
    SET especialidad_id = e.id
    FROM dim_especialidades e
    JOIN dim_tipos_cargos tc ON tc.id = e.tipo_cargo_id
    WHERE tc.codigo_registro = dc.codigo_registro
      AND tc.nombre          = dc.literal_puesto
      AND e.nombre           = dc.especialidad_cargo
  `
  console.log(`dim_cargos.especialidad_id linkeado: ${linkedEsp} filas`)

  // ── 7. Resumen ────────────────────────────────────────────────────────────
  const [totTC, totEsp, sinTipo, sinEsp] = await Promise.all([
    p.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) as n FROM dim_tipos_cargos`,
    p.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) as n FROM dim_especialidades`,
    p.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) as n FROM dim_cargos WHERE tipo_cargo_id IS NULL`,
    p.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) as n FROM dim_cargos
      WHERE especialidad_cargo IS NOT NULL AND especialidad_cargo <> '' AND especialidad_id IS NULL
    `,
  ])
  console.log(`\n=== Resumen final ===`)
  console.log(`dim_tipos_cargos:   ${totTC[0].n}`)
  console.log(`dim_especialidades: ${totEsp[0].n}`)
  console.log(`dim_cargos sin tipo_cargo_id:                   ${sinTipo[0].n}`)
  console.log(`dim_cargos sin especialidad_id (con esp_cargo): ${sinEsp[0].n}`)

  const distFinal = await p.$queryRaw<{ tipo_cargo: string; n: bigint }[]>`
    SELECT tipo_cargo, COUNT(*) as n FROM dim_tipos_cargos GROUP BY tipo_cargo ORDER BY n DESC
  `
  console.log('\nDistribución final:')
  for (const d of distFinal) console.log(`  ${d.tipo_cargo.padEnd(12)} ${d.n}`)

  // Muestra de dim_tipos_cargos por CR
  const porCR = await p.$queryRaw<{ codigo_registro: string; n: bigint }[]>`
    SELECT codigo_registro, COUNT(*) as n
    FROM dim_tipos_cargos
    GROUP BY codigo_registro
    ORDER BY n DESC
  `
  console.log('\nTipos por codigo_registro:')
  for (const r of porCR) console.log(`  CR=${r.codigo_registro.padEnd(6)} ${r.n} tipos`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => p.$disconnect())
