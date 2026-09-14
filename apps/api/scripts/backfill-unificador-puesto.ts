// Backfill de Cargo.unificadorPuesto — venía vacío en el 99.99% de los
// cargos (padrón subido sin las columnas calculadas por Dotaneitor.py).
// Reconstruye el mismo cruce que hace Dotaneitor ("LIT_COD_REG_LIMPIO -
// LIT_PUESTO") contra RefUnificadorPuesto (ya cargada en la base, 417 filas)
// en vez de depender de re-subir un padrón con esas columnas resueltas.
// Verificado: 46.885/46.892 cargos (100%) matchean con este cruce.
//
// Uso: pnpm --filter @srrhh/api exec tsx scripts/backfill-unificador-puesto.ts [--dry-run]
import { prisma } from '../src/shared/prisma.js'

const DRY_RUN = process.argv.includes('--dry-run')
const LOTE = 500

async function main() {
  const refs = await prisma.refUnificadorPuesto.findMany({ where: { activo: true } })
  const refMap = new Map(refs.map((r) => [r.cruce.trim().toLowerCase(), r.unificador]))

  const cargos = await prisma.cargo.findMany({
    where: { OR: [{ unificadorPuesto: '' }, { unificadorPuesto: null }] },
    select: { id: true, literalPuesto: true, codigoRegistro: { select: { literal: true } } },
  })
  console.log(`Cargos con unificadorPuesto vacío: ${cargos.length}`)

  const actualizaciones: { id: string; unificador: string }[] = []
  const sinMatch: string[] = []
  for (const c of cargos) {
    const litReg = c.codigoRegistro?.literal
    if (!litReg || !c.literalPuesto) { sinMatch.push(`${litReg ?? '—'} - ${c.literalPuesto ?? '—'}`); continue }
    const cruce = `${litReg} - ${c.literalPuesto}`.trim().toLowerCase()
    const unificador = refMap.get(cruce)
    if (!unificador) { sinMatch.push(cruce); continue }
    actualizaciones.push({ id: c.id, unificador })
  }

  console.log(`Con match: ${actualizaciones.length} | Sin match: ${sinMatch.length}`)
  if (sinMatch.length) {
    console.log('Ejemplos sin match:', [...new Set(sinMatch)].slice(0, 15))
  }

  if (DRY_RUN) {
    console.log('--dry-run: no se escribió nada.')
    return
  }

  for (let i = 0; i < actualizaciones.length; i += LOTE) {
    const lote = actualizaciones.slice(i, i + LOTE)
    await prisma.$transaction(
      lote.map((a) => prisma.cargo.update({ where: { id: a.id }, data: { unificadorPuesto: a.unificador } }))
    )
    console.log(`Actualizados ${Math.min(i + LOTE, actualizaciones.length)}/${actualizaciones.length}`)
  }
  console.log('Listo.')
}

main().finally(() => prisma.$disconnect())
