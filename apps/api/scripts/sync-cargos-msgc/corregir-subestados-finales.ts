/* eslint-disable no-console */
// validacion_vacante y no_vigente son estados terminales — sub_estado NULL es correcto.
// Solo corregir: no_vigente con persona en Excel → vigente/vacante
//
// Uso:
//   npx tsx scripts/sync-cargos-msgc/corregir-subestados-finales.ts
//   npx tsx scripts/sync-cargos-msgc/corregir-subestados-finales.ts --ejecutar
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const dryRun = !process.argv.includes('--ejecutar')

const mapaExcel = JSON.parse(
  fs.readFileSync(path.resolve('scripts/sync-cargos-msgc/_excel_mapa.json'), 'utf8')
) as { codigo: string; sial_rol_corto: string; bloque: string; estado: string }[]

const ocupActivas = await prisma.$queryRaw<{ codigo: string; id_sial_rol: string }[]>`
  SELECT c.codigo, o.id_sial_rol
  FROM ocupaciones o JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL AND c.deleted_at IS NULL AND c.codigo IS NOT NULL AND c.estado = 'vigente'
`
const ocupPorCodigo = new Map<string, Set<string>>()
for (const o of ocupActivas) {
  const corto = o.id_sial_rol.split('-').slice(0, 2).join('-')
  if (!ocupPorCodigo.has(o.codigo)) ocupPorCodigo.set(o.codigo, new Set())
  ocupPorCodigo.get(o.codigo)!.add(corto)
}

const cargos = await prisma.$queryRaw<{ codigo: string; estado: string }[]>`
  SELECT codigo, estado FROM cargos WHERE deleted_at IS NULL AND codigo IS NOT NULL
`
const cargoPorCodigo = new Map(cargos.map(c => [c.codigo, c]))

// no_vigente con persona en Excel → vigente/vacante
const sinOcupNoVig = mapaExcel.filter(f => {
  if (f.bloque !== 'Dotación' || !f.sial_rol_corto) return false
  const c = cargoPorCodigo.get(f.codigo)
  return c?.estado === 'no_vigente' && !(ocupPorCodigo.get(f.codigo)?.has(f.sial_rol_corto))
}).map(f => f.codigo)

console.log(`no_vigente con persona en Excel → vigente/vacante: ${sinOcupNoVig.length}`)

if (dryRun) {
  console.log('\nModo simulación — usar --ejecutar para aplicar.')
  await prisma.$disconnect()
  process.exit(0)
}

if (sinOcupNoVig.length) {
  await prisma.$executeRaw`
    UPDATE cargos SET estado = 'vigente', sub_estado = 'vacante', updated_at = now()
    WHERE codigo = ANY(${sinOcupNoVig}::text[]) AND deleted_at IS NULL
  `
  console.log(`✓ no_vigente → vigente/vacante: ${sinOcupNoVig.length}`)
} else {
  console.log('Nada que corregir.')
}

await prisma.$disconnect()
