import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const DB = 'postgresql://neondb_owner:npg_Sse7auT1knHB@ep-little-river-aexgqwxz-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
const prisma = new PrismaClient({ datasources: { db: { url: DB } } })

const usuarios = await prisma.usuario.findMany({
  select: { id: true, username: true, email: true, cuil: true, activo: true, passwordHash: true }
})
console.log('Usuarios:', JSON.stringify(usuarios.map(u => ({ ...u, passwordHash: u.passwordHash?.slice(0,20) + '...' })), null, 2))

// Verificar si 'Admin1234!' matchea el hash del admin
const admin = usuarios.find(u => u.username === 'admin')
if (admin?.passwordHash) {
  const ok = await bcrypt.compare('Admin1234!', admin.passwordHash)
  console.log('\nbcrypt.compare("Admin1234!", hash) =>', ok)
} else {
  console.log('\nNo se encontró usuario admin o no tiene hash')
}

await prisma.$disconnect()
