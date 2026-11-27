import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const [r] = await p.$queryRaw<{cnt: number}[]>`SELECT count(*)::int AS cnt FROM ocupaciones WHERE updated_at > now() - interval '2 minutes'`
console.log('Ocupaciones actualizadas últimos 2 min:', r.cnt)
await p.$disconnect()
