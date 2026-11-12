/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────────
// CLI del dry-run del sync de cargos con el Excel MSGC. FASE 1: SOLO LECTURA.
// NO existe modo escritura: ni flag ni código que escriba en la base.
//
// Uso:
//   tsx scripts/sync-cargos-msgc/dry-run.ts --input <nominal.csv> --out <dir>
//       [--sistema-json <fixture.json>] [--previo <resumen.json>]
// Sin --sistema-json lee el sistema con una transacción READ ONLY (sistemaReadonly).
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'
import { leerNominal } from './leerNominal.js'
import { cruzar, type SnapshotSistema } from './cruce.js'
import { VERSION_EQUIVALENCIAS } from './equivalencias.js'
import { armarResumen, escribirReporte, type ResumenJson } from './reporteCsv.js'
import { construirPlanBorrado, type FilaPlanBorrado } from './limpieza.js'

interface Args {
  input: string
  out: string
  sistemaJson?: string
  previo?: string
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const input = get('--input')
  const out = get('--out')
  if (!input || !out) {
    console.error('Uso: dry-run.ts --input <nominal.csv> --out <dir> [--sistema-json <fixture>] [--previo <resumen.json>]')
    process.exit(2)
  }
  return { input, out, sistemaJson: get('--sistema-json'), previo: get('--previo') }
}

function leerMeta(input: string): { corte: string | null; sha256: string | null } {
  const ruta = path.join(path.dirname(input), 'meta.json')
  if (!fs.existsSync(ruta)) return { corte: null, sha256: null }
  const m = JSON.parse(fs.readFileSync(ruta, 'utf8')) as { corte?: string; sha256?: string }
  return { corte: m.corte ?? null, sha256: m.sha256 ?? null }
}

interface SistemaCargado {
  sistema: SnapshotSistema
  /** count(*) por tabla del plan de borrado (read-only, o del fixture si trae conteos_tablas). */
  conteos: Record<string, number>
}

async function cargarSistema(args: Args): Promise<SistemaCargado> {
  if (args.sistemaJson) {
    const fx = JSON.parse(fs.readFileSync(args.sistemaJson, 'utf8')) as SnapshotSistema & { conteos_tablas?: Record<string, number> }
    return { sistema: fx, conteos: fx.conteos_tablas ?? {} }
  }
  // Import dinámico: la corrida con fixture no necesita el cliente de Prisma ni la base.
  const { PrismaClient } = await import('@prisma/client')
  const { cargarSnapshot, contarTablasBorrar } = await import('./sistemaReadonly.js')
  const prisma = new PrismaClient()
  try {
    const cliente = prisma as unknown as Parameters<typeof cargarSnapshot>[0]
    const sistema = await cargarSnapshot(cliente)
    return { sistema, conteos: await contarTablasBorrar(cliente) }
  } finally {
    await prisma.$disconnect()
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const filas = leerNominal(args.input)
  const { sistema, conteos } = await cargarSistema(args)
  const previo = args.previo ? (JSON.parse(fs.readFileSync(args.previo, 'utf8')) as ResumenJson) : null

  const resultado = cruzar(filas, sistema)
  const k = resultado.fase2.concursos
  const plan: FilaPlanBorrado[] = construirPlanBorrado(conteos, {
    concursos_cph: k.eliminar_por_tipo.CPH ?? 0,
    concursos_ceetps: k.eliminar_por_tipo.CEETPS ?? 0,
    concursos: k.eliminar,
  })
  const resumen = armarResumen(resultado, { ...leerMeta(args.input), version_equivalencias: VERSION_EQUIVALENCIAS }, previo, plan)
  const archivos = escribirReporte(args.out, resultado, resumen)

  console.log(`Filas del Excel: ${filas.length}; cargos del sistema: ${sistema.cargos.length}`)
  console.log(`Categorias: ${Object.entries(resultado.conteos).map(([k, v]) => `${k}=${v}`).join(' ')}`)
  const ci = resultado.cierre
  console.log(`CIERRE (vigente + validacion_vacante): proyectado ${ci.proyectado_vigente_mas_validacion}; Excel ${ci.total_excel}; diferencia ${ci.diferencia_vigente_mas_validacion}`)
  console.log(`(secundario) solo vigente: proyectado ${ci.proyectado_solo_vigente}; Excel vigente ${ci.excel_vigente}`)
  console.log(`Cupos: reusados ${resultado.cupos.reusados}; a crear ${resultado.cupos.faltan}; a no vigente ${resultado.cupos.sobran}`)
  console.log(`Concursos colgados: ${resultado.concursos_colgados.totales.filas} filas en ${resultado.concursos_colgados.totales.cargos} cargos; a revisar ${resultado.concursos_colgados.totales.revisar}`)
  console.log(`Archivos en ${args.out}: ${archivos.join(', ')}`)
  console.log(`Plan de borrado: ${plan.reduce((a, p) => a + p.filas, 0)} filas en ${plan.length} tablas (solo conteo; ver resumen.md)`)
  console.log('SIMULACION: no se escribio nada en ninguna base.')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
