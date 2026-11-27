import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

await prisma.permiso.createMany({
  data: [
    { modulo: 'carga_semanal', accion: 'subir', descripcion: 'Subir archivos semanales (cargos, bajas, arbol, pou, decreto)' },
    { modulo: 'carga_semanal', accion: 'ver',   descripcion: 'Ver historial y diffs de cargas semanales' },
  ],
  skipDuplicates: true,
})

const permisos = await prisma.permiso.findMany({
  where: { modulo: 'carga_semanal' },
  select: { modulo: true, accion: true },
})
console.log('Permisos carga_semanal:', permisos)
await prisma.$disconnect()
