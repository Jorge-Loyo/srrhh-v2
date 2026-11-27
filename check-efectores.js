const { PrismaClient } = require('./node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/@prisma/client')
const p = new PrismaClient()
async function main() {
  const efectores = await p.dimEfectores.findMany({
    select: { sigla: true, nombre: true, nombreCompleto: true, nombreResumido: true }
  })
  console.log('=== DIM_EFECTORES ===')
  for (const e of efectores) {
    console.log(JSON.stringify(e))
  }
}
main().then(() => p.$disconnect()).catch(e => { console.error(e); p.$disconnect() })
