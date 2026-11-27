import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const DATOS = [
  { cuil: '20957425845', sexo: 'm' },
  { cuil: '27337164981', sexo: 'f' },
  { cuil: '20421162957', sexo: 'm' },
  { cuil: '20414716823', sexo: 'm' },
  { cuil: '27962154072', sexo: 'f' },
  { cuil: '27378063685', sexo: 'f' },
]

async function main() {
  // Ver el 7mo que falta
  const nulls = await prisma.$queryRaw<{ cuil: string; apellido_nombre: string }[]>`
    SELECT cuil, apellido_nombre FROM dim_personas WHERE sexo IS NULL
  `
  console.log('── Sin sexo actualmente ─────────────────────────────────')
  for (const r of nulls) console.log(`  ${r.cuil} | "${r.apellido_nombre}"`)

  let actualizados = 0
  for (const { cuil, sexo } of DATOS) {
    const n = await prisma.$executeRawUnsafe(
      `UPDATE dim_personas SET sexo = $1 WHERE cuil = $2`,
      sexo, cuil
    )
    actualizados += n
  }
  console.log(`\n✓ sexo actualizado: ${actualizados} filas`)

  const restantes = await prisma.$queryRaw<{ q: bigint }[]>`
    SELECT COUNT(*) as q FROM dim_personas WHERE sexo IS NULL
  `
  console.log(`  Sin sexo restantes: ${restantes[0].q}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
