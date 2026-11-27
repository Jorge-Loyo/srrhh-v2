import { createRequire } from 'node:module'
import { prisma } from '../../../shared/prisma.js'
import type { ResolucionesConfirmar } from '../carga-semanal.service.js'
import { normalizarTexto } from '@srrhh/utils'
import { clasificarGestionablesBulk } from './gestionables.js'

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
  gestionables: { bajas: number }
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

  // dim_actividad_hechos — detectar cuáles tienen actividad abierta y se van a cerrar
  const idsConFechaHasta = filas.filter((f) => f.cargoHasta).map((f) => f.idSialRol)
  const actividadesAbiertas = idsConFechaHasta.length > 0
    ? await prisma.dimActividadHechos.findMany({
        where: { idSialRol: { in: idsConFechaHasta }, fechaHasta: null },
        select: { idSialRol: true },
      })
    : []
  const idsConActividadAbierta = new Set(actividadesAbiertas.map((a) => a.idSialRol))

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

  // Generar diffs de dim_actividad_hechos para trazabilidad en el panel
  for (const f of filas) {
    if (f.cargoHasta && idsConActividadAbierta.has(f.idSialRol)) {
      diffs.push({
        sesionId, tablaAfectada: 'dim_actividad_hechos', tipoDiff: 'eliminado',
        clave: f.idSialRol, campo: 'fecha_hasta',
        valorAnterior: null, valorNuevo: f.cargoHasta.toISOString().slice(0, 10),
      })
    }
  }

  for (let i = 0; i < diffs.length; i += LOTE) {
    await prisma.dimCargaDiff.createMany({ data: diffs.slice(i, i + LOTE) })
  }
  await prisma.dimCargaArchivo.updateMany({ where: { sesionId }, data: { filas: filas.length } })

  const resumen: ResumenBajasSalud = {
    totalFilas: filas.length,
    dimPuestos: {
      nuevos:      diffs.filter((d) => d.tipoDiff === 'nuevo').length,
      modificados: new Set(diffs.filter((d) => d.tipoDiff === 'modificado').map((d) => d.clave)).size,
    },
    dimActividadHechos: { aCerrar },
    gestionables: {
      bajas: (await clasificarGestionablesBulk(
        filas
          .filter((f) => f.cargoHasta)
          .map((f) => ({ id: f.idSialRol, codigoRegistro: f.codReg, literalPuesto: f.litPuesto }))
      ).then((m) => [...m.values()].filter((v) => v != null).length)),
    },
  }

  return resumen
}

// ─── FASE 2: aplicar cambios ──────────────────────────────────────────────────

