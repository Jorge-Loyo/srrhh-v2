import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

const sql = readFileSync(join(__dirname, 'scripts/seed_pou_decreto_mapeo.sql'), 'utf8')
await prisma.$executeRawUnsafe(sql)
const count = await prisma.pouDecretoMapeoHospital.count()
console.log('Filas en pou_decreto_mapeo_hospital:', count)
await prisma.$disconnect()
