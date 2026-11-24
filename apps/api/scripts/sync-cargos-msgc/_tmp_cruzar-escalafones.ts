import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const carreras = await prisma.$queryRaw<{ codigo_registro: string; escalafon: string }[]>`
    SELECT codigo_registro, escalafon FROM dim_carreras ORDER BY codigo_registro
  `
  const escalafones = await prisma.$queryRaw<{ codigo: string; nombre: string }[]>`
    SELECT codigo, nombre FROM escalafones ORDER BY codigo
  `

  console.log('\n── dim_carreras (codigo_registro → escalafon) ──')
  for (const c of carreras) console.log(`  CR ${c.codigo_registro.padEnd(6)} → "${c.escalafon}"`)

  console.log('\n── escalafones del sistema (codigo → nombre) ──')
  for (const e of escalafones) console.log(`  ${e.codigo.padEnd(6)} → "${e.nombre}"`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
