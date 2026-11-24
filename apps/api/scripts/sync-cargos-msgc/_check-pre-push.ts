import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

// ¿dim_personas.activo se usa en algún query?
const activo = await p.$queryRaw<{ n: bigint }[]>`
  SELECT COUNT(*) as n FROM dim_personas WHERE activo = false
`
console.log(`dim_personas.activo=false: ${activo[0].n} (si 0, la columna no aporta info)`)

// ¿dim_cargos.modalidad tiene valores > 10 chars?
const modalidadLarga = await p.$queryRaw<{ modalidad: string; n: bigint }[]>`
  SELECT modalidad, COUNT(*) as n FROM dim_cargos
  WHERE length(modalidad) > 10
  GROUP BY modalidad
`
console.log(`\ndim_cargos.modalidad con >10 chars: ${modalidadLarga.length} valores distintos`)
modalidadLarga.forEach(r => console.log(`  "${r.modalidad}" (${r.n} filas)`))

await p.$disconnect()
