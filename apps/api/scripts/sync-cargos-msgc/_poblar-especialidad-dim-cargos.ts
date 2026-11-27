import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Poblar especialidad_id cruzando especialidad_cargo con dim_especialidades via tipo_cargo_id
  const linked = await prisma.$executeRaw`
    UPDATE dim_cargos dc
    SET especialidad_id = e.id
    FROM dim_especialidades e
    JOIN dim_tipos_cargos tc ON tc.id = e.tipo_cargo_id
    WHERE tc.codigo_registro = dc.codigo_registro
      AND tc.id              = dc.tipo_cargo_id
      AND lower(unaccent(e.nombre)) = lower(unaccent(dc.especialidad_cargo))
      AND dc.especialidad_id IS DISTINCT FROM e.id
  `
  console.log(`dim_cargos.especialidad_id poblado: ${linked} filas`)

  // Validar FK
  await prisma.$executeRaw`
    ALTER TABLE dim_cargos VALIDATE CONSTRAINT dim_cargos_especialidad_id_fkey
  `
  console.log('✓ FK especialidad_id validada')

  // Resumen
  const stats = await prisma.$queryRaw<{
    con_esp: bigint; sin_esp_con_cargo: bigint; sin_esp_sin_cargo: bigint
  }[]>`
    SELECT
      COUNT(*) FILTER (WHERE especialidad_id IS NOT NULL)                          as con_esp,
      COUNT(*) FILTER (WHERE especialidad_id IS NULL AND especialidad_cargo IS NOT NULL) as sin_esp_con_cargo,
      COUNT(*) FILTER (WHERE especialidad_id IS NULL AND especialidad_cargo IS NULL)     as sin_esp_sin_cargo
    FROM dim_cargos
  `
  console.log(`\nCon especialidad_id:              ${stats[0].con_esp}`)
  console.log(`Sin link (tienen especialidad_cargo): ${stats[0].sin_esp_con_cargo}`)
  console.log(`Sin especialidad (correcto):          ${stats[0].sin_esp_sin_cargo}`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
