/* eslint-disable no-console */
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const mapaExcel = JSON.parse(
  fs.readFileSync(path.resolve('scripts/sync-cargos-msgc/_excel_mapa.json'), 'utf8')
) as { codigo: string; sial_rol_corto: string; bloque: string; estado: string }[]

const cargos = await prisma.$queryRaw<{
  codigo: string; estado: string; sub_estado: string | null
}[]>`SELECT codigo, estado, sub_estado FROM cargos WHERE deleted_at IS NULL AND codigo IS NOT NULL`
const cargoPorCodigo = new Map(cargos.map(c => [c.codigo, c]))

const resumen = (label: string, filas: typeof mapaExcel) => {
  console.log(`\n── ${label} (${filas.length}) ${'─'.repeat(Math.max(0, 60 - label.length - String(filas.length).length))}`)
  const dist = new Map<string, number>()
  for (const f of filas) {
    const c = cargoPorCodigo.get(f.codigo)
    const key = c
      ? `sistema: estado=${c.estado}  sub_estado=${c.sub_estado ?? 'NULL'}`
      : 'sistema: NO EXISTE en cargos'
    dist.set(key, (dist.get(key) ?? 0) + 1)
  }
  for (const [k, v] of [...dist.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`  ${v.toString().padStart(5)}  ${k}`)
}

// ── 1. Excel estado="En validación" ──────────────────────────────────────────
resumen('Excel estado="En validación"', mapaExcel.filter(f => f.estado === 'En validación'))

// ── 2. Excel bloque="Concurso" ────────────────────────────────────────────────
resumen('Excel bloque="Concurso"', mapaExcel.filter(f => f.bloque === 'Concurso'))

// ── 3. Concurso con sub_estado=ocupado — quién los ocupa ─────────────────────
const concursoOcupCodigos = mapaExcel
  .filter(f => f.bloque === 'Concurso')
  .map(f => f.codigo)
  .filter(cod => cargoPorCodigo.get(cod)?.sub_estado === 'ocupado')

console.log(`\n── Concurso/ocupado — detalle ocupante (${concursoOcupCodigos.length}) ──────────────────`)
if (concursoOcupCodigos.length) {
  const ocupaciones = await prisma.$queryRaw<{
    codigo: string; id_sial_rol: string; situacion_revista: string
  }[]>`
    SELECT c.codigo, o.id_sial_rol, o.situacion_revista
    FROM ocupaciones o
    JOIN cargos c ON c.id = o.cargo_id
    WHERE o.hasta IS NULL AND c.deleted_at IS NULL
      AND c.codigo = ANY(${concursoOcupCodigos}::text[])
    ORDER BY c.codigo
  `
  if (ocupaciones.length === 0) {
    console.log('  (ninguna ocupación activa encontrada — sub_estado=ocupado incorrecto)')
  } else {
    for (const o of ocupaciones.slice(0, 15))
      console.log(`  ${o.codigo}: sial=${o.id_sial_rol}  sit_revista=${o.situacion_revista}`)
    if (ocupaciones.length > 15) console.log(`  ... y ${ocupaciones.length - 15} más`)
  }
}

// ── 4. Excel bloque="Sin designar" ───────────────────────────────────────────
resumen('Excel bloque="Sin designar"', mapaExcel.filter(f => f.bloque === 'Sin designar'))

// ── 5. Excel bloque="Nunca levantado" ────────────────────────────────────────
resumen('Excel bloque="Nunca levantado"', mapaExcel.filter(f => f.bloque === 'Nunca levantado'))

await prisma.$disconnect()
