import { PrismaClient } from '@prisma/client'

const DB = 'postgresql://neondb_owner:npg_Sse7auT1knHB@ep-little-river-aexgqwxz-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
const prisma = new PrismaClient({ datasources: { db: { url: DB } } })

const cols = await prisma.$queryRaw`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'dim_cargos' ORDER BY ordinal_position
`
console.log('Columnas dim_cargos:')
console.table(cols)

const [{ total }] = await prisma.$queryRaw`SELECT count(*)::int as total FROM dim_cargos`
console.log('Total:', total)

const muestra = await prisma.$queryRaw`
  SELECT codigo_cargo, codigo_registro, literal_puesto, efector, estado, sub_estado
  FROM dim_cargos WHERE codigo_cargo IS NOT NULL LIMIT 10
`
console.log('Muestra:')
console.table(muestra)

const prefijos = await prisma.$queryRaw`
  SELECT
    regexp_replace(codigo_cargo, '-[0-9]+$', '') AS prefijo,
    count(*)::int AS total,
    count(*) FILTER (WHERE estado IN ('vigente','validacion_vacante'))::int AS activos
  FROM dim_cargos
  WHERE codigo_cargo IS NOT NULL
  GROUP BY 1 ORDER BY total DESC LIMIT 50
`
console.log('Prefijos (top 50):')
console.table(prefijos)

const estados = await prisma.$queryRaw`
  SELECT estado, count(*)::int as total FROM dim_cargos GROUP BY 1 ORDER BY 2 DESC
`
console.log('Estados:')
console.table(estados)

await prisma.$disconnect()
