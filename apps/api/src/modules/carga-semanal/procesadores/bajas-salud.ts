import { createRequire } from 'node:module'
import { prisma } from '../../../shared/prisma.js'
import { marcarSesionCompletada, marcarSesionPendiente } from '../carga-semanal.service.js'
import type { ResolucionesConfirmar } from '../carga-semanal.service.js'
import { normalizarTexto } from '@srrhh/utils'

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

interface FilaBaja {
  idSialRol: string
  cuil: string
  apellidoNombre: string
  fecNacim: Date | null
  sexo: string | null
  codRep: string | null
  descRep: string | null
  sigla: string | null
  codReg: string | null
  litCodReg: string | null
  puesto: string | null
  litPuesto: string | null
  sitRev: string | null
  cargoDesde: Date | null
  cargoHasta: Date | null
  docRespAlta: string | null
  docRespBaja: string | null
  motBaja: string | null
}

export interface ResumenBajasSalud {
  totalFilas: number
  dimPuestos: { nuevos: number; modificados: number }
  dimActividadHechos: { aCerrar: number }
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseFecha(v: unknown): Date | null {
  if (!v) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  const s = String(v).trim()
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function norm(v: unknown): string | null {
  return normalizarTexto(str(v))
}

function normalizarCuil(v: unknown): string {
  return String(v ?? '').replace(/-/g, '').trim()
}

function parsearFila(row: Record<string, unknown>): FilaBaja {
  return {
    idSialRol:      String(row['CARGO'] ?? '').trim(),
    cuil:           normalizarCuil(row['CUIL']),
    apellidoNombre: str(row['AYN']) ?? '',
    fecNacim:       parseFecha(row['FEC_NACIM']),
    sexo:           str(row['SEXO']),
    codRep:         str(row['COD_REP']),
    descRep:        str(row['DESC_REP']),
    sigla:          str(row['SIGLA']),
    codReg:         str(row['COD_REG']),
    litCodReg:      str(row['LIT_COD_REG']),
    puesto:         str(row['PUESTO']),
    litPuesto:      norm(row['LIT_PUESTO']),
    sitRev:         norm(row['SIT_REV']),
    cargoDesde:     parseFecha(row['CARGO_DESDE']),
    cargoHasta:     parseFecha(row['CARGO_HASTA']),
    docRespAlta:    str(row['DOC_RESP_ALTA']),
    docRespBaja:    str(row['DOC_RESP_BAJA']),
    motBaja:        norm(row['MOT_BAJA']),
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type DiffInput = {
  sesionId: string
  tablaAfectada: string
  tipoDiff: 'nuevo' | 'modificado' | 'eliminado'
  clave: string
  campo?: string
  valorAnterior?: string | null
  valorNuevo?: string | null
}

const LOTE = 500

function parsearBuffer(buffer: Buffer): FilaBaja[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  if (!wb.SheetNames.length) throw new Error('El archivo no tiene hojas')
  const ws = wb.Sheets[wb.SheetNames[0]!]
  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[]
  if (!rawRows.length) throw new Error('El archivo no tiene filas de datos')
  return rawRows.map(parsearFila).filter((f) => f.idSialRol.length > 0)
}

// ─── FASE 1: parsear + calcular diff ─────────────────────────────────────────

export async function parsearYDiffearBajasSalud(
  sesionId: string,
  buffer: Buffer,
): Promise<ResumenBajasSalud> {
  const filas = parsearBuffer(buffer)

  const idsArchivo = filas.map((f) => f.idSialRol)
  const puestosActuales = await prisma.dimPuestos.findMany({
    where: { idSialRol: { in: idsArchivo } },
    select: { idSialRol: true, puestoHasta: true, motivoBaja: true },
  })
  const mapaActual = new Map(puestosActuales.map((p) => [p.idSialRol, p]))

  const diffs: DiffInput[] = []
  let aCerrar = 0

  for (const f of filas) {
    const actual = mapaActual.get(f.idSialRol)
    if (!actual) {
      diffs.push({ sesionId, tablaAfectada: 'dim_puestos', tipoDiff: 'nuevo', clave: f.idSialRol })
    } else {
      const anteriorHasta = actual.puestoHasta?.toISOString().slice(0, 10) ?? null
      const nuevoHasta    = f.cargoHasta?.toISOString().slice(0, 10) ?? null
      if (anteriorHasta !== nuevoHasta) {
        diffs.push({
          sesionId, tablaAfectada: 'dim_puestos', tipoDiff: 'modificado',
          clave: f.idSialRol, campo: 'puesto_hasta',
          valorAnterior: anteriorHasta, valorNuevo: nuevoHasta,
        })
      }
      if ((actual.motivoBaja ?? null) !== (f.motBaja ?? null)) {
        diffs.push({
          sesionId, tablaAfectada: 'dim_puestos', tipoDiff: 'modificado',
          clave: f.idSialRol, campo: 'motivo_baja',
          valorAnterior: actual.motivoBaja, valorNuevo: f.motBaja,
        })
      }
    }
    if (f.cargoHasta) aCerrar++
  }

  await Promise.all([
    (async () => {
      for (let i = 0; i < diffs.length; i += LOTE) {
        await prisma.dimCargaDiff.createMany({ data: diffs.slice(i, i + LOTE) })
      }
    })(),
    prisma.dimCargaArchivo.updateMany({ where: { sesionId }, data: { filas: filas.length } }),
  ])

  const resumen: ResumenBajasSalud = {
    totalFilas: filas.length,
    dimPuestos: {
      nuevos:      diffs.filter((d) => d.tipoDiff === 'nuevo').length,
      modificados: new Set(diffs.filter((d) => d.tipoDiff === 'modificado').map((d) => d.clave)).size,
    },
    dimActividadHechos: { aCerrar },
  }

  await marcarSesionPendiente(sesionId, { tipo: 'bajas_salud', ...resumen })
  return resumen
}

// ─── FASE 2: aplicar cambios ──────────────────────────────────────────────────

export async function aplicarCambiosBajasSalud(
  sesionId: string,
  buffer: Buffer,
  _resoluciones: ResolucionesConfirmar,
): Promise<void> {
  // Bajas no tienen resoluciones por fila — se aplican todas
  const filas = parsearBuffer(buffer)
  const fechaCorte = new Date()

  await prisma.$transaction(
    async (tx) => {
      // dim_puestos — campos de baja
      for (let i = 0; i < filas.length; i += LOTE) {
        for (const f of filas.slice(i, i + LOTE)) {
          await tx.dimPuestos.upsert({
            where: { idSialRol: f.idSialRol },
            create: {
              idSialRol:   f.idSialRol,
              puestoHasta: f.cargoHasta,
              motivoBaja:  f.motBaja,
              docRespBaja: f.docRespBaja,
              bajasExist:  fechaCorte,
            },
            update: {
              puestoHasta: f.cargoHasta,
              motivoBaja:  f.motBaja,
              docRespBaja: f.docRespBaja,
              bajasExist:  fechaCorte,
            },
          })
        }
      }

      // dim_personas — marcar inactivo
      const cuilsUnicos = [...new Set(filas.filter((f) => f.cuil).map((f) => f.cuil))]
      for (let i = 0; i < cuilsUnicos.length; i += LOTE) {
        for (const cuil of cuilsUnicos.slice(i, i + LOTE)) {
          const f = filas.find((x) => x.cuil === cuil)!
          await tx.dimPersonas.upsert({
            where: { cuil },
            create: {
              cuil,
              apellidoNombre:  f.apellidoNombre,
              fechaNacimiento: f.fecNacim,
              sexo:            f.sexo,
              activo:          false,
            },
            update: {
              apellidoNombre:  f.apellidoNombre,
              fechaNacimiento: f.fecNacim,
              sexo:            f.sexo,
              activo:          false,
            },
          })
        }
      }
    },
    { timeout: 180_000 },
  )

  // Cerrar dim_actividad_hechos con la fecha de baja real de cada puesto
  let actividadCerrada = 0
  for (let i = 0; i < filas.length; i += LOTE) {
    for (const f of filas.slice(i, i + LOTE)) {
      if (!f.cargoHasta) continue
      const result = await prisma.dimActividadHechos.updateMany({
        where: { idSialRol: f.idSialRol, fechaHasta: null },
        data:  { fechaHasta: f.cargoHasta },
      })
      actividadCerrada += result.count
    }
  }

  // Snapshot
  const snapshotData = filas.map((f) => ({
    sesionId, fechaCorte,
    idSialRol:        f.idSialRol,
    cuil:             f.cuil || null,
    apellidoNombre:   f.apellidoNombre || null,
    codigoRegistro:   f.codReg,
    litCodReg:        f.litCodReg,
    codRep:           f.codRep,
    descRep:          f.descRep,
    literalPuesto:    f.litPuesto,
    especialidad:     null,
    situacionRevista: f.sitRev,
    jcat:             null,
    cargoDesde:       f.cargoDesde,
    cargoHasta:       f.cargoHasta,
  }))
  for (let i = 0; i < snapshotData.length; i += LOTE) {
    await prisma.dimCargaPadronSnapshot.createMany({ data: snapshotData.slice(i, i + LOTE) })
  }

  await marcarSesionCompletada(sesionId, {
    tipo: 'bajas_salud',
    fechaCorte: fechaCorte.toISOString(),
    totalFilas: filas.length,
    dimActividadHechos: { cerrados: actividadCerrada },
    snapshot: { filas: snapshotData.length },
  })
}
