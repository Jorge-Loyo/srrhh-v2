/* eslint-disable no-console */
// Validación bidireccional:
// A) Excel → Sistema: cada fila del Excel tiene representación correcta en el sistema
// B) Sistema → Excel: cada ocupación activa del sistema está en el Excel con el mismo código
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const mapaExcel = JSON.parse(
  fs.readFileSync(path.resolve('scripts/sync-cargos-msgc/_excel_mapa.json'), 'utf8')
) as { codigo: string; sial_rol_corto: string; bloque: string; estado: string }[]

const excelPorCodigo = new Map(mapaExcel.map(f => [f.codigo, f]))
const excelPorSial = new Map(mapaExcel.filter(f => f.sial_rol_corto).map(f => [f.sial_rol_corto, f]))

// ── Cargar sistema ────────────────────────────────────────────────────────────
const cargos = await prisma.$queryRaw<{
  codigo: string; estado: string; sub_estado: string | null
}[]>`SELECT codigo, estado, sub_estado FROM cargos WHERE deleted_at IS NULL AND codigo IS NOT NULL`
const cargoPorCodigo = new Map(cargos.map(c => [c.codigo, c]))

const ocupActivas = await prisma.$queryRaw<{
  codigo: string; id_sial_rol: string
}[]>`
  SELECT c.codigo, o.id_sial_rol
  FROM ocupaciones o JOIN cargos c ON c.id = o.cargo_id
  WHERE o.hasta IS NULL AND c.deleted_at IS NULL AND c.codigo IS NOT NULL
    AND c.estado = 'vigente'
`
const ocupPorCodigo = new Map<string, Set<string>>()
const ocupPorSial = new Map<string, string>()  // sial_corto → codigo
for (const o of ocupActivas) {
  const corto = o.id_sial_rol.split('-').slice(0, 2).join('-')
  if (!ocupPorCodigo.has(o.codigo)) ocupPorCodigo.set(o.codigo, new Set())
  ocupPorCodigo.get(o.codigo)!.add(corto)
  ocupPorSial.set(corto, o.codigo)
}

// ── A. Excel → Sistema ────────────────────────────────────────────────────────
console.log('\n── A. Excel → Sistema ──────────────────────────────────────────')
type Problema = { codigo: string; bloque: string; problema: string }
const problemasA: Problema[] = []

for (const f of mapaExcel) {
  const { codigo, sial_rol_corto, bloque, estado: estadoExcel } = f
  const cargo = cargoPorCodigo.get(codigo)

  if (!cargo) {
    problemasA.push({ codigo, bloque, problema: 'código no existe en sistema' })
    continue
  }
  if (estadoExcel === 'En validación') continue

  if (bloque === 'Dotación' && sial_rol_corto) {
    if (!ocupPorCodigo.get(codigo)?.has(sial_rol_corto))
      problemasA.push({ codigo, bloque, problema: `sin ocupación activa de ${sial_rol_corto}` })
    continue
  }
  if (bloque === 'Concurso') {
    if (cargo.sub_estado !== 'concurso')
      problemasA.push({ codigo, bloque, problema: `sub_estado=${cargo.sub_estado}, esperado concurso` })
    continue
  }
  if (bloque === 'Sin designar' || bloque === 'Nunca levantado') {
    if (cargo.sub_estado !== 'vacante' && cargo.sub_estado !== 'concurso')
      problemasA.push({ codigo, bloque, problema: `sub_estado=${cargo.sub_estado}, esperado vacante` })
    continue
  }
}

const porTipoA = new Map<string, number>()
for (const p of problemasA) {
  const tipo = p.problema.startsWith('sin ocupación') ? 'sin ocupación activa' : p.problema.split('(')[0].trim()
  porTipoA.set(tipo, (porTipoA.get(tipo) ?? 0) + 1)
}
console.log(`Problemas: ${problemasA.length}`)
for (const [t, n] of [...porTipoA.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`  ${n.toString().padStart(5)}  ${t}`)

// ── B. Sistema → Excel ────────────────────────────────────────────────────────
console.log('\n── B. Sistema → Excel ──────────────────────────────────────────')
type ProblemaB = { sial_rol: string; codigo_sistema: string; problema: string }
const problemasB: ProblemaB[] = []

for (const [sialCorto, codigoSistema] of ocupPorSial) {
  const excelFila = excelPorSial.get(sialCorto)

  if (!excelFila) {
    problemasB.push({ sial_rol: sialCorto, codigo_sistema: codigoSistema, problema: 'persona no está en Excel' })
    continue
  }
  if (excelFila.codigo !== codigoSistema) {
    problemasB.push({
      sial_rol: sialCorto,
      codigo_sistema: codigoSistema,
      problema: `código distinto: sistema=${codigoSistema} excel=${excelFila.codigo}`
    })
  }
}

const porTipoB = new Map<string, number>()
for (const p of problemasB) {
  porTipoB.set(p.problema.split(':')[0], (porTipoB.get(p.problema.split(':')[0]) ?? 0) + 1)
}
console.log(`Problemas: ${problemasB.length}`)
for (const [t, n] of [...porTipoB.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`  ${n.toString().padStart(5)}  ${t}`)

// Muestra de código distinto
const distintos = problemasB.filter(p => p.problema.startsWith('código distinto'))
if (distintos.length) {
  console.log(`\n  Muestra código distinto (10):`)
  for (const p of distintos.slice(0, 10))
    console.log(`    ${p.sial_rol}: ${p.problema}`)
}

// ── Resumen final ─────────────────────────────────────────────────────────────
console.log('\n── Resumen ─────────────────────────────────────────────────────')
console.log(`Total filas Excel:              ${mapaExcel.length}`)
console.log(`Cargos en sistema:              ${cargos.length}`)
console.log(`Ocupaciones activas (vigentes): ${ocupActivas.length}`)
console.log(`A. Problemas Excel→Sistema:     ${problemasA.length}`)
console.log(`B. Problemas Sistema→Excel:     ${problemasB.length}`)

await prisma.$disconnect()
