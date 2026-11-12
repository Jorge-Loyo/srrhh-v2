/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────────
// CLI de la sincronización de cargos con el Excel MSGC (Fases C y D).
//
// POR DEFECTO ES UN DRY-RUN: lee el sistema en una transacción READ ONLY, arma el plan y lo
// resume. Solo escribe con `--ejecutar --confirmo-base-local`, y aun así:
//   - llama asegurarBaseLocal(DATABASE_URL) ANTES de abrir cualquier conexión; se niega si la URL
//     apunta a neon.tech o a un host no local;
//   - registra una fila en sync_corridas.
// Orden del modo escritura: limpieza (solo la primera vez o con --forzar-limpieza) -> carga ->
// recodificación -> recalcular sub_estado -> verificaciones.
//
// ADVERTENCIA: el generador de códigos nuevo (acrónimo MSGC) NO debe llegar a producción antes que los
// datos recodificados: mezclaría prefijos viejos y nuevos. Este CLI solo corre contra la base local.
//
// Uso:
//   tsx scripts/sync-cargos-msgc/sincronizar.ts --input <nominal.csv> [--sistema-json <fixture.json>]
//   tsx scripts/sync-cargos-msgc/sincronizar.ts --input <nominal.csv> --ejecutar --confirmo-base-local [--forzar-limpieza]
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs'
import path from 'node:path'
import { contarCambios, ejecutarCarga, type ResumenCarga } from './cargar.js'
import { cruzar, sistemaAcronimo, type PlanCarga, type SnapshotSistema } from './cruce.js'
import { asegurarBaseLocal } from './guardaBase.js'
import { leerNominal, type FilaNominal } from './leerNominal.js'
import { ejecutarRecodificacion, type PlanRecodificacion } from './recodificar.js'
import type { RepoEscritura } from './repoPrisma.js'
import { evaluarVerificacion, textoVerificacion, type ResultadoVerificacion } from './verificar.js'

export interface ArgsSync {
  input: string
  ejecutar: boolean
  confirmoBaseLocal: boolean
  forzarLimpieza: boolean
  sistemaJson?: string
}

/** Conexión abierta a la base: lectura READ ONLY y transacciones de escritura. */
export interface BaseAbierta {
  leerSnapshot(): Promise<SnapshotSistema>
  transaccion<T>(fn: (repo: RepoEscritura) => Promise<T>): Promise<T>
  cerrar(): Promise<void>
}

export interface DepsSync {
  /** Abre la conexión. Solo se llama DESPUÉS de asegurarBaseLocal en modo escritura. */
  abrirBase(url: string): Promise<BaseAbierta>
  leerFilas(ruta: string): FilaNominal[]
  leerSnapshotJson(ruta: string): SnapshotSistema
  sha256(ruta: string): string | null
  log(mensaje: string): void
}

export interface ResultadoSync {
  modo: 'simulacion' | 'escritura'
  cambiosPlanificados: number
  limpiezaEjecutada: boolean
  carga?: ResumenCarga
  recodificacion?: { cambios: number; colisiones: number; sin_regla: Record<string, number> }
  verificacion?: ResultadoVerificacion
}

export function parseArgs(argv: string[]): ArgsSync {
  const get = (flag: string) => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const input = get('--input')
  if (!input) throw new Error('Uso: sincronizar.ts --input <nominal.csv> [--sistema-json <fixture>] [--ejecutar --confirmo-base-local] [--forzar-limpieza]')
  return {
    input,
    ejecutar: argv.includes('--ejecutar'),
    confirmoBaseLocal: argv.includes('--confirmo-base-local'),
    forzarLimpieza: argv.includes('--forzar-limpieza'),
    sistemaJson: get('--sistema-json'),
  }
}

/** Acrónimo nuevo de cada cargo: el de su fila del Excel si la tiene; si no, el estimado por sus atributos. */
export function construirAcronimos(plan: PlanCarga, sistema: SnapshotSistema): Map<string, string | null> {
  const m = new Map<string, string | null>()
  for (const c of sistema.cargos) {
    const a = sistemaAcronimo(c)
    m.set(c.id, a === 'sin-regla' ? null : a)
  }
  for (const it of plan.items) if (it.cargoId !== null) m.set(it.cargoId, it.fila.acronimo)
  return m
}

