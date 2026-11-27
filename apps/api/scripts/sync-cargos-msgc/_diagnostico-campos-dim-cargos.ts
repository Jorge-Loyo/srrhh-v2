import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const campos = [
    'nombre_cargo', 'tipo', 'nivel_conduccion', 'acronimo',
    'linea_pou', 'universo', 'reparticion', 'unidad_arbol',
    'bloque', 'suma_en_total',
  ]

  console.log('Campo'.padEnd(20), 'Con dato'.padStart(10), 'Nulos'.padStart(10), 'Distintos'.padStart(12))
  console.log('─'.repeat(55))

  for (const campo of campos) {
    const r = await prisma.$queryRawUnsafe<{ con_dato: bigint; nulos: bigint; distintos: bigint }[]>(`
      SELECT
        COUNT(*) FILTER (WHERE ${campo} IS NOT NULL AND ${campo}::text <> '') as con_dato,
        COUNT(*) FILTER (WHERE ${campo} IS NULL OR ${campo}::text = '')      as nulos,
        COUNT(DISTINCT ${campo})                                              as distintos
      FROM dim_cargos
    `)
    console.log(
      campo.padEnd(20),
      String(r[0].con_dato).padStart(10),
      String(r[0].nulos).padStart(10),
      String(r[0].distintos).padStart(12),
    )
  }

  // Muestra de planta_guardia para ver valores actuales
  const modalidades = await prisma.$queryRaw<{ planta_guardia: string; n: bigint }[]>`
    SELECT planta_guardia, COUNT(*) as n FROM dim_cargos
    WHERE planta_guardia IS NOT NULL
    GROUP BY planta_guardia ORDER BY n DESC
  `
  console.log('\nValores actuales de planta_guardia:')
  for (const r of modalidades) console.log(' ', String(r.planta_guardia).padEnd(20), r.n)

  // Muestra de situacion para ver valores actuales
  const situaciones = await prisma.$queryRaw<{ situacion: string; n: bigint }[]>`
    SELECT situacion, COUNT(*) as n FROM dim_cargos
    WHERE situacion IS NOT NULL
    GROUP BY situacion ORDER BY n DESC
  `
  console.log('\nValores actuales de situacion:')
  for (const r of situaciones) console.log(' ', String(r.situacion).padEnd(20), r.n)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
