/**
 * Backfill de códigos de cargo para los registros existentes sin código.
 *
 * Ejecutar desde el contenedor:
 *   docker exec srrhh_api node --import=tsx/esm scripts/backfill-codigos-cargo.ts
 *
 * O desde WSL con ts-node:
 *   cd /mnt/c/Desarrollo/SRH/SRRHH-Legacy
 *   docker exec -i srrhh_api sh -c "cd /repo/apps/api && node --loader ts-node/esm scripts/backfill-codigos-cargo.ts"
 *
 * El script es idempotente: solo toca cargos con codigo IS NULL.
 */

import { prisma } from '../src/shared/prisma.js'
import { prefijoDeCargo, siguienteCodigoCargo } from '../src/shared/codigoCargo.js'

const LOTE = 500

async function main() {
  const total = await prisma.cargo.count({ where: { codigo: null } })
  console.log(`Cargos sin código: ${total}`)
  if (total === 0) { console.log('Nada que hacer.'); return }

  let procesados = 0

  while (true) {
    const cargos = await prisma.cargo.findMany({
      where: { codigo: null },
      select: {
        id: true,
        escalafon: { select: { nombre: true } },
        unificadorPuesto: true,
        agrupador: true,
      },
      take: LOTE,
    })
    if (cargos.length === 0) break

    await prisma.$transaction(async (tx) => {
      for (const cargo of cargos) {
        const prefijo = prefijoDeCargo({
          escalafon: cargo.escalafon.nombre,
          unificadorPuesto: cargo.unificadorPuesto,
          agrupador: cargo.agrupador,
        })
        const codigo = await siguienteCodigoCargo(prefijo, tx)
        await tx.cargo.update({ where: { id: cargo.id }, data: { codigo } })
      }
    }, { timeout: 5 * 60_000 })

    procesados += cargos.length
    console.log(`  ${procesados}/${total} procesados...`)
  }

  console.log(`✓ Backfill completado: ${procesados} cargos con código asignado.`)
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