export async function sincronizar(args: ArgsSync, env: { DATABASE_URL?: string }, deps: DepsSync): Promise<ResultadoSync> {
  if (args.ejecutar && !args.confirmoBaseLocal) {
    throw new Error('--ejecutar exige tambien --confirmo-base-local (el modo escritura solo corre en una base local).')
  }
  // Salvaguarda ANTES de abrir ninguna conexión de escritura.
  if (args.ejecutar) asegurarBaseLocal(env.DATABASE_URL)

  const filas = deps.leerFilas(args.input)
  const sha = deps.sha256(args.input)

  // ── Simulación (por defecto): solo lectura. ──
  if (!args.ejecutar) {
    let snapshot: SnapshotSistema
    if (args.sistemaJson) snapshot = deps.leerSnapshotJson(args.sistemaJson)
    else {
      if (!env.DATABASE_URL) throw new Error('Falta DATABASE_URL (o --sistema-json) para leer el sistema.')
      const base = await deps.abrirBase(env.DATABASE_URL)
      try {
        snapshot = await base.leerSnapshot()
      } finally {
        await base.cerrar()
      }
    }
    const r = cruzar(filas, snapshot)
    const cambios = contarCambios(r.plan)
    deps.log(`SIMULACION: ${cambios} operaciones planificadas (cargos nuevos ${r.plan.items.filter((i) => i.cargoId === null).length}, a no vigente ${r.plan.noVigenteIds.length}). No se escribio nada.`)
    return { modo: 'simulacion', cambiosPlanificados: cambios, limpiezaEjecutada: false }
  }

  // ── Escritura (solo base local). ──
  const base = await deps.abrirBase(env.DATABASE_URL as string)
  try {
    const r1 = cruzar(filas, await base.leerSnapshot())
    const yaHuboEscritura = await base.transaccion((repo) => repo.hayCorridaEscritura())
    const limpiar = args.forzarLimpieza || !yaHuboEscritura
    if (limpiar) {
      const borradas = await base.transaccion((repo) => repo.limpiar(r1.plan.concursosConservar))
      deps.log(`Limpieza: ${Object.values(borradas).reduce((a, b) => a + b, 0)} filas borradas en ${Object.keys(borradas).length} tablas`)
    } else {
      deps.log('Limpieza omitida: ya hubo una corrida de escritura (usar --forzar-limpieza para repetirla).')
    }

    const snapshot2 = await base.leerSnapshot()
    const r2 = cruzar(filas, snapshot2)
    const cambiosPlanificados = contarCambios(r2.plan)
    const acronimos = construirAcronimos(r2.plan, snapshot2)
    const { carga, recod } = await base.transaccion(async (repo) => {
      const carga = await ejecutarCarga(repo, r2.plan, { log: deps.log })
      const recod: PlanRecodificacion = await ejecutarRecodificacion(repo, acronimos)
      await repo.recalcularSubEstado()
      return { carga, recod }
    })
    deps.log(`Carga: ${carga.cargos_creados} cargos creados, ${carga.cargos_actualizados} actualizados, ${carga.cargos_no_vigente} a no vigente, ${carga.concursos_creados} concursos`)
    deps.log(`Recodificacion: ${recod.cambios.length} codigos cambiados, ${recod.colisiones} colisiones`)

    // Verificación: datos de la base + segunda corrida en seco con el mismo Excel (debe dar 0 cambios).
    const r3 = cruzar(filas, await base.leerSnapshot())
    const datos = await base.transaccion((repo) => repo.datosVerificacion())
    const verificacion = evaluarVerificacion(datos, filas.length, contarCambios(r3.plan))
    deps.log(textoVerificacion(verificacion))

    const resultado: ResultadoSync = {
      modo: 'escritura',
      cambiosPlanificados,
      limpiezaEjecutada: limpiar,
      carga,
      recodificacion: { cambios: recod.cambios.length, colisiones: recod.colisiones, sin_regla: recod.sin_regla },
      verificacion,
    }
    if (!verificacion.ok) {
      // Un cierre que no da no se registra como corrida exitosa: la proxima corrida vuelve a limpiar.
      deps.log('FALLA: la verificacion no cerro; la corrida NO se registra como exitosa. Volver al respaldo previo.')
      return resultado
    }
    await base.transaccion((repo) => repo.registrarCorrida('escritura', sha, resultado))
    return resultado
  } finally {
    await base.cerrar()
  }
}

async function abrirBasePrisma(url: string): Promise<BaseAbierta> {
  // Imports dinámicos: la simulación con fixture no necesita el cliente de Prisma ni la base.
  const { PrismaClient } = await import('@prisma/client')
  const { cargarSnapshot } = await import('./sistemaReadonly.js')
  const { crearRepoEscritura } = await import('./repoPrisma.js')
  const prisma = new PrismaClient({ datasourceUrl: url })
  return {
    leerSnapshot: () => cargarSnapshot(prisma as unknown as Parameters<typeof cargarSnapshot>[0]),
    transaccion: (fn) =>
      prisma.$transaction(async (tx) => fn(crearRepoEscritura(tx as unknown as Parameters<typeof crearRepoEscritura>[0], url)), {
        timeout: 30 * 60 * 1000,
        maxWait: 15_000,
      }),
    cerrar: () => prisma.$disconnect(),
  }
}

export const depsReales: DepsSync = {
  abrirBase: abrirBasePrisma,
  leerFilas: leerNominal,
  leerSnapshotJson: (ruta) => JSON.parse(fs.readFileSync(ruta, 'utf8')) as SnapshotSistema,
  // El hash lo calcula preprocesar_excel.py y viaja en meta.json junto al CSV.
  sha256: (ruta) => {
    const meta = path.join(path.dirname(ruta), 'meta.json')
    if (!fs.existsSync(meta)) return null
    return (JSON.parse(fs.readFileSync(meta, 'utf8')) as { sha256?: string }).sha256 ?? null
  },
  log: (m) => console.log(m),
}

// Solo corre como script (no al importarse desde los tests).
if (path.basename(process.argv[1] ?? '').startsWith('sincronizar')) {
  sincronizar(parseArgs(process.argv.slice(2)), { DATABASE_URL: process.env.DATABASE_URL }, depsReales)
    .then((r) => {
      if (r.modo === 'escritura' && r.verificacion && !r.verificacion.ok) process.exit(1)
    })
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    })
}
