import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Mapa completo escalafon → codigos_registro
  const mapa = await prisma.$queryRaw<{ escalafon: string; codigos: string }[]>`
    SELECT e.nombre as escalafon, STRING_AGG(cr.codigo || '=' || cr.literal, ' | ' ORDER BY cr.codigo) as codigos
    FROM escalafones e
    JOIN codigos_registro cr ON cr.escalafon_id = e.id
    GROUP BY e.nombre
    ORDER BY e.nombre
  `
  console.log('── Escalafon → Codigos de registro ──────────────────────')
  for (const r of mapa) console.log(`  "${r.escalafon}"\n    ${r.codigos}`)

  // Los 4074 con cargo pero sin codigo_registro_id: ¿qué escalafon tienen?
  console.log('\n── 4074 con cargo sin cod_reg_id: escalafon del cargo ───')
  const escalafonCargos = await prisma.$queryRaw<{ escalafon: string; q: bigint }[]>`
    SELECT e.nombre as escalafon, COUNT(*) as q
    FROM dim_puestos dp
    JOIN cargos c ON c.id_sial = dp.id_sial_rol
    JOIN escalafones e ON e.id = c.escalafon_id
    WHERE dp.codigo_registro IS NULL
      AND c.codigo_registro_id IS NULL
    GROUP BY e.nombre
    ORDER BY q DESC
  `
  for (const r of escalafonCargos) console.log(`  "${r.escalafon}": ${r.q}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
