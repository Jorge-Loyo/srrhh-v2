import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Muestra 3 filas de pou para ver si están normalizadas
const pou = await prisma.pou.findMany({ take: 3, select: { sigla: true, perfil: true, especialidad: true } })
console.log('pou (3 filas):')
pou.forEach(r => console.log(' ', r.sigla, '|', r.perfil, '|', r.especialidad))

// Cuenta filas en pou que NO están normalizadas
const pouSinNorm = await prisma.$queryRaw`
  SELECT COUNT(*)::int as n FROM pou
  WHERE perfil IS DISTINCT FROM lower(unaccent(perfil))
     OR especialidad IS DISTINCT FROM lower(unaccent(especialidad))
`
console.log('\npou filas sin normalizar:', pouSinNorm)

// Cuenta filas en dim_puestos que NO están normalizadas
const dimSinNorm = await prisma.$queryRaw`
  SELECT COUNT(*)::int as n FROM dim_puestos
  WHERE literal_puesto IS DISTINCT FROM lower(unaccent(literal_puesto))
     OR especialidad IS DISTINCT FROM lower(unaccent(especialidad))
`
console.log('dim_puestos filas sin normalizar:', dimSinNorm)

await prisma.$disconnect()
