import { createRequire } from 'node:module'
import { normalizarTexto } from '@srrhh/normalizacion'
import { prisma } from '../../../shared/prisma.js'
import { marcarSesionCompletada } from '../carga-semanal.service.js'
import {
  esFilaArea,
  inferirUniversoTotalizador,
  inferirRegimenEmpleoPorTipo,
  canonizarRegimenEmpleo,
  canonUniverso,
} from '../../organigrama/organigrama.service.js'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx') as {
  read: (data: Buffer, opts: Record<string, unknown>) => {
    SheetNames: string[]
    Sheets: Record<string, unknown>
  }
  utils: {
    sheet_to_json: (ws: unknown, opts: Record<string, unknown>) => Record<string, unknown>[]
  }
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FilaArbol {
  lvl: number
  tipo: string
  codRep: string
  descRep: string | null
  sigla: string
  padre: string | null
  path: string
  pathNombres: string
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function parsearFila(row: Record<string, unknown>, i: number): FilaArbol | null {
  const tipo   = str(row['TIPO'])
  const codRep = str(row['COD_REP'])
  const sigla  = str(row['SIGLA'])
  const path   = str(row['PATH'])
  const pathN  = str(row['PATH_NOMBRES'])

  if (!tipo || !codRep || !sigla || !path || !pathN) return null
  if (esFilaArea(tipo)) return null  // AREA = guardia/residencia, no se importa

  const lvlRaw = row['LVL']
  const lvl = Number(lvlRaw)
  if (!Number.isFinite(lvl)) {
    console.warn(`[arbol] fila ${i + 2}: lvl inválido (${lvlRaw}), se omite`)
    return null
  }

  const padre = str(row['PADRE'])
  return {
    lvl,
    tipo,
    codRep,
    descRep: normalizarTexto(str(row['DESC_REP']) ?? ''),
    sigla,
    padre: padre === 'ROOT' ? 'ROOT' : padre,
    path,
    pathNombres: pathN,
  }
}

// ─── Tipos de resumen ────────────────────────────────────────────────────────

export interface ResumenArbol {
  totalFilas: number
  organigramas: { nuevos: number; modificados: number; eliminados: number }
  dimEfectores: { actualizados: number }
}

// ─── Helpers compartidos ──────────────────────────────────────────────────────

const LOTE = 500

type DiffInput = {
  sesionId: string; tablaAfectada: string
  tipoDiff: 'nuevo' | 'modificado' | 'eliminado'
  clave: string; campo?: string
  valorAnterior?: string | null; valorNuevo?: string | null
}

async function parsearBuffer(buffer: Buffer): Promise<FilaArbol[]> {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  if (!wb.SheetNames.length) throw new Error('El archivo no tiene hojas')
  const ws = wb.Sheets[wb.SheetNames[0]!]
  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[]

  const filas = rawRows
    .map((row, i) => parsearFila(row, i))
    .filter((f): f is FilaArbol => f !== null)

  if (!filas.length) throw new Error('El archivo no tiene filas válidas')

  const vistos = new Set<string>()
  for (const f of filas) {
    if (vistos.has(f.codRep)) throw new Error(`COD_REP duplicado en el archivo: ${f.codRep}`)
    vistos.add(f.codRep)
  }
  return filas
}

async function completarUniversoYRegimen(filas: FilaArbol[]): Promise<void> {
  const historial = new Map<string, { regimenEmpleo: string | null; universoTotalizador: string | null }>()
  for (const r of await prisma.dimOrganigrama.findMany({
    select: { codigoReparticion: true, regimenEmpleo: true, universoTotalizador: true },
  })) {
    historial.set(r.codigoReparticion, { regimenEmpleo: r.regimenEmpleo, universoTotalizador: r.universoTotalizador })
  }

  const hospitalTipoPorSigla = new Map<string, string | null>()
  for (const h of await prisma.dimEfectores.findMany({ select: { sigla: true, tipo: true } })) {
    hospitalTipoPorSigla.set(h.sigla, h.tipo)
  }

  const regimenSetPorSUT = new Map<string, Set<string>>()
  const regimenSetPorSU  = new Map<string, Set<string>>()
  for (const r of await prisma.dimOrganigrama.findMany({
    select: { sigla: true, universoTotalizador: true, regimenEmpleo: true, tipo: true },
    where: { regimenEmpleo: { not: '' } },
  })) {
    const su  = `${r.sigla}|${canonUniverso(r.universoTotalizador)}`
    const sut = `${su}|${r.tipo?.trim().toLowerCase() ?? ''}`
    if (!regimenSetPorSU.has(su))   regimenSetPorSU.set(su, new Set())
    if (!regimenSetPorSUT.has(sut)) regimenSetPorSUT.set(sut, new Set())
    regimenSetPorSU.get(su)!.add(r.regimenEmpleo!)
    regimenSetPorSUT.get(sut)!.add(r.regimenEmpleo!)
  }
  const regimenPorSU  = new Map([...regimenSetPorSU.entries()].filter(([, s]) => s.size === 1).map(([k, s]) => [k, [...s][0]!]))
  const regimenPorSUT = new Map([...regimenSetPorSUT.entries()].filter(([, s]) => s.size === 1).map(([k, s]) => [k, [...s][0]!]))

  const pendientes: string[] = []
  for (const f of filas) {
    const hist = historial.get(f.codRep)
    if (!(f as any).universoTotalizador) {
      (f as any).universoTotalizador = hist?.universoTotalizador ?? inferirUniversoTotalizador(f.sigla, f.tipo, hospitalTipoPorSigla)
    }
    const univ = (f as any).universoTotalizador as string
    if (!(f as any).regimenEmpleo) {
      const inferido =
        regimenPorSUT.get(`${f.sigla}|${canonUniverso(univ)}|${f.tipo.trim().toLowerCase()}`) ??
        regimenPorSU.get(`${f.sigla}|${canonUniverso(univ)}`) ??
        inferirRegimenEmpleoPorTipo(f.tipo) ??
        hist?.regimenEmpleo ?? null
      if (inferido) {
        (f as any).regimenEmpleo = inferido
      } else {
        pendientes.push(f.codRep)
      }
    }
  }

  if (pendientes.length > 0) {
    throw new Error(
      `${pendientes.length} repartición(es) sin REGIMEN EMPLEO inferible: ${pendientes.slice(0, 10).join(', ')}` +
      (pendientes.length > 10 ? ` ... y ${pendientes.length - 10} más` : ''),
    )
  }

  for (const f of filas) {
    ;(f as any).regimenEmpleo = canonizarRegimenEmpleo(f.descRep, (f as any).regimenEmpleo ?? null)
  }
}

function calcularDiffs(sesionId: string, filas: FilaArbol[], mapaActual: Map<string, { descRep: string | null; padre: string | null }>): DiffInput[] {
  const diffs: DiffInput[] = []
  const codsEnArchivo = new Set(filas.map((f) => f.codRep))

  for (const f of filas) {
    const actual = mapaActual.get(f.codRep)
    if (!actual) {
      diffs.push({ sesionId, tablaAfectada: 'organigramas', tipoDiff: 'nuevo', clave: f.codRep })
    } else {
      if (actual.descRep !== f.descRep)
        diffs.push({ sesionId, tablaAfectada: 'organigramas', tipoDiff: 'modificado', clave: f.codRep, campo: 'desc_rep', valorAnterior: actual.descRep, valorNuevo: f.descRep })
      if (actual.padre !== f.padre)
        diffs.push({ sesionId, tablaAfectada: 'organigramas', tipoDiff: 'modificado', clave: f.codRep, campo: 'padre', valorAnterior: actual.padre, valorNuevo: f.padre })
    }
  }
  for (const cod of mapaActual.keys()) {
    if (!codsEnArchivo.has(cod))
      diffs.push({ sesionId, tablaAfectada: 'organigramas', tipoDiff: 'eliminado', clave: cod })
  }
  return diffs
}

// ─── FASE 1: parsear + calcular diff (sin escribir datos de negocio) ──────────

export async function parsearYDiffearArbol(
  sesionId: string,
  buffer: Buffer,
): Promise<ResumenArbol> {
  const filas = await parsearBuffer(buffer)
  await completarUniversoYRegimen(filas)

  const actuales = await prisma.dimOrganigrama.findMany({
    select: { codigoReparticion: true, descRep: true, padre: true },
  })
  const mapaActual = new Map(actuales.map((r) => [r.codigoReparticion, r]))

  const diffs = calcularDiffs(sesionId, filas, mapaActual)

  for (let i = 0; i < diffs.length; i += LOTE) {
    await prisma.dimCargaDiff.createMany({ data: diffs.slice(i, i + LOTE) })
  }
  await prisma.dimCargaArchivo.updateMany({ where: { sesionId }, data: { filas: filas.length } })

  const resumen: ResumenArbol = {
    totalFilas: filas.length,
    organigramas: {
      nuevos:      diffs.filter((d) => d.tipoDiff === 'nuevo').length,
      modificados: diffs.filter((d) => d.tipoDiff === 'modificado').length,
      eliminados:  diffs.filter((d) => d.tipoDiff === 'eliminado').length,
    },
    dimEfectores: { actualizados: 0 },
  }

  return resumen
}

// ─── FASE 2: aplicar cambios (escribe en BD, se llama al confirmar) ──────────

export async function aplicarCambiosArbol(
  sesionId: string,
  buffer: Buffer,
): Promise<void> {
  const filas = await parsearBuffer(buffer)
  await completarUniversoYRegimen(filas)

  // Leer diffs de fase 1 para saber qué siglas cambiaron desc_rep
  const diffsGuardados = await prisma.dimCargaDiff.findMany({
    where: { sesionId, tablaAfectada: 'organigramas', tipoDiff: 'modificado', campo: 'desc_rep' },
    select: { clave: true, valorNuevo: true },
  })
  const codsCambiados = new Set(diffsGuardados.map((d) => d.clave))

  const insertData = filas.map((f) => ({
    lvl:                 f.lvl,
    tipo:                f.tipo,
    codigoReparticion:   f.codRep,
    descRep:             f.descRep,
    sigla:               f.sigla,
    padre:               f.padre,
    path:                f.path,
    pathNombres:         f.pathNombres,
    universoTotalizador: (f as any).universoTotalizador ?? null,
    regimenEmpleo:       (f as any).regimenEmpleo ?? null,
  }))

  // Deduplicar por codigoReparticion por si el archivo tiene repetidos tras el filtro de AREA
  const insertDedup = [...new Map(insertData.map((r) => [r.codigoReparticion, r])).values()]

  await prisma.$executeRaw`TRUNCATE TABLE dim_organigrama`
  for (let i = 0; i < insertDedup.length; i += LOTE) {
    await prisma.dimOrganigrama.createMany({ data: insertDedup.slice(i, i + LOTE) })
  }

  // Sync dim_efectores para siglas cuyo desc_rep cambió
  const siglasPorActualizar = [...new Set(
    filas.filter((f) => codsCambiados.has(f.codRep)).map((f) => f.sigla),
  )]
  let efectoresActualizados = 0
  for (const sigla of siglasPorActualizar) {
    const nodo = filas.find((f) => f.sigla === sigla && f.lvl <= 3)
    if (!nodo) continue
    const result = await prisma.dimEfectores.updateMany({
      where: { sigla },
      data: { nombre: nodo.descRep },
    })
    efectoresActualizados += result.count
  }

  await marcarSesionCompletada(sesionId, {
    tipo: 'arbol',
    totalFilas: filas.length,
    organigramas: {
      nuevos:      diffsGuardados.length > 0 ? undefined : 0,
    },
    dimEfectores: { actualizados: efectoresActualizados },
  })
}
