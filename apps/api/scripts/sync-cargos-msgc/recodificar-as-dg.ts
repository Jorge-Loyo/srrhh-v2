/* eslint-disable no-console */
// Recodifica los cargos con prefijo AS-DG-XXXXXX → AS-XXXXXX (decisión A2 del sprint).
// Guarda el código viejo en codigo_legacy antes de cambiar.
// Uso: npx tsx scripts/sync-cargos-msgc/recodificar-as-dg.ts [--dry-run]
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--ejecutar')

try {
  const cargos = await prisma.$queryRaw<{ id: string; codigo: string }[]>`
    SELECT id::text, codigo
    FROM cargos
    WHERE deleted_at IS NULL AND codigo ~ '^AS-DG-[0-9]{6}$'
    ORDER BY codigo
  `

  console.log(`Cargos AS-DG encontrados: ${cargos.length}`)
  for (const c of cargos) {
    const nuevo = c.codigo.replace(/^AS-DG-/, 'AS-')
    console.log(`  ${c.codigo} → ${nuevo}`)
  }

  if (dryRun) {
    console.log('\nModo simulación — no se escribió nada. Usar --ejecutar para aplicar.')
  } else {
    // Paso 1: liberar los códigos AS-XXXXXX destino que ya existan (evita conflicto UNIQUE)
    const codigosNuevos = cargos.map((c) => c.codigo.replace(/^AS-DG-/, 'AS-'))
    const liberados = Number(await prisma.$executeRaw`
      UPDATE cargos
      SET codigo_legacy = COALESCE(codigo_legacy, codigo),
          codigo = NULL,
          updated_at = now()
      WHERE codigo = ANY(${codigosNuevos}::text[])
    `)
    console.log(`\nPaso 1: ${liberados} códigos destino liberados`)

    // Paso 2: liberar los AS-DG actuales y guardar legacy
    await prisma.$executeRaw`
      UPDATE cargos
      SET codigo_legacy = COALESCE(codigo_legacy, codigo),
          codigo = NULL,
          updated_at = now()
      WHERE codigo ~ '^AS-DG-[0-9]{6}$' AND deleted_at IS NULL
    `

    // Paso 3: asignar nuevos códigos AS-XXXXXX
    const json = JSON.stringify(cargos.map((c) => ({ id: c.id, codigo: c.codigo.replace(/^AS-DG-/, 'AS-') })))
    const asignados = Number(await prisma.$executeRaw`
      UPDATE cargos c
      SET codigo = v.codigo, updated_at = now()
      FROM json_to_recordset(${json}::json) AS v(id uuid, codigo text)
      WHERE c.id = v.id
    `)
    console.log(`Paso 2-3: ${asignados} cargos recodificados`)

    // Verificar que no quedaron AS-DG
    const restantes = await prisma.$queryRaw<{ cantidad: number }[]>`
      SELECT count(*)::int AS cantidad FROM cargos
      WHERE deleted_at IS NULL AND codigo ~ '^AS-DG-'
    `
    console.log(`\nVerificación: AS-DG restantes = ${restantes[0].cantidad}`)
    console.log(restantes[0].cantidad === 0 ? '✓ Recodificación completada.' : '✗ Quedaron cargos sin recodificar.')
  }
} finally {
  await prisma.$disconnect()
}
