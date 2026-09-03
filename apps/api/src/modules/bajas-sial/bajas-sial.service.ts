import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { DiffQuery } from './bajas-sial.schema.js'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const XLSX = require('xlsx') as {
  read: (data: Buffer, opts: Record<string, unknown>) => { SheetNames: string[]; Sheets: Record<string, unknown> }
  utils: { sheet_to_json: (ws: unknown, opts: Record<string, unknown>) => Record<string, unknown>[] }
}

interface UploadedFile { buffer: Buffer; filename: string }

function parseFecha(v: unknown): Date | null {
  if (!v) return null
  const s = String(v).trim()
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])))
  return isNaN(d.getTime()) ? null : d
}

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim()
}

function parseExcel(buffer: Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { defval: '' })
}

interface DatosCargo {
  codRegistro: string | null
  hospital: string | null
  especialidad: string | null
  codReg: string | null
}

async function triangular(cuils: string[]): Promise<{
  enPersonas: Set<string>
  conOcupActiva: Set<string>
  datosCargo: Map<string, DatosCargo>
}> {
  if (cuils.length === 0) return { enPersonas: new Set(), conOcupActiva: new Set(), datosCargo: new Map() }

  const [personas, ocupaciones] = await Promise.all([
    prisma.persona.findMany({
      where: { cuil: { in: cuils } },
      select: { cuil: true },
    }),
    prisma.ocupacion.findMany({
      where: { hasta: null, persona: { cuil: { in: cuils } } },
      select: {
        persona: { select: { cuil: true } },
        cargo: {
          select: {
            codigo: true,
            especialidadLegacy: true,
            hospital: { select: { sigla: true } },
            codigoRegistro: { select: { codigo: true } },
          },
        },
      },
    }),
  ])

  const datosCargo = new Map<string, DatosCargo>()
  for (const o of ocupaciones) {
    const cuil = o.persona.cuil
    if (!datosCargo.has(cuil)) {
      datosCargo.set(cuil, {
        codRegistro:  o.cargo.codigo ?? null,
        hospital:     o.cargo.hospital?.sigla ?? null,
        especialidad: o.cargo.especialidadLegacy ?? null,
        codReg:       o.cargo.codigoRegistro?.codigo ?? null,
      })
    }
  }

  return {
    enPersonas:    new Set(personas.map((p) => p.cuil)),
    conOcupActiva: new Set(ocupaciones.map((o) => o.persona.cuil)),
    datosCargo,
  }
}

function cuilPuro(cuil: string): string {
  return cuil.replace(/-/g, '').slice(0, 11)
}

// Nombres históricos del escalafón CPH — mismo set que normalizador_cargos.py
const NOMBRES_CPH_VIEJOS = new Set([
  'MEDICOS', 'MÉDICOS', 'CPH',
  'CARRERA PROFESIONAL HOSPITALARIA',
  'NUEVA CARRERA PROF. HOSP',
  'NUEVA CARRERA PROF HOSP',
])
const NOMBRE_CPH_CANONICO = 'Nueva Carrera Profesional Hospitalaria'

function normalizarEscalafon(v: string | null): string | null {
  if (!v) return v
  return NOMBRES_CPH_VIEJOS.has(v.trim().toUpperCase()) ? NOMBRE_CPH_CANONICO : v
}

function normalizarLitCodReg(v: string | null): string | null {
  if (!v) return v
  const limpio = v.replace(/\|/g, '').trim()
  return NOMBRES_CPH_VIEJOS.has(limpio.toUpperCase()) ? NOMBRE_CPH_CANONICO : limpio || null
}

export async function uploadBajasSialService(
  file: UploadedFile,
  fechaArchivo: string,
  usuarioId: string,
) {
  const rows = parseExcel(file.buffer)
  if (rows.length === 0) throw AppError.badRequest('El archivo está vacío')

  const COLS_REQ = ['CARGO', 'CUIL', 'AYN', 'MOT_BAJA']
  const faltantes = COLS_REQ.filter((c) => !(c in rows[0]))
  if (faltantes.length > 0) throw AppError.badRequest(`Columnas faltantes: ${faltantes.join(', ')}`)

  const snapshot = await prisma.$queryRawUnsafe<{ id: string }[]>(`
    INSERT INTO baja_sial_snapshots (id, filename, fecha_archivo, total_registros, estado, procesado_por, created_at)
    VALUES ($1::uuid, $2, $3, $4, 'procesando', $5::uuid, now())
    RETURNING id
  `, randomUUID(), file.filename, new Date(fechaArchivo), rows.length, usuarioId)

  const snapshotId = snapshot[0].id

  void procesarSnapshot(snapshotId, rows, fechaArchivo).catch(async (err) => {
    await prisma.$executeRawUnsafe(
      `UPDATE baja_sial_snapshots SET estado = 'error', error_msg = $1 WHERE id = $2::uuid`,
      String(err?.message ?? err), snapshotId
    )
  })

  return { snapshotId, totalRegistros: rows.length }
}

