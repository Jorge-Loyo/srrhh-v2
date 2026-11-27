// Pobla dim_tipos_cargos y dim_especialidades desde dim_cargos.
// Lógica de clasificación tipo_cargo (orden de precedencia):
//   1. formacion  → CR 07, 24
//   2. estructura → CR 25, 60
//   3. estructura → jcat P60 o P61 (director/subdirector, cualquier CR)
//   4. conduccion → jcat no nulo y distinto de P60/P61
//   5. ejecucion  → todo lo demás
// Idempotente: usa INSERT ... ON CONFLICT DO NOTHING para tipos/especialidades,
// y UPDATE para el link tipo_cargo_id en dim_cargos.
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const CR_FORMACION  = new Set(['07', '24'])
const CR_ESTRUCTURA = new Set(['25', '60'])
const JCAT_ESTRUCTURA = new Set(['P60', 'P61'])

function clasificar(codigoRegistro: string, jcat: string | null): string {
  if (CR_FORMACION.has(codigoRegistro))  return 'formacion'
  if (CR_ESTRUCTURA.has(codigoRegistro)) return 'estructura'
  if (jcat && JCAT_ESTRUCTURA.has(jcat.toUpperCase())) return 'estructura'
  if (jcat) return 'conduccion'
  return 'ejecucion'
}

async function main() {
  // 1. Obtener combinaciones únicas (codigo_registro, nombre_cargo) de dim_cargos
  //    junto con el jcat más frecuente para esa combinación (desde dim_puestos via dim_cargos)
  const combis = await prisma.$queryRaw<{
    codigo_registro: string
    nombre_cargo: string
    jcat: string | null
  }[]>`
    SELECT
      dc.codigo_registro,
      dc.nombre_cargo,
      -- jcat más frecuente para este (codigo_registro, nombre_cargo)
      -- via dim_puestos que comparte codigo_registro y literal_puesto
      (
        SELECT dp.jcat
        FROM dim_puestos dp
        WHERE dp.codigo_registro = dc.codigo_registro
          AND lower(unaccent(dp.literal_puesto)) = lower(unaccent(dc.nombre_cargo))
          AND dp.jcat IS NOT NULL
          AND dp.jcat <> '0'
        GROUP BY dp.jcat
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ) AS jcat
    FROM dim_cargos dc
    WHERE dc.codigo_registro IS NOT NULL
      AND dc.nombre_cargo    IS NOT NULL
    GROUP BY dc.codigo_registro, dc.nombre_cargo
    ORDER BY dc.codigo_registro, dc.nombre_cargo
  `

  console.log(`Combinaciones únicas (codigo_registro, nombre_cargo): ${combis.length}`)
  console.log(`  Con jcat resuelto: ${combis.filter(c => c.jcat).length}`)

  // 2. Insertar en dim_tipos_cargos (idempotente)
  let insertados = 0
  let yaExistian = 0
  for (const c of combis) {
    const tipoCargo = clasificar(c.codigo_registro, c.jcat)
    const result = await prisma.$executeRaw`
      INSERT INTO dim_tipos_cargos (codigo_registro, nombre, tipo_cargo)
      VALUES (${c.codigo_registro}, ${c.nombre_cargo}, ${tipoCargo})
      ON CONFLICT (codigo_registro, nombre) DO UPDATE
        SET tipo_cargo = EXCLUDED.tipo_cargo
        WHERE dim_tipos_cargos.tipo_cargo IS DISTINCT FROM EXCLUDED.tipo_cargo
    `
    if (result > 0) insertados++
    else yaExistian++
  }
  console.log(`dim_tipos_cargos: ${insertados} insertados, ${yaExistian} ya existían`)

  // Distribución por tipo_cargo
  const dist = await prisma.$queryRaw<{ tipo_cargo: string; n: bigint }[]>`
    SELECT tipo_cargo, COUNT(*) as n FROM dim_tipos_cargos GROUP BY tipo_cargo ORDER BY n DESC
  `
  console.log('\nDistribución tipo_cargo:')
  for (const d of dist) console.log(`  ${d.tipo_cargo.padEnd(12)} ${d.n}`)

  // 3. Poblar dim_especialidades desde dim_cargos.especialidad_cargo (idempotente)
  const especialidades = await prisma.$queryRaw<{
    codigo_registro: string
    nombre_cargo: string
    especialidad_cargo: string
  }[]>`
    SELECT DISTINCT
      dc.codigo_registro,
      dc.nombre_cargo,
      dc.especialidad_cargo
    FROM dim_cargos dc
    WHERE dc.codigo_registro  IS NOT NULL
      AND dc.nombre_cargo     IS NOT NULL
      AND dc.especialidad_cargo IS NOT NULL
      AND dc.especialidad_cargo <> ''
    ORDER BY dc.codigo_registro, dc.nombre_cargo, dc.especialidad_cargo
  `

  console.log(`\nEspecialidades a insertar: ${especialidades.length}`)

  let espInsertadas = 0
  let espYaExistian = 0
  for (const e of especialidades) {
    const result = await prisma.$executeRaw`
      INSERT INTO dim_especialidades (tipo_cargo_id, nombre)
      SELECT tc.id, ${e.especialidad_cargo}
      FROM dim_tipos_cargos tc
      WHERE tc.codigo_registro = ${e.codigo_registro}
        AND tc.nombre          = ${e.nombre_cargo}
      ON CONFLICT (tipo_cargo_id, nombre) DO NOTHING
    `
    if (result > 0) espInsertadas++
    else espYaExistian++
  }
  console.log(`dim_especialidades: ${espInsertadas} insertadas, ${espYaExistian} ya existían`)

  // 4. Linkear dim_cargos.tipo_cargo_id
  const linked = await prisma.$executeRaw`
    UPDATE dim_cargos dc
    SET tipo_cargo_id = tc.id
    FROM dim_tipos_cargos tc
    WHERE tc.codigo_registro = dc.codigo_registro
      AND tc.nombre          = dc.nombre_cargo
      AND dc.tipo_cargo_id IS DISTINCT FROM tc.id
  `
  console.log(`\ndim_cargos.tipo_cargo_id actualizado: ${linked} filas`)

  // Validar constraint
  await prisma.$executeRaw`ALTER TABLE dim_cargos VALIDATE CONSTRAINT "dim_cargos_tipo_cargo_id_fkey"`
  console.log('✓ FK dim_cargos.tipo_cargo_id validada')

  // Resumen final
  const sinLink = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) as n FROM dim_cargos
    WHERE nombre_cargo IS NOT NULL AND tipo_cargo_id IS NULL
  `
  console.log(`dim_cargos sin tipo_cargo_id (con nombre_cargo): ${sinLink[0].n}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
