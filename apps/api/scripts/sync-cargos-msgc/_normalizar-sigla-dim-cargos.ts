/* eslint-disable no-console */
// Normaliza dim_cargos.sigla antes de renombrar a efector y agregar FK:
//   1. ssapac → SSAPAC
//   2. DGAH* → hospital real (sacar prefijo DGAH, ej. DGAHBR → HBR)
//
// Uso: npx tsx scripts/sync-cargos-msgc/_normalizar-sigla-dim-cargos.ts [--ejecutar]
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const EJECUTAR = process.argv.includes('--ejecutar')

async function main() {
  // Casos a corregir
  const casos = [
    { de: 'ssapac', a: 'SSAPAC' },
    ...['BR','GACA','GACD','GADS','GAIP','GAJAF','GAP','GAPP','GARM','GAT','GATA','GAVS','GAZ','GNPE','GNRG']
      .map(h => ({ de: `DGAH${h}`, a: h.startsWith('G') ? `H${h}` : `H${h}` })),
  ]
  // Corrección manual: DGAHBR → HBR (no HBR con prefijo H ya incluido)
  const mapeo: { de: string; a: string }[] = [
    { de: 'ssapac',    a: 'SSAPAC'  },
    { de: 'DGAHBR',    a: 'HBR'     },
    { de: 'DGAHGACA',  a: 'HGACA'   },
    { de: 'DGAHGACD',  a: 'HGACD'   },
    { de: 'DGAHGADS',  a: 'HGADS'   },
    { de: 'DGAHGAIP',  a: 'HGAIP'   },
    { de: 'DGAHGAJAF', a: 'HGAJAF'  },
    { de: 'DGAHGAP',   a: 'HGAP'    },
    { de: 'DGAHGAPP',  a: 'HGAPP'   },
    { de: 'DGAHGARM',  a: 'HGARM'   },
    { de: 'DGAHGAT',   a: 'HGAT'    },
    { de: 'DGAHGATA',  a: 'HGATA'   },
    { de: 'DGAHGAVS',  a: 'HGAVS'   },
    { de: 'DGAHGAZ',   a: 'HGAZ'    },
    { de: 'DGAHGNPE',  a: 'HGNPE'   },
    { de: 'DGAHGNRG',  a: 'HGNRG'   },
  ]

  console.log('Correcciones a aplicar:')
  for (const { de, a } of mapeo) console.log(`  ${de.padEnd(15)} → ${a}`)

  if (!EJECUTAR) { console.log('\n[DRY-RUN] Pasar --ejecutar para aplicar.'); return }

  let total = 0
  for (const { de, a } of mapeo) {
    const n = await prisma.$executeRaw`UPDATE dim_cargos SET sigla = ${a} WHERE sigla = ${de}`
    if (n > 0) console.log(`  ✓ ${de} → ${a}: ${n} filas`)
    total += n
  }
  console.log(`\n✓ Total corregidos: ${total} filas`)

  // Verificar que no quede ninguna fuera de dim_efectores
  const fuera = await prisma.$queryRaw<{ sigla: string; n: bigint }[]>`
    SELECT dc.sigla, COUNT(*) AS n
    FROM dim_cargos dc
    WHERE dc.sigla IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM dim_efectores de WHERE de.sigla = dc.sigla)
    GROUP BY dc.sigla ORDER BY dc.sigla
  `
  if (fuera.length === 0) {
    console.log('✓ Todas las siglas de dim_cargos están en dim_efectores — listo para FK')
  } else {
    console.log(`\n⚠️  Siglas aún fuera de dim_efectores (${fuera.length}):`)
    for (const r of fuera) console.log(`  ${r.sigla.padEnd(20)} ${r.n} cargos`)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
