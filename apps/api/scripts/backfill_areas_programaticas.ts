/**
 * S23-4: backfillea Cargo.cesacId / Cargo.unidadFijaId contra el catálogo
 * cargado en S23-3 (seed_areas_programaticas.ts).
 *
 * Criterio (confirmado en la auditoría S23-1 contra datos reales):
 * 1. Primero por código: cargos.codigo_repa == cesacs.codigo_reparticion /
 *    unidades_fijas_apayc.codigo_reparticion — cubre 51/52 CeSACs y las 7
 *    unidades fijas (100%, ver seed).
 * 2. Fallback por texto (descripcion_repa) para TODOS los CeSACs/unidades
 *    fijas, no solo el que quedó sin código en el catálogo (CeSAC Nº53):
 *    el dry-run encontró cargos con un codigo_repa "satélite" distinto del
 *    canónico para el mismo CeSAC (ej. Nº7: catálogo 40221150, pero hay
 *    cargos reales con 40221157 y texto idéntico "cesac n° 7") — el texto
 *    normalizado ("cesac n° {numero}") es más confiable que un único código
 *    fijo para capturar esas variantes.
 *
 * Re-ejecutable: solo toca cargos con cesac_id/unidad_fija_id NULL, no
 * pisa un backfill ya hecho a mano.
 *
 * Uso:
 *   cd apps/api
 *   pnpm exec tsx scripts/backfill_areas_programaticas.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')

async function main() {
  console.log(`🔗 Backfill Cargo.cesacId / Cargo.unidadFijaId (S23-4)${dryRun ? ' [DRY RUN]' : ''}...`)

  // ── 1. Por código: cesacs ──
  const cesacsPorCodigo = await prisma.$queryRaw<{ cesac_id: string; cargos: bigint }[]>`
    SELECT cs.id AS cesac_id, count(c.id)::bigint AS cargos
    FROM cesacs cs
    JOIN cargos c ON c.codigo_repa = cs.codigo_reparticion AND c.cesac_id IS NULL AND c.deleted_at IS NULL
    GROUP BY cs.id
  `
  const totalCesacPorCodigo = cesacsPorCodigo.reduce((acc, r) => acc + Number(r.cargos), 0)

  if (!dryRun) {
    await prisma.$executeRaw`
      UPDATE cargos c SET cesac_id = cs.id
      FROM cesacs cs
      WHERE c.codigo_repa = cs.codigo_reparticion AND c.cesac_id IS NULL AND c.deleted_at IS NULL
    `
  }
  console.log(`✅ CeSACs por código: ${totalCesacPorCodigo} cargos (${cesacsPorCodigo.length} CeSACs distintos)`)

  // ── 2. Por código: unidades fijas ──
  const fijasPorCodigo = await prisma.$queryRaw<{ unidad_fija_id: string; cargos: bigint }[]>`
    SELECT u.id AS unidad_fija_id, count(c.id)::bigint AS cargos
    FROM unidades_fijas_apayc u
    JOIN cargos c ON c.codigo_repa = u.codigo_reparticion AND c.unidad_fija_id IS NULL AND c.deleted_at IS NULL
    GROUP BY u.id
  `
  const totalFijaPorCodigo = fijasPorCodigo.reduce((acc, r) => acc + Number(r.cargos), 0)

  if (!dryRun) {
    await prisma.$executeRaw`
      UPDATE cargos c SET unidad_fija_id = u.id
      FROM unidades_fijas_apayc u
      WHERE c.codigo_repa = u.codigo_reparticion AND c.unidad_fija_id IS NULL AND c.deleted_at IS NULL
    `
  }
  console.log(`✅ Unidades fijas por código: ${totalFijaPorCodigo} cargos (${fijasPorCodigo.length} unidades distintas)`)

  // ── 3. Fallback por texto: TODOS los CeSACs (captura códigos "satélite"
  // que no matchean el canónico del catálogo pero tienen el mismo texto
  // normalizado — ver hallazgo del dry-run en el comentario de arriba). ──
  const todosLosCesacs = await prisma.cesac.findMany({ select: { id: true, numero: true } })

  let totalCesacPorTexto = 0
  for (const cs of todosLosCesacs) {
    // Mismo patrón normalizado que usa el pipeline del padrón: "cesac n° {numero}".
    const patron = `cesac n° ${cs.numero}`
    const matches = await prisma.cargo.findMany({
      where: { descripcionRepa: patron, cesacId: null, deletedAt: null },
      select: { id: true },
    })
    if (matches.length > 0 && !dryRun) {
      await prisma.cargo.updateMany({
        where: { id: { in: matches.map((m) => m.id) } },
        data: { cesacId: cs.id },
      })
    }
    if (matches.length > 0) console.log(`  · CeSAC Nº${cs.numero} por texto ("${patron}"): ${matches.length} cargos`)
    totalCesacPorTexto += matches.length
  }
  console.log(`✅ CeSACs por texto (fallback, todos): ${totalCesacPorTexto} cargos`)

  // ── 3b. Mismo fallback por texto para unidades fijas (patrones anclados
  // con paréntesis para CEMAR, que si no "cemar i" matchearía substring de
  // "cemar ii"/"cemar iii"/"cemar iv"). ──
  const patronesUnidadFija: Record<string, string> = {
    'CEMAR I': '(cemar i)',
    'CEMAR II': '(cemar ii)',
    'CEMAR III': '(cemar iii)',
    'CEMAR IV': '(cemar iv)',
    'Centro Odontológico Infantil N°1': 'centro odontologico infantil n° 1',
    'Centro Odontológico Infantil N°2': 'centro odontologico infantil n° 2',
    'Red de Odontología': 'red de odontologia',
  }
  const todasLasUnidadesFijas = await prisma.unidadFijaApayC.findMany({ select: { id: true, nombre: true } })

  let totalFijaPorTexto = 0
  for (const u of todasLasUnidadesFijas) {
    const patron = patronesUnidadFija[u.nombre]
    if (!patron) continue
    const matches = await prisma.cargo.findMany({
      where: { descripcionRepa: { contains: patron, mode: 'insensitive' }, unidadFijaId: null, deletedAt: null },
      select: { id: true },
    })
    if (matches.length > 0 && !dryRun) {
      await prisma.cargo.updateMany({
        where: { id: { in: matches.map((m) => m.id) } },
        data: { unidadFijaId: u.id },
      })
    }
    if (matches.length > 0) console.log(`  · ${u.nombre} por texto ("${patron}"): ${matches.length} cargos`)
    totalFijaPorTexto += matches.length
  }
  console.log(`✅ Unidades fijas por texto (fallback, todas): ${totalFijaPorTexto} cargos`)

  // ── 4. Reporte de cobertura — en dry-run no se escribió nada, así que acá
  // se reporta el estado ANTES de este backfill (no incluye lo que recién se
  // contó arriba); el total real post-backfill solo se ve corriendo sin
  // --dry-run. ──
  const [totalCargos, totalConCesac, totalConUnidadFija] = await Promise.all([
    prisma.cargo.count({ where: { deletedAt: null } }),
    prisma.cargo.count({ where: { deletedAt: null, cesacId: { not: null } } }),
    prisma.cargo.count({ where: { deletedAt: null, unidadFijaId: { not: null } } }),
  ])
  console.log(`\n📊 Cobertura ${dryRun ? 'ANTES de este backfill (dry-run, nada se escribió)' : 'total'}:`)
  console.log(`   cargos vinculados a un CeSAC:       ${totalConCesac} / ${totalCargos}`)
  console.log(`   cargos vinculados a una unidad fija: ${totalConUnidadFija} / ${totalCargos}`)

  // Cargos que PARECEN de CeSAC/CEMAR/COI/Red de Odontología por texto pero
  // no quedaron vinculados — para revisión manual (no deberían ser muchos:
  // el CeSAC Nº53 sin dotación hoy es el único caso esperado).
  const sospechosos = await prisma.cargo.findMany({
    where: {
      deletedAt: null,
      cesacId: null,
      unidadFijaId: null,
      OR: [
        { descripcionRepa: { contains: 'cesac', mode: 'insensitive' } },
        { descripcionRepa: { contains: 'cemar', mode: 'insensitive' } },
        { descripcionRepa: { contains: 'odontologico infantil', mode: 'insensitive' } },
        { descripcionRepa: { contains: 'red de odontologia', mode: 'insensitive' } },
      ],
    },
    select: { codigo: true, codigoRepa: true, descripcionRepa: true },
    take: 50,
  })
  if (sospechosos.length > 0) {
    console.log(`\n⚠️  ${sospechosos.length} cargo(s) con texto de CeSAC/CEMAR/COI/Red Odonto sin vincular (revisión manual):`)
    for (const s of sospechosos) console.log(`   ${s.codigo ?? '(sin código)'} · ${s.codigoRepa} · "${s.descripcionRepa}"`)
  } else {
    console.log('\n✅ Sin cargos sospechosos pendientes de revisión manual.')
  }

  console.log(`\n🎉 Backfill ${dryRun ? 'simulado (dry-run)' : 'completado'}.`)
}

main()
  .catch((err) => {
    console.error('❌ Error:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
