import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Verificar que no haya codigo_registro en dim_puestos que no exista en dim_carreras
  const huerfanos = await prisma.$queryRaw<{ codigo_registro: string; q: bigint }[]>`
    SELECT codigo_registro, COUNT(*) as q
    FROM dim_puestos
    WHERE codigo_registro NOT IN (SELECT codigo_registro FROM dim_carreras)
    GROUP BY codigo_registro
  `
  if (huerfanos.length > 0) {
    console.log('⚠ Huérfanos (no están en dim_carreras):')
    for (const r of huerfanos) console.log(`  ${r.codigo_registro}: ${r.q}`)
    process.exit(1)
  }
  console.log('✓ Sin huérfanos — todos los codigo_registro existen en dim_carreras')

  // Eliminar lit_cod_reg
  await prisma.$executeRawUnsafe(`
    ALTER TABLE dim_puestos DROP COLUMN lit_cod_reg
  `)
  console.log('✓ Columna lit_cod_reg eliminada de dim_puestos')

  // Agregar FK
  await prisma.$executeRawUnsafe(`
    ALTER TABLE dim_puestos
    ADD CONSTRAINT fk_dim_puestos_carrera
    FOREIGN KEY (codigo_registro) REFERENCES dim_carreras(codigo_registro)
  `)
  console.log('✓ FK dim_puestos.codigo_registro → dim_carreras.codigo_registro creada')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