async function procesarSnapshot(
  snapshotId: string,
  rows: Record<string, unknown>[],
  fechaArchivo: string,
) {
  const registros = rows.map((r) => ({
    id:            randomUUID(),
    snapshot_id:   snapshotId,
    cargo:         str(r.CARGO),
    cuil:          str(r.CUIL),
    ayn:           str(r.AYN),
    num_doc:       str(r.NUM_DOC) || null,
    sexo:          str(r.SEXO) || null,
    fec_nacim:     parseFecha(r.FEC_NACIM),
    edad:          r.EDAD ? Number(r.EDAD) || null : null,
    cod_rep:       str(r.COD_REP) || null,
    desc_rep:      str(r.DESC_REP) || null,
    escalafon:     normalizarEscalafon(str(r.ESCALAFON) || null),
    regimen:       str(r.REGIMEN) || null,
    sit_rev:       str(r.SIT_REV) || null,
    cod_reg:       str(r.COD_REG) || null,
    lit_cod_reg:   normalizarLitCodReg(str(r.LIT_COD_REG) || null),
    puesto:        str(r.PUESTO) || null,
    lit_puesto:    str(r.LIT_PUESTO) || null,
    cod_agrup:     str(r.COD_AGRUPAMIENTO) || null,
    lit_agrup:     str(r.LIT_AGRUPAMIENTO) || null,
    cargo_desde:   parseFecha(r.CARGO_DESDE),
    cargo_hasta:   parseFecha(r.CARGO_HASTA),
    doc_resp_alta: str(r.DOC_RESP_ALTA) || null,
    doc_resp_baja: str(r.DOC_RESP_BAJA) || null,
    mot_baja:      str(r.MOT_BAJA) || null,
    car_codigo:    str(r.CAR_CODIGO) || null,
    funcion:       str(r.FUNCION) || null,
  }))

  for (let i = 0; i < registros.length; i += 500) {
    const lote = registros.slice(i, i + 500)
    const placeholders = lote.map((_, j) => {
      const base = j * 27
      return `($${base+1}::uuid,$${base+2}::uuid,$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},$${base+12},$${base+13},$${base+14},$${base+15},$${base+16},$${base+17},$${base+18},$${base+19},$${base+20},$${base+21},$${base+22},$${base+23},$${base+24},$${base+25},$${base+26},$${base+27})`
    }).join(',')
    const values = lote.flatMap((r) => [
      r.id, r.snapshot_id, r.cargo, r.cuil, r.ayn, r.num_doc, r.sexo,
      r.fec_nacim, r.edad, r.cod_rep, r.desc_rep, r.escalafon, r.regimen,
      r.sit_rev, r.cod_reg, r.lit_cod_reg, r.puesto, r.lit_puesto,
      r.cod_agrup, r.lit_agrup, r.cargo_desde, r.cargo_hasta,
      r.doc_resp_alta, r.doc_resp_baja, r.mot_baja, r.car_codigo, r.funcion,
    ])
    await prisma.$executeRawUnsafe(
      `INSERT INTO baja_sial_registros (id,snapshot_id,cargo,cuil,ayn,num_doc,sexo,fec_nacim,edad,cod_rep,desc_rep,escalafon,regimen,sit_rev,cod_reg,lit_cod_reg,puesto,lit_puesto,cod_agrup,lit_agrup,cargo_desde,cargo_hasta,doc_resp_alta,doc_resp_baja,mot_baja,car_codigo,funcion) VALUES ${placeholders}`,
      ...values
    )
  }

  const anterior = await prisma.$queryRawUnsafe<{ id: string }[]>(`
    SELECT id FROM baja_sial_snapshots
    WHERE estado = 'aprobado' AND fecha_archivo < $1
    ORDER BY fecha_archivo DESC LIMIT 1
  `, new Date(fechaArchivo))

  const diffs: {
    id: string; snapshot_id: string; tipo: string; cargo: string; cuil: string
    ayn: string; escalafon: string | null; lit_puesto: string | null
    mot_baja: string | null; cargo_hasta: Date | null
    existe_en_personas: boolean; tiene_ocup_activa: boolean
    cod_registro: string | null; hospital: string | null
    especialidad: string | null; cod_reg: string | null
    campo: string | null; valor_anterior: string | null; valor_nuevo: string | null
  }[] = []

  const nuevoMap = new Map(registros.map((r) => [r.cargo, r]))

  if (anterior.length > 0) {
    const anteriorId = anterior[0].id
    const regAnteriores = await prisma.$queryRawUnsafe<{
      cargo: string; cuil: string; ayn: string; escalafon: string | null
      lit_puesto: string | null; mot_baja: string | null; cargo_hasta: Date | null
    }[]>(`SELECT cargo, cuil, ayn, escalafon, lit_puesto, mot_baja, cargo_hasta FROM baja_sial_registros WHERE snapshot_id = $1::uuid`, anteriorId)

    const anteriorMap = new Map(regAnteriores.map((r) => [r.cargo, r]))
    const nuevoKeys = new Set(nuevoMap.keys())
    const anteriorKeys = new Set(anteriorMap.keys())

    for (const [cargo, r] of nuevoMap) {
      if (!anteriorKeys.has(cargo)) {
        diffs.push({ id: randomUUID(), snapshot_id: snapshotId, tipo: 'nuevo', cargo, cuil: r.cuil, ayn: r.ayn, escalafon: r.escalafon, lit_puesto: r.lit_puesto, mot_baja: r.mot_baja, cargo_hasta: r.cargo_hasta, existe_en_personas: false, tiene_ocup_activa: false, cod_registro: null, hospital: null, especialidad: null, cod_reg: null, campo: null, valor_anterior: null, valor_nuevo: null })
      }
    }
    for (const [cargo, r] of anteriorMap) {
      if (!nuevoKeys.has(cargo)) {
        diffs.push({ id: randomUUID(), snapshot_id: snapshotId, tipo: 'eliminado', cargo, cuil: r.cuil, ayn: r.ayn, escalafon: r.escalafon, lit_puesto: r.lit_puesto, mot_baja: r.mot_baja, cargo_hasta: r.cargo_hasta, existe_en_personas: false, tiene_ocup_activa: false, cod_registro: null, hospital: null, especialidad: null, cod_reg: null, campo: null, valor_anterior: null, valor_nuevo: null })
      }
    }
    for (const [cargo, rNuevo] of nuevoMap) {
      const rAnt = anteriorMap.get(cargo)
      if (!rAnt) continue
      const camposWatch: [string, unknown, unknown][] = [
        ['mot_baja', rAnt.mot_baja, rNuevo.mot_baja],
        ['cargo_hasta', rAnt.cargo_hasta?.toISOString().slice(0,10), rNuevo.cargo_hasta?.toISOString().slice(0,10)],
        ['escalafon', rAnt.escalafon, rNuevo.escalafon],
        ['lit_puesto', rAnt.lit_puesto, rNuevo.lit_puesto],
      ]
      for (const [campo, vAnt, vNuevo] of camposWatch) {
        if (str(vAnt) !== str(vNuevo)) {
          diffs.push({ id: randomUUID(), snapshot_id: snapshotId, tipo: 'modificado', cargo, cuil: rNuevo.cuil, ayn: rNuevo.ayn, escalafon: rNuevo.escalafon, lit_puesto: rNuevo.lit_puesto, mot_baja: rNuevo.mot_baja, cargo_hasta: rNuevo.cargo_hasta, existe_en_personas: false, tiene_ocup_activa: false, cod_registro: null, hospital: null, especialidad: null, cod_reg: null, campo, valor_anterior: str(vAnt) || null, valor_nuevo: str(vNuevo) || null })
        }
      }
    }
  } else {
    for (const [cargo, r] of nuevoMap) {
      diffs.push({ id: randomUUID(), snapshot_id: snapshotId, tipo: 'nuevo', cargo, cuil: r.cuil, ayn: r.ayn, escalafon: r.escalafon, lit_puesto: r.lit_puesto, mot_baja: r.mot_baja, cargo_hasta: r.cargo_hasta, existe_en_personas: false, tiene_ocup_activa: false, cod_registro: null, hospital: null, especialidad: null, cod_reg: null, campo: null, valor_anterior: null, valor_nuevo: null })
    }
  }

  const cuils = [...new Set(diffs.map((d) => cuilPuro(d.cuil)).filter(Boolean))]
  const { enPersonas, conOcupActiva, datosCargo } = await triangular(cuils)
  for (const d of diffs) {
    const c = cuilPuro(d.cuil)
    d.existe_en_personas = enPersonas.has(c)
    d.tiene_ocup_activa  = conOcupActiva.has(c)
    if (d.tiene_ocup_activa) {
      const dc = datosCargo.get(c)
      if (dc) {
        d.cod_registro = dc.codRegistro
        d.hospital     = dc.hospital
        d.especialidad = dc.especialidad
        d.cod_reg      = dc.codReg
      }
    }
  }

  for (let i = 0; i < diffs.length; i += 500) {
    const lote = diffs.slice(i, i + 500)
    const ph = lote.map((_, j) => {
      const b = j * 19
      return `($${b+1}::uuid,$${b+2}::uuid,$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16},$${b+17},$${b+18},$${b+19})`
    }).join(',')
    const vals = lote.flatMap((d) => [
      d.id, d.snapshot_id, d.tipo, d.cargo, d.cuil, d.ayn, d.escalafon,
      d.lit_puesto, d.mot_baja, d.cargo_hasta, d.existe_en_personas,
      d.tiene_ocup_activa, d.cod_registro, d.hospital, d.especialidad, d.cod_reg,
      d.campo, d.valor_anterior, d.valor_nuevo,
    ])
    await prisma.$executeRawUnsafe(
      `INSERT INTO baja_sial_diffs (id,snapshot_id,tipo,cargo,cuil,ayn,escalafon,lit_puesto,mot_baja,cargo_hasta,existe_en_personas,tiene_ocup_activa,cod_registro,hospital,especialidad,cod_reg,campo,valor_anterior,valor_nuevo) VALUES ${ph}`,
      ...vals
    )
  }

  const nuevas      = diffs.filter((d) => d.tipo === 'nuevo').length
  const salidas     = diffs.filter((d) => d.tipo === 'eliminado').length
  const modificadas = new Set(diffs.filter((d) => d.tipo === 'modificado').map((d) => d.cargo)).size

  await prisma.$executeRawUnsafe(
    `UPDATE baja_sial_snapshots SET estado = 'pendiente', nuevas = $1, salidas = $2, modificadas = $3 WHERE id = $4::uuid`,
    nuevas, salidas, modificadas, snapshotId
  )
}

