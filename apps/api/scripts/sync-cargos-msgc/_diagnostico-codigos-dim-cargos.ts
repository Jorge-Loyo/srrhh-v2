import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Confirmar formato en tabla cargos (operativa)
  const muestraCargos = await prisma.$queryRaw<{ codigo: string }[]>`
    SELECT codigo FROM cargos
    WHERE codigo LIKE 'CPH-J-%'
    LIMIT 10
  `
  console.log('Formato CPH-J en tabla cargos (operativa):')
  for (const r of muestraCargos) console.log(' ', r.codigo)

  // ¿Hay colisiones? CPH-J-POF-000001 → CPH-J-P-000001 ¿ya existe?
  const colisiones = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) as n
    FROM dim_cargos viejo
    JOIN dim_cargos nuevo ON nuevo.codigo_cargo =
      CASE
        WHEN viejo.codigo_cargo LIKE 'CPH-J-POF-%'
          THEN 'CPH-J-P-' || substring(viejo.codigo_cargo, 13)
        WHEN viejo.codigo_cargo LIKE 'CPH-J-POU-%'
          THEN 'CPH-J-G-' || substring(viejo.codigo_cargo, 13)
      END
    WHERE viejo.codigo_cargo LIKE 'CPH-J-PO%'
  `
  console.log(`\nColisiones (código nuevo ya existe en dim_cargos): ${colisiones[0].n}`)

  // ¿dim_cargos.cargo_id_sistema linkea a cargos.id? ¿cuántos de los CPH-J-POF tienen link?
  const conLink = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) as n
    FROM dim_cargos dc
    WHERE dc.codigo_cargo LIKE 'CPH-J-PO%'
      AND dc.cargo_id_sistema IS NOT NULL
  `
  console.log(`CPH-J-PO* con cargo_id_sistema: ${conLink[0].n}`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
