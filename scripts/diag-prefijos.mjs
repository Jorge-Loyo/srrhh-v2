import { PrismaClient } from '@prisma/client'

const DB = 'postgresql://neondb_owner:npg_Sse7auT1knHB@ep-little-river-aexgqwxz-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
const prisma = new PrismaClient({ datasources: { db: { url: DB } } })

// 1. Prefijos actuales en la tabla cargos
const rows = await prisma.$queryRaw`
  SELECT
    regexp_replace(codigo, '-[0-9]{6}$', '') AS prefijo,
    count(*)::int AS total,
    count(*) FILTER (WHERE estado IN ('vigente','validacion_vacante') AND deleted_at IS NULL)::int AS activos
  FROM cargos
  WHERE codigo IS NOT NULL
  GROUP BY 1
  ORDER BY total DESC
`
console.log('\n=== Prefijos en cargos ===')
console.table(rows)

// 2. Prefijos legacy que hay que recodificar (CPH-POF, CPH-POU, TEC-POF, TEC-POU, etc.)
const PREFIJOS_LEGACY = ['CPH-POF', 'CPH-POU', 'TEC-POF', 'TEC-POU', 'TEC-J-POF', 'TEC-J-POU',
  'EG-D', 'EG-G', 'EG-J', 'RG-CG', 'AS-MIN', 'AS-SS', 'AS-DG', 'AS-DGA', 'RME', 'MO', 'PG']

const legacy = rows.filter(r => PREFIJOS_LEGACY.some(p => r.prefijo === p || r.prefijo?.startsWith(p + '-') || r.prefijo?.startsWith('R-' + p)))
console.log('\n=== Prefijos legacy a recodificar ===')
console.table(legacy)

// 3. Total general
const total = await prisma.cargo.count()
const activos = await prisma.cargo.count({ where: { estado: { in: ['vigente', 'validacion_vacante'] }, deletedAt: null } })
console.log(`\nTotal cargos: ${total} | Activos: ${activos}`)

await prisma.$disconnect()
