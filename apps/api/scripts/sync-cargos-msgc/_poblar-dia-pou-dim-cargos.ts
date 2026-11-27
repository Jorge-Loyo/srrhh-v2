import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  // Limpiar valores previos
  await p.$executeRaw`UPDATE dim_cargos SET dia_pou = NULL WHERE modalidad = 'POU'`
  console.log('Limpiados valores previos')

  // Obtener dia por cargo via cargo_id_sistema → ocupaciones → dim_puestos
  const rows = await p.$queryRaw<{ codigo_cargo: string; dia: string }[]>`
    SELECT dc.codigo_cargo, dp.dia
    FROM dim_cargos dc
    JOIN ocupaciones o ON o.cargo_id = dc.cargo_id_sistema::uuid
    JOIN dim_puestos dp ON dp.id_sial_rol = o.id_sial_rol
    WHERE dc.modalidad = 'POU' AND dp.dia IS NOT NULL
  `
  console.log(`Pares cargo/dia encontrados: ${rows.length}`)

  // Agrupar por cargo — detectar conflictos (múltiples días distintos)
  const cargoToDias = new Map<string, Set<string>>()
  for (const { codigo_cargo, dia } of rows) {
    if (!cargoToDias.has(codigo_cargo)) cargoToDias.set(codigo_cargo, new Set())
    cargoToDias.get(codigo_cargo)!.add(dia)
  }

  const unicos: { codigo_cargo: string; dia: string }[] = []
  let conflictos = 0
  for (const [codigo_cargo, dias] of cargoToDias) {
    if (dias.size === 1) unicos.push({ codigo_cargo, dia: [...dias][0] })
    else conflictos++
  }
  console.log(`Únicos: ${unicos.length} | Conflictos (múltiples días): ${conflictos}`)

  // Actualizar en lotes
  const BATCH = 500
  let updated = 0
  for (let i = 0; i < unicos.length; i += BATCH) {
    const batch = unicos.slice(i, i + BATCH)
    for (const { codigo_cargo, dia } of batch) {
      await p.$executeRaw`
        UPDATE dim_cargos SET dia_pou = ${dia}
        WHERE codigo_cargo = ${codigo_cargo}
      `
      updated++
    }
    process.stdout.write(`\r  ${updated}/${unicos.length}`)
  }
  console.log()

  const stats = await p.$queryRaw<{ con_dia: bigint; sin_dia: bigint }[]>`
    SELECT
      COUNT(*) FILTER (WHERE dia_pou IS NOT NULL) as con_dia,
      COUNT(*) FILTER (WHERE dia_pou IS NULL)     as sin_dia
    FROM dim_cargos WHERE modalidad = 'POU'
  `
  console.log(`POU con dia_pou: ${stats[0].con_dia} / sin dia_pou: ${stats[0].sin_dia}`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => p.$disconnect())
