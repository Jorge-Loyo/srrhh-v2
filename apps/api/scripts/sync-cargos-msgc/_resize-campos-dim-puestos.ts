import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Verificar que los datos actuales caben en los nuevos tamaños
  const check = await prisma.$queryRaw<{ campo: string; max_len: number; q: bigint }[]>`
    SELECT 'cod_rep' as campo, MAX(LENGTH(cod_rep)) as max_len, COUNT(*) FILTER (WHERE LENGTH(cod_rep) > 10) as q FROM dim_puestos
    UNION ALL
    SELECT 'efector', MAX(LENGTH(efector)), COUNT(*) FILTER (WHERE LENGTH(efector) > 15) FROM dim_puestos
  `
  console.log('── Verificación de tamaños actuales ─────────────────────')
  for (const r of check)
    console.log(`  ${r.campo}: max_len=${r.max_len} | exceden 10 chars: ${r.q}`)

  const hayProblemas = check.some(r => r.q > 0n)
  if (hayProblemas) {
    console.log('\n⚠ Hay valores que exceden el nuevo tamaño — no se puede reducir')
    process.exit(1)
  }

  await prisma.$executeRawUnsafe(`
    ALTER TABLE dim_puestos
    ALTER COLUMN cod_rep TYPE VARCHAR(10),
    ALTER COLUMN efector TYPE VARCHAR(15)
  `)
  console.log('\n✓ cod_rep → VARCHAR(10)')
  console.log('✓ efector → VARCHAR(10)')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