export async function listBajasSialSnapshotsService() {
  return prisma.$queryRawUnsafe<{
    id: string; filename: string; fecha_archivo: Date; total_registros: number
    nuevas: number; salidas: number; modificadas: number; estado: string
    error_msg: string | null; created_at: Date; aprobado_at: Date | null
  }[]>(`
    SELECT id, filename, fecha_archivo, total_registros, nuevas, salidas, modificadas,
           estado, error_msg, created_at, aprobado_at
    FROM baja_sial_snapshots
    ORDER BY fecha_archivo DESC
  `)
}

export async function getBajasSialEstadoService(id: string) {
  const rows = await prisma.$queryRawUnsafe<{
    id: string; estado: string; error_msg: string | null
    total_registros: number; nuevas: number; salidas: number; modificadas: number
  }[]>(`SELECT id, estado, error_msg, total_registros, nuevas, salidas, modificadas FROM baja_sial_snapshots WHERE id = $1::uuid`, id)
  if (!rows.length) throw AppError.notFound('Snapshot no encontrado')
  return rows[0]
}

export async function getBajasSialDiffService(id: string, query: DiffQuery) {
  const snapRows = await prisma.$queryRawUnsafe<{
    id: string; filename: string; fecha_archivo: Date; total_registros: number
    nuevas: number; salidas: number; modificadas: number; estado: string
  }[]>(`SELECT id, filename, fecha_archivo, total_registros, nuevas, salidas, modificadas, estado FROM baja_sial_snapshots WHERE id = $1::uuid`, id)
  if (!snapRows.length) throw AppError.notFound('Snapshot no encontrado')
  const snapshot = snapRows[0]

  const tipoFilter = query.tipo ? `AND tipo = '${query.tipo}'` : ''
  const offset = (query.page - 1) * query.limit

  const [countRows, diffs] = await Promise.all([
    prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) as count FROM baja_sial_diffs WHERE snapshot_id = $1::uuid ${tipoFilter}`, id
    ),
    prisma.$queryRawUnsafe<{
      id: string; tipo: string; cargo: string; cuil: string; ayn: string
      escalafon: string | null; lit_puesto: string | null; mot_baja: string | null
      cargo_hasta: Date | null; existe_en_personas: boolean; tiene_ocup_activa: boolean
      cod_registro: string | null; hospital: string | null
      especialidad: string | null; cod_reg: string | null
      campo: string | null; valor_anterior: string | null; valor_nuevo: string | null
    }[]>(
      `SELECT id, tipo, cargo, cuil, ayn, escalafon, lit_puesto, mot_baja, cargo_hasta,
              existe_en_personas, tiene_ocup_activa, cod_registro, hospital, especialidad, cod_reg,
              campo, valor_anterior, valor_nuevo
       FROM baja_sial_diffs WHERE snapshot_id = $1::uuid ${tipoFilter}
       ORDER BY tipo, ayn LIMIT $2 OFFSET $3`,
      id, query.limit, offset
    ),
  ])

  const total = Number(countRows[0].count)
  return {
    snapshot,
    summary: { nuevas: snapshot.nuevas, salidas: snapshot.salidas, modificadas: snapshot.modificadas },
    diffs: {
      data: diffs,
      meta: { total, page: query.page, limit: query.limit, pages: Math.ceil(total / query.limit) },
    },
  }
}

export async function aprobarBajasSialService(id: string, usuarioId: string) {
  const rows = await prisma.$queryRawUnsafe<{ estado: string }[]>(
    `SELECT estado FROM baja_sial_snapshots WHERE id = $1::uuid`, id
  )
  if (!rows.length) throw AppError.notFound('Snapshot no encontrado')
  if (rows[0].estado !== 'pendiente') throw AppError.conflict(`El snapshot ya está ${rows[0].estado}`)

  await prisma.$executeRawUnsafe(
    `UPDATE baja_sial_snapshots SET estado = 'aprobado', aprobado_por = $1::uuid, aprobado_at = now() WHERE id = $2::uuid`,
    usuarioId, id
  )
  return { ok: true, snapshotId: id }
}

export async function rechazarBajasSialService(id: string) {
  const rows = await prisma.$queryRawUnsafe<{ estado: string }[]>(
    `SELECT estado FROM baja_sial_snapshots WHERE id = $1::uuid`, id
  )
  if (!rows.length) throw AppError.notFound('Snapshot no encontrado')
  if (rows[0].estado !== 'pendiente') throw AppError.conflict(`El snapshot ya está ${rows[0].estado}`)

  await prisma.$executeRawUnsafe(
    `UPDATE baja_sial_snapshots SET estado = 'rechazado' WHERE id = $1::uuid`, id
  )
  return { ok: true, snapshotId: id }
}

export async function listBajasSialRegistrosService(query: {
  page: number; limit: number; search?: string; motivo?: string
}) {
  const { page, limit, search, motivo } = query
  const offset = (page - 1) * limit

  const conditions: string[] = [
    `r.snapshot_id = (SELECT id FROM baja_sial_snapshots WHERE estado = 'aprobado' ORDER BY fecha_archivo DESC LIMIT 1)`,
  ]
  const params: unknown[] = []
  let pi = 1

  if (search) {
    conditions.push(`(r.ayn ILIKE $${pi} OR r.cuil ILIKE $${pi} OR r.cargo ILIKE $${pi} OR r.car_codigo ILIKE $${pi})`)
    params.push(`%${search}%`)
    pi++
  }
  if (motivo) {
    conditions.push(`r.mot_baja = $${pi}`)
    params.push(motivo)
    pi++
  }

  const where = conditions.join(' AND ')

  const [countRows, rows] = await Promise.all([
    prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) as count FROM baja_sial_registros r WHERE ${where}`, ...params
    ),
    prisma.$queryRawUnsafe<{
      car_codigo: string | null; cargo: string; cuil: string; ayn: string
      lit_cod_reg: string | null; lit_puesto: string | null
      mot_baja: string | null; cargo_desde: Date | null; cargo_hasta: Date | null
      doc_resp_baja: string | null; desc_rep: string | null
      especialidad: string | null; sigla: string | null; codigo_cargo: string | null
    }[]>(
      `SELECT r.car_codigo, r.cargo, r.cuil, r.ayn, r.lit_cod_reg, r.lit_puesto,
              r.mot_baja, r.cargo_desde, r.cargo_hasta, r.doc_resp_baja, r.desc_rep,
              c.especialidad_legacy as especialidad, h.sigla, c.codigo as codigo_cargo
       FROM baja_sial_registros r
       LEFT JOIN cargos c     ON c.id_sial = r.cargo
       LEFT JOIN hospitales h ON h.id = c.hospital_id
       WHERE ${where}
       ORDER BY r.ayn LIMIT $${pi} OFFSET $${pi+1}`,
      ...params, limit, offset
    ),
  ])

  return {
    data: rows,
    meta: { total: Number(countRows[0].count), page, limit, pages: Math.ceil(Number(countRows[0].count) / limit) },
  }
}
