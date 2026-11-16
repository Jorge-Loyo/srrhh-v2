// Fix: cargos SG- con unificador_puesto = 'POU Guardia' → 'Suplente de Guardia'
import { PrismaClient } from '../apps/api/node_modules/.prisma/client/index.js'

const prisma = new PrismaClient()

// Dry-run
const dry = await prisma.$queryRaw`
  SELECT COUNT(*)::int AS total
  FROM cargos
  WHERE codigo LIKE 'SG-%'
    AND unificador_puesto = 'POU Guardia'
    AND deleted_at IS NULL
`
console.log(`Cargos SG- con unificador_puesto='POU Guardia': ${dry[0].total}`)

if (dry[0].total === 0) {
  console.log('Nada que corregir.')
  await prisma.$disconnect()
  process.exit(0)
}

// Aplicar
const result = await prisma.$executeRaw`
  UPDATE cargos
  SET unificador_puesto = 'Suplente de Guardia'
  WHERE codigo LIKE 'SG-%'
    AND unificador_puesto = 'POU Guardia'
    AND deleted_at IS NULL
`
console.log(`UPDATE aplicado. Filas afectadas: ${result}`)

await prisma.$disconnect()
