import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const EJECUTAR = process.argv.includes('--ejecutar')

async function main() {
  const pof = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) as n FROM dim_cargos WHERE codigo_cargo LIKE 'CPH-J-POF-%'
  `
  const pou = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) as n FROM dim_cargos WHERE codigo_cargo LIKE 'CPH-J-POU-%'
  `
  console.log(`CPH-J-POF-* a renombrar → CPH-J-P-*:  ${pof[0].n}`)
  console.log(`CPH-J-POU-* a renombrar → CPH-J-G-*:  ${pou[0].n}`)

  if (!EJECUTAR) {
    console.log('\n[DRY-RUN] Pasar --ejecutar para aplicar.')
    return
  }

  const updPof = await prisma.$executeRaw`
    UPDATE dim_cargos
    SET codigo_cargo = 'CPH-J-P-' || substring(codigo_cargo, 13)
    WHERE codigo_cargo LIKE 'CPH-J-POF-%'
  `
  console.log(`\n✓ CPH-J-POF → CPH-J-P: ${updPof} filas`)

  const updPou = await prisma.$executeRaw`
    UPDATE dim_cargos
    SET codigo_cargo = 'CPH-J-G-' || substring(codigo_cargo, 13)
    WHERE codigo_cargo LIKE 'CPH-J-POU-%'
  `
  console.log(`✓ CPH-J-POU → CPH-J-G: ${updPou} filas`)

  // Verificar que no quedó ninguno con formato viejo
  const restantes = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) as n FROM dim_cargos WHERE codigo_cargo LIKE 'CPH-J-PO%'
  `
  console.log(`\nRestantes con formato viejo: ${restantes[0].n}`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
