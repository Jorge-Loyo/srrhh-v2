import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

const sql = readFileSync(join(__dirname, 'scripts/backfill_normalizar_dim.sql'), 'utf8')

// Ejecutar cada statement por separado
const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'))

for (const stmt of statements) {
  const result = await prisma.$executeRawUnsafe(stmt)
  console.log('Filas afectadas:', result, '|', stmt.slice(0, 60).replace(/\n/g, ' '))
}

await prisma.$disconnect()
console.log('Backfill completado.')
