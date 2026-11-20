import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const r = await prisma.$queryRaw<any[]>`
    SELECT id_sial_rol, literal_puesto, especialidad, efector, codigo_registro
    FROM dim_puestos WHERE cod_rep IS NULL
  `
  console.log(r)
}

main().catch(console.error).finally(() => prisma.$disconnect())
