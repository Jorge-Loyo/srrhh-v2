/* eslint-disable no-console */
// Cierre dim_efectores:
//   1. Borra las 15 DGAH (direcciones internas de hospitales)
//   2. Marca como activo=false los 12 efectores sin cargos y sin nombre
//   3. Verifica que SSSAME tenga nombre_completo
//
// Uso: npx tsx scripts/sync-cargos-msgc/_cerrar-dim-efectores.ts [--ejecutar]
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const EJECUTAR = process.argv.includes('--ejecutar')

const INACTIVOS = ['DGABS','DGCAPM','DGCTFS','DGCVPM','DGPAPM','DGPLO','DGPSB','IREP','SECBI','SSPPM','UPERICPSM','UPESCA']

async function main() {
  // Conteo previo DGAH en dim_puestos
  const usoDgah = await prisma.$queryRaw<{ efector: string; n: bigint }[]>`
    SELECT efector, COUNT(*) AS n FROM dim_puestos WHERE efector LIKE 'DGAH%' GROUP BY efector ORDER BY efector
  `
  console.log(`DGAH en dim_puestos (quedarán con efector=NULL): ${usoDgah.map(r => `${r.efector}(${r.n})`).join(', ') || 'ninguna'}`)
  console.log(`Efectores a marcar inactivos: ${INACTIVOS.join(', ')}`)

  const sssame = await prisma.$queryRaw<{ nombre_completo: string | null }[]>`
    SELECT nombre_completo FROM dim_efectores WHERE sigla = 'SSSAME'
  `
  console.log(`SSSAME nombre_completo: ${sssame[0]?.nombre_completo ?? '(NULL)'}`)

  if (!EJECUTAR) { console.log('\n[DRY-RUN] Pasar --ejecutar para aplicar.'); return }

  // 1. Borrar DGAH (ON DELETE SET NULL en dim_puestos)
  const borrados = await prisma.$executeRawUnsafe(`DELETE FROM dim_efectores WHERE sigla LIKE 'DGAH%'`)
  console.log(`✓ DGAH eliminados: ${borrados}`)

  // 2. Marcar inactivos
  const inactivados = await prisma.$executeRaw`
    UPDATE dim_efectores SET activo = false WHERE sigla = ANY(${INACTIVOS})
  `
  console.log(`✓ Marcados inactivos: ${inactivados}`)

  // 3. Estado final
  const final = await prisma.$queryRaw<{ total: bigint; activos: bigint; inactivos: bigint; sin_nombre: bigint }[]>`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE activo = true)  AS activos,
      COUNT(*) FILTER (WHERE activo = false) AS inactivos,
      COUNT(*) FILTER (WHERE nombre_completo IS NULL) AS sin_nombre
    FROM dim_efectores
  `
  const f = final[0]
  console.log(`\nEstado final: total=${f.total} | activos=${f.activos} | inactivos=${f.inactivos} | sin nombre_completo=${f.sin_nombre}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
