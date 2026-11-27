// Popula dim_cargos.tipo_cargo_id y especialidad_id como best-effort transitorio.
// Camino: dim_cargos → dim_actividad_hechos → dim_puestos → dim_tipos_cargos
// Para cada cargo toma el puesto más reciente (fecha_desde DESC).
// Los que no matcheen quedan NULL — se completarán desde la UI en producción.

import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  // 1. Linkear tipo_cargo_id via puesto más reciente
  const linkedTipo = await p.$executeRaw`
    UPDATE dim_cargos dc
    SET tipo_cargo_id = tc.id
    FROM (
      SELECT DISTINCT ON (ah.codigo_cargo)
        ah.codigo_cargo,
        dp.literal_puesto,
        dp.codigo_registro
      FROM dim_actividad_hechos ah
      JOIN dim_puestos dp ON dp.id_sial_rol = ah.id_sial_rol
      WHERE dp.literal_puesto  IS NOT NULL
        AND dp.codigo_registro IS NOT NULL
      ORDER BY ah.codigo_cargo, ah.fecha_desde DESC
    ) mejor
    JOIN dim_tipos_cargos tc
      ON tc.codigo_registro = mejor.codigo_registro
     AND tc.nombre          = mejor.literal_puesto
    WHERE dc.codigo_cargo   = mejor.codigo_cargo
      AND dc.tipo_cargo_id IS NULL
  `
  console.log(`tipo_cargo_id populado: ${linkedTipo} filas`)

  // 2. Linkear especialidad_id via puesto más reciente con especialidad
  const linkedEsp = await p.$executeRaw`
    UPDATE dim_cargos dc
    SET especialidad_id = e.id
    FROM (
      SELECT DISTINCT ON (ah.codigo_cargo)
        ah.codigo_cargo,
        dp.literal_puesto,
        dp.codigo_registro,
        dp.especialidad
      FROM dim_actividad_hechos ah
      JOIN dim_puestos dp ON dp.id_sial_rol = ah.id_sial_rol
      WHERE dp.literal_puesto  IS NOT NULL
        AND dp.codigo_registro IS NOT NULL
        AND dp.especialidad    IS NOT NULL
        AND dp.especialidad    <> ''
      ORDER BY ah.codigo_cargo, ah.fecha_desde DESC
    ) mejor
    JOIN dim_tipos_cargos tc
      ON tc.codigo_registro = mejor.codigo_registro
     AND tc.nombre          = mejor.literal_puesto
    JOIN dim_especialidades e
      ON e.tipo_cargo_id = tc.id
     AND e.nombre        = mejor.especialidad
    WHERE dc.codigo_cargo    = mejor.codigo_cargo
      AND dc.especialidad_id IS NULL
  `
  console.log(`especialidad_id populado: ${linkedEsp} filas`)

  // 3. Resumen
  const [sinTipo, sinEsp, total] = await Promise.all([
    p.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) as n FROM dim_cargos WHERE tipo_cargo_id IS NULL`,
    p.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) as n FROM dim_cargos WHERE especialidad_id IS NULL`,
    p.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) as n FROM dim_cargos`,
  ])
  console.log(`\n=== Resumen ===`)
  console.log(`Total dim_cargos:          ${total[0].n}`)
  console.log(`Sin tipo_cargo_id:         ${sinTipo[0].n} (se completarán desde UI)`)
  console.log(`Sin especialidad_id:       ${sinEsp[0].n} (esperado — no todos tienen especialidad)`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => p.$disconnect())
