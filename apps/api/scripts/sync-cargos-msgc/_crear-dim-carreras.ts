import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Crear tabla
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS dim_carreras (
      codigo_registro VARCHAR(10) PRIMARY KEY,
      lit_cod_reg     VARCHAR(150) NOT NULL,
      escalafon       VARCHAR(150),
      activo          BOOLEAN DEFAULT true
    )
  `)
  console.log('✓ Tabla dim_carreras creada')

  // Poblar desde codigos_registro + escalafones (fuente de verdad del sistema)
  const insertados = await prisma.$executeRawUnsafe(`
    INSERT INTO dim_carreras (codigo_registro, lit_cod_reg, escalafon)
    SELECT cr.codigo, cr.literal, e.nombre
    FROM codigos_registro cr
    JOIN escalafones e ON e.id = cr.escalafon_id
    ON CONFLICT (codigo_registro) DO UPDATE
      SET lit_cod_reg = EXCLUDED.lit_cod_reg,
          escalafon   = EXCLUDED.escalafon
  `)
  console.log(`✓ dim_carreras poblada: ${insertados} filas`)

  // Verificar
  const filas = await prisma.$queryRaw<{ codigo_registro: string; lit_cod_reg: string; escalafon: string }[]>`
    SELECT codigo_registro, lit_cod_reg, escalafon FROM dim_carreras ORDER BY codigo_registro
  `
  console.log('\n── dim_carreras ─────────────────────────────────────────')
  for (const r of filas) console.log(`  ${r.codigo_registro.padEnd(5)} | ${r.lit_cod_reg.padEnd(45)} | ${r.escalafon}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
