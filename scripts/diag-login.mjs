import { PrismaClient } from '@prisma/client'

const DB = 'postgresql://neondb_owner:npg_Sse7auT1knHB@ep-little-river-aexgqwxz-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
const prisma = new PrismaClient({ datasources: { db: { url: DB } } })

try {
  // 1. Verificar tabla permiso
  const permisos = await prisma.permiso.count()
  console.log('permiso count:', permisos)

  // 2. Verificar tabla role
  const roles = await prisma.role.findMany({ select: { id: true, slug: true, nombre: true } })
  console.log('roles:', JSON.stringify(roles, null, 2))

  // 3. Verificar rolePermiso
  const rp = await prisma.rolePermiso.count()
  console.log('rolePermiso count:', rp)

  // 4. Simular getPermisosEfectivos para admin
  const admin = await prisma.usuario.findUnique({
    where: { username: 'admin' },
    include: { role: true }
  })
  console.log('admin role:', admin?.role)

} catch (e) {
  console.error('ERROR:', e.message)
  console.error(e.stack)
} finally {
  await prisma.$disconnect()
}
