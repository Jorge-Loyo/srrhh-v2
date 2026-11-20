import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const borrados = await prisma.$executeRawUnsafe(`
    DELETE FROM dim_puestos WHERE codigo_registro = '49'
  `)
  console.log(`✓ Eliminados codigo_registro=49: ${borrados}`)

  const normalizados = await prisma.$executeRawUnsafe(`
    UPDATE dim_puestos SET escalafon = 'Plantas Transitorias Modulo Operativo'
    WHERE codigo_registro = '16T' AND (escalafon IS NULL OR escalafon != 'Plantas Transitorias Modulo Operativo')
  `)
  console.log(`✓ Normalizados codigo_registro=16T: ${normalizados}`)

  // Verificación final
  const residuos = await prisma.$queryRaw<{ escalafon: string; q: bigint }[]>`
    SELECT COALESCE(escalafon, 'NULL') as escalafon, COUNT(*) as q
    FROM dim_puestos
    WHERE escalafon IS NULL OR escalafon != initcap(escalafon)
       OR escalafon IN ('planta transitoria', 'ceetps', 'medicos', 'residentes',
                        'escalafon general', 'docentes', 'carrera gerencial',
                        'cuerpos transitorios', 'planta de gabinete', 'autoridades superiores')
    GROUP BY escalafon
  `
  if (residuos.length === 0) console.log('\n✓ Sin residuos — escalafon 100% normalizado')
  else {
    console.log('\n── Residuos restantes ───────────────────────────────────')
    for (const r of residuos) console.log(`  "${r.escalafon}": ${r.q}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
