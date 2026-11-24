const { PrismaClient } = require('./node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/@prisma/client')
const p = new PrismaClient()
async function main() {
  const n = await p.pou.count()
  console.log('pou rows:', n)
  const sample = await p.pou.findFirst()
  console.log('sample:', JSON.stringify(sample, null, 2))
  // columnas disponibles
  const cols = sample ? Object.keys(sample) : []
  console.log('columns:', cols)
}
main().then(() => p.$disconnect()).catch(e => { console.error(e); p.$disconnect() })
