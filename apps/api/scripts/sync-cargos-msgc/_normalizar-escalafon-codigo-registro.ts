// Agrega columna `codigo_registro` a dim_puestos y normaliza valores de `escalafon`.
// Fuente de verdad: tabla codigos_registro (ya existente en el sistema).
// Modo dry-run por defecto; pasar --ejecutar para aplicar.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const EJECUTAR = process.argv.includes('--ejecutar')

// Mapa de normalización de escalafon: valor actual (lowercase) → valor canónico
const NORMALIZAR_ESCALAFON: Record<string, string> = {
  'nueva carrera prof. hosp':              'nueva carrera profesional hospitalaria',
  'residencias':                           'residentes',
  'nueva carrera enfermeria':              'nueva carrera enfermería',
  '??????????':                            null as unknown as string, // se deja NULL
}

async function main() {
  // 1. Agregar columna codigo_registro si no existe
  await prisma.$executeRawUnsafe(`
    ALTER TABLE dim_puestos
    ADD COLUMN IF NOT EXISTS codigo_registro VARCHAR(10)
  `)
  console.log('✓ Columna codigo_registro asegurada en dim_puestos')

  // 2. Poblar codigo_registro: dim_puestos.id_sial_rol = cargos.id_sial (match directo)
  const pobladoResult = await prisma.$executeRawUnsafe(`
    UPDATE dim_puestos dp
    SET codigo_registro = cr.codigo
    FROM cargos c
    JOIN codigos_registro cr ON cr.id = c.codigo_registro_id
    WHERE c.id_sial = dp.id_sial_rol
      AND dp.codigo_registro IS NULL
      AND cr.codigo IS NOT NULL
  `)
  console.log(`✓ codigo_registro poblado en ${pobladoResult} filas desde cargos`)

  // 3. Diagnóstico antes de normalizar escalafon
  const antes = await prisma.$queryRaw<{ escalafon: string; q: bigint }[]>`
    SELECT escalafon, COUNT(*) as q
    FROM dim_puestos
    WHERE escalafon IN (${Object.keys(NORMALIZAR_ESCALAFON).join("','")})
    GROUP BY escalafon
    ORDER BY q DESC
  `
  console.log('\n── Valores a normalizar ─────────────────────────────────')
  for (const r of antes) {
    const destino = NORMALIZAR_ESCALAFON[r.escalafon] ?? 'NULL'
    console.log(`  "${r.escalafon}" (${r.q}) → "${destino}"`)
  }

  if (!EJECUTAR) {
    console.log('\n[DRY-RUN] Pasar --ejecutar para aplicar cambios.')
    return
  }

  // 4. Normalizar escalafon
  let totalActualizados = 0
  for (const [original, canonico] of Object.entries(NORMALIZAR_ESCALAFON)) {
    let n: number
    if (canonico === null) {
      n = await prisma.$executeRawUnsafe(
        `UPDATE dim_puestos SET escalafon = NULL WHERE LOWER(escalafon) = $1`,
        original
      )
    } else {
      n = await prisma.$executeRawUnsafe(
        `UPDATE dim_puestos SET escalafon = $1 WHERE LOWER(escalafon) = $2`,
        canonico, original
      )
    }
    if (n > 0) console.log(`  ✓ "${original}" → "${canonico ?? 'NULL'}": ${n} filas`)
    totalActualizados += n
  }
  console.log(`\n✓ escalafon normalizado: ${totalActualizados} filas actualizadas`)

  // 5. Resumen final
  const resumen = await prisma.$queryRaw<{ escalafon: string; q: bigint }[]>`
    SELECT COALESCE(escalafon, 'NULL') as escalafon, COUNT(*) as q
    FROM dim_puestos
    GROUP BY escalafon
    ORDER BY q DESC
  `
  console.log('\n── Estado final de escalafon ────────────────────────────')
  for (const r of resumen) console.log(`  "${r.escalafon}": ${r.q}`)

  const sinCodReg = await prisma.$queryRaw<{ q: bigint }[]>`
    SELECT COUNT(*) as q FROM dim_puestos WHERE codigo_registro IS NULL
  `
  console.log(`\n  Sin codigo_registro: ${sinCodReg[0].q} filas`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