export async function aplicarCambiosBajasSalud(
  sesionId: string,
  buffer: Buffer,
  _resoluciones: ResolucionesConfirmar,
): Promise<void> {
  const { Prisma } = await import('@prisma/client')
  const filas = parsearBuffer(buffer)
  const fechaCorte = new Date()
  console.log(`[bajas-salud] iniciando aplicar sesión ${sesionId}, ${filas.length} filas`)

  // dim_puestos — bulk upsert SQL (1 query por lote)
  console.log(`[bajas-salud] upsert dim_puestos...`)
  // Deduplicar por id_sial_rol
  const porId = new Map<string, FilaBaja>()
  for (const f of filas) porId.set(f.idSialRol, f)
  const filasUnicas = [...porId.values()]
  for (let i = 0; i < filasUnicas.length; i += LOTE) {
    const lote = filasUnicas.slice(i, i + LOTE)
    const values = lote.map((f) => Prisma.sql`(${f.idSialRol}, ${f.cargoHasta}, ${f.motBaja}, ${f.docRespBaja}, ${fechaCorte})`)
    await prisma.$executeRaw`
      INSERT INTO dim_puestos (id_sial_rol, puesto_hasta, motivo_baja, doc_resp_baja, bajas_exist)
      VALUES ${Prisma.join(values)}
      ON CONFLICT (id_sial_rol) DO UPDATE SET
        puesto_hasta = EXCLUDED.puesto_hasta,
        motivo_baja  = EXCLUDED.motivo_baja,
        doc_resp_baja = EXCLUDED.doc_resp_baja,
        bajas_exist  = EXCLUDED.bajas_exist
    `
  }
  console.log(`[bajas-salud] dim_puestos OK`)

  // dim_personas — marcar inactivo en bulk
  const cuilsUnicos = [...new Set(filas.filter((f) => f.cuil).map((f) => f.cuil))]
  if (cuilsUnicos.length > 0) {
    for (let i = 0; i < cuilsUnicos.length; i += LOTE) {
      await prisma.dimPersonas.updateMany({
        where: { cuil: { in: cuilsUnicos.slice(i, i + LOTE) } },
        data: { activo: false },
      })
    }
  }
  console.log(`[bajas-salud] dim_personas OK`)

  // dim_actividad_hechos — cerrar en bulk por fecha de baja de cada puesto
  // Usamos SQL para hacer un UPDATE con JOIN en un solo round-trip por lote
  console.log(`[bajas-salud] cerrando actividad_hechos...`)
  const filasConBaja = filas.filter((f) => f.cargoHasta)
  for (let i = 0; i < filasConBaja.length; i += LOTE) {
    const lote = filasConBaja.slice(i, i + LOTE)
    const values = lote.map((f) => Prisma.sql`(${f.idSialRol}::text, ${f.cargoHasta}::timestamptz)`)
    await prisma.$executeRaw`
      UPDATE dim_actividad_hechos AS dah
      SET fecha_hasta = v.fecha_hasta
      FROM (VALUES ${Prisma.join(values)}) AS v(id_sial_rol, fecha_hasta)
      WHERE dah.id_sial_rol = v.id_sial_rol AND dah.fecha_hasta IS NULL
    `
  }
  console.log(`[bajas-salud] actividad_hechos OK`)

  // dim_cargos + incidencias para gestionables
  console.log(`[bajas-salud] gestionables...`)
  if (filasConBaja.length > 0) {
    const idsConBaja = filasConBaja.map((f) => f.idSialRol)

    // Resolver codigo_cargo via dim_actividad_hechos (el link id_sial_rol → dim_cargos)
    const actividades = await prisma.dimActividadHechos.findMany({
      where: { idSialRol: { in: idsConBaja }, codigoCargo: { not: null } },
      select: { idSialRol: true, codigoCargo: true },
    })
    const codigosCargo = [...new Set(actividades.map((a) => a.codigoCargo!))]
    if (codigosCargo.length > 0) {
      await prisma.dimCargos.updateMany({
        where: { codigoCargo: { in: codigosCargo } },
        data:  { estado: 'validacion_vacante', subEstado: 'vacante' },
      })
    }

    const clasificacion = await clasificarGestionablesBulk(
      filasConBaja.map((f) => ({ id: f.idSialRol, codigoRegistro: f.codReg, literalPuesto: f.litPuesto }))
    )

    const incidenciasNuevas: { tipo: 'baja_gestionable'; sesionId: string; idSialRol: string; codigoRegistro: string; efector: string; literalPuesto: string; especialidad: null; cuil: string | null }[] = []
    for (const f of filasConBaja) {
      if (!f.sigla) continue
      if (clasificacion.get(f.idSialRol) != null) {
        incidenciasNuevas.push({
          tipo:           'baja_gestionable',
          sesionId,
          idSialRol:      f.idSialRol,
          codigoRegistro: f.codReg ?? '',
          efector:        f.sigla,
          literalPuesto:  f.litPuesto ?? '',
          especialidad:   null,
          cuil:           f.cuil || null,
        })
      }
    }
    for (let i = 0; i < incidenciasNuevas.length; i += LOTE) {
      await prisma.dimIncidencia.createMany({ data: incidenciasNuevas.slice(i, i + LOTE), skipDuplicates: true })
    }
  }
  console.log(`[bajas-salud] gestionables OK`)

  // Snapshot
  console.log(`[bajas-salud] snapshot...`)
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
  console.log(`[bajas-salud] snapshot OK`)

  // (aplicar no cambia estado — lo hace despacharConfirmar)
}
