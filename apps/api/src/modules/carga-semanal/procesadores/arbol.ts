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

// ─── Procesador principal ─────────────────────────────────────────────────────

const LOTE = 500

export async function procesarArbol(sesionId: string, buffer: Buffer, marcarCompletado = true): Promise<void> {
  // 1. Parsear Excel
  const wb = XLSX.read(buffer, { type: 'buffer' })
  if (!wb.SheetNames.length) throw new Error('El archivo no tiene hojas')
  const ws = wb.Sheets[wb.SheetNames[0]!]
  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[]

  const filas = rawRows
    .map((row, i) => parsearFila(row, i))
    .filter((f): f is FilaArbol => f !== null)

  if (!filas.length) throw new Error('El archivo no tiene filas válidas')

  // Verificar duplicados
  const vistos = new Set<string>()
  for (const f of filas) {
    if (vistos.has(f.codRep)) throw new Error(`COD_REP duplicado en el archivo: ${f.codRep}`)
    vistos.add(f.codRep)
  }

  // 2. Heredar universo_totalizador y regimen_empleo del historial
  //    (mismo mecanismo que reemplazarOrganigramaService)
  const historial = new Map<string, { regimenEmpleo: string | null; universoTotalizador: string | null }>()
  for (const r of await prisma.organigrama.findMany({
    select: { codigoReparticion: true, regimenEmpleo: true, universoTotalizador: true },
  })) {
    historial.set(r.codigoReparticion, { regimenEmpleo: r.regimenEmpleo, universoTotalizador: r.universoTotalizador })
  }

  const hospitalTipoPorSigla = new Map<string, string | null>()
  for (const h of await prisma.hospital.findMany({ select: { sigla: true, tipo: true } })) {
    hospitalTipoPorSigla.set(h.sigla, h.tipo)
  }

  // Mapa sigla|universo|tipo → régimen (para inferencia)
  const regimenSetPorSUT = new Map<string, Set<string>>()
  const regimenSetPorSU  = new Map<string, Set<string>>()
  for (const r of await prisma.organigrama.findMany({
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

  // Completar universo y régimen
  const pendientes: string[] = []
  for (const f of filas) {
    const hist = historial.get(f.codRep)
    if (!f['universoTotalizador' as keyof FilaArbol]) {
      (f as any).universoTotalizador = hist?.universoTotalizador ?? inferirUniversoTotalizador(f.sigla, f.tipo, hospitalTipoPorSigla)
    }
    const univ = (f as any).universoTotalizador as string
    if (!f['regimenEmpleo' as keyof FilaArbol]) {
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

  // Canonización final
  for (const f of filas) {
    ;(f as any).regimenEmpleo = canonizarRegimenEmpleo(f.descRep, (f as any).regimenEmpleo ?? null)
  }

  // 3. Cargar estado actual para calcular diffs
  const actuales = await prisma.organigrama.findMany({
    select: { codigoReparticion: true, descRep: true, tipo: true, padre: true },
  })
  const mapaActual = new Map(actuales.map((r) => [r.codigoReparticion, r]))

  type DiffInput = {
    sesionId: string; tablaAfectada: string
    tipoDiff: 'nuevo' | 'modificado' | 'eliminado'
    clave: string; campo?: string
    valorAnterior?: string | null; valorNuevo?: string | null
  }
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

  // 4. Swap atómico organigramas (mismo patrón que reemplazarOrganigramaService)
  const insertData = filas.map((f) => ({
    lvl:                  f.lvl,
    tipo:                 f.tipo,
    codigoReparticion:    f.codRep,
    descRep:              f.descRep,
    sigla:                f.sigla,
    padre:                f.padre,
    path:                 f.path,
    pathNombres:          f.pathNombres,
    universoTotalizador:  (f as any).universoTotalizador ?? null,
    regimenEmpleo:        (f as any).regimenEmpleo ?? null,
  }))

  await prisma.$transaction(
    async (tx) => {
      await tx.organigrama.deleteMany()
      for (let i = 0; i < insertData.length; i += LOTE) {
        await tx.organigrama.createMany({ data: insertData.slice(i, i + LOTE) })
      }
    },
    { timeout: 120_000 },
  )

  // 5. Sync dim_efectores — actualizar nombre/descRep para siglas conocidas
  const siglasCambiadas = filas.filter((f) => {
    const actual = mapaActual.get(f.codRep)
    return actual && actual.descRep !== f.descRep
  })
  const siglasPorActualizar = [...new Set(siglasCambiadas.map((f) => f.sigla))]
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

  // 6. Insertar diffs
  for (let i = 0; i < diffs.length; i += LOTE) {
    await prisma.dimCargaDiff.createMany({ data: diffs.slice(i, i + LOTE) })
  }

  // 7. Actualizar conteo real de filas
  await prisma.dimCargaArchivo.updateMany({
    where: { sesionId },
    data: { filas: filas.length },
  })

  // 8. Informe
  if (marcarCompletado) {
    await marcarSesionCompletada(sesionId, {
      tipo: 'arbol',
      totalFilas: filas.length,
      organigramas: {
        nuevos:      diffs.filter((d) => d.tablaAfectada === 'organigramas' && d.tipoDiff === 'nuevo').length,
        modificados: diffs.filter((d) => d.tablaAfectada === 'organigramas' && d.tipoDiff === 'modificado').length,
        eliminados:  diffs.filter((d) => d.tablaAfectada === 'organigramas' && d.tipoDiff === 'eliminado').length,
      },
      dimEfectores: { actualizados: efectoresActualizados },
    })
  }

  return {
    tipo: 'arbol',
    totalFilas: filas.length,
    organigramas: {
      nuevos:      diffs.filter((d) => d.tablaAfectada === 'organigramas' && d.tipoDiff === 'nuevo').length,
      modificados: diffs.filter((d) => d.tablaAfectada === 'organigramas' && d.tipoDiff === 'modificado').length,
      eliminados:  diffs.filter((d) => d.tablaAfectada === 'organigramas' && d.tipoDiff === 'eliminado').length,
    },
    dimEfectores: { actualizados: efectoresActualizados },
  } as any
}
