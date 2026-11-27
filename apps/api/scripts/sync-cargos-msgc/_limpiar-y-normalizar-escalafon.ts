// 1. Elimina los 54 dim_puestos sin codigo_registro
// 2. Normaliza escalafon usando codigo_registro → codigos_registro → escalafones.nombre
// Modo dry-run por defecto; pasar --ejecutar para aplicar.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const EJECUTAR = process.argv.includes('--ejecutar')

async function main() {
  // ── 1. Eliminar los 54 sin codigo_registro ──────────────────────────────
  const sinCodReg = await prisma.$queryRaw<{ id_sial_rol: string }[]>`
    SELECT id_sial_rol FROM dim_puestos WHERE codigo_registro IS NULL
  `
  console.log(`Sin codigo_registro: ${sinCodReg.length}`)
  if (sinCodReg.length > 0) {
    if (!EJECUTAR) {
      console.log(`  [DRY-RUN] Se eliminarían ${sinCodReg.length} filas`)
    } else {
      const eliminados = await prisma.$executeRawUnsafe(`
        DELETE FROM dim_puestos WHERE codigo_registro IS NULL
      `)
      console.log(`✓ Eliminados: ${eliminados}`)
    }
  }

  // ── 2. Ver mapa codigo_registro → nombre escalafon ──────────────────────
  const mapa = await prisma.$queryRaw<{ codigo: string; escalafon: string }[]>`
    SELECT cr.codigo, e.nombre as escalafon
    FROM codigos_registro cr
    JOIN escalafones e ON e.id = cr.escalafon_id
    ORDER BY cr.codigo
  `
  console.log('\n── Mapa codigo_registro → escalafon ─────────────────────')
  for (const r of mapa) console.log(`  ${r.codigo} → "${r.escalafon}"`)

  // ── 3. Diagnóstico: escalafon actual vs el que debería tener ────────────
  const desajustes = await prisma.$queryRaw<{ actual: string; correcto: string; q: bigint }[]>`
    SELECT dp.escalafon as actual, e.nombre as correcto, COUNT(*) as q
    FROM dim_puestos dp
    JOIN codigos_registro cr ON cr.codigo = dp.codigo_registro
    JOIN escalafones e ON e.id = cr.escalafon_id
    WHERE LOWER(dp.escalafon) != LOWER(e.nombre)
    GROUP BY dp.escalafon, e.nombre
    ORDER BY q DESC
  `
  console.log('\n── Desajustes escalafon actual vs correcto ───────────────')
  if (desajustes.length === 0) {
    console.log('  Ninguno — todo consistente')
  } else {
    for (const r of desajustes) console.log(`  "${r.actual}" → "${r.correcto}": ${r.q}`)
  }

  if (!EJECUTAR) {
    console.log('\n[DRY-RUN] Pasar --ejecutar para aplicar.')
    return
  }

  // ── 4. Normalizar escalafon ─────────────────────────────────────────────
  const actualizados = await prisma.$executeRawUnsafe(`
    UPDATE dim_puestos dp
    SET escalafon = e.nombre
    FROM codigos_registro cr
    JOIN escalafones e ON e.id = cr.escalafon_id
    WHERE cr.codigo = dp.codigo_registro
      AND dp.escalafon != e.nombre
  `)
  console.log(`✓ escalafon normalizado: ${actualizados} filas`)

  // ── 5. Resumen final ────────────────────────────────────────────────────
  const resumen = await prisma.$queryRaw<{ escalafon: string; q: bigint }[]>`
    SELECT COALESCE(escalafon, 'NULL') as escalafon, COUNT(*) as q
    FROM dim_puestos
    GROUP BY escalafon
    ORDER BY q DESC
  `
  console.log('\n── Estado final escalafon ───────────────────────────────')
  for (const r of resumen) console.log(`  "${r.escalafon}": ${r.q}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
