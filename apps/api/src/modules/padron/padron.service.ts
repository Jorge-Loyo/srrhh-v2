import FormData from 'form-data'
import axios from 'axios'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { env } from '../../config/env.js'
import type { MultipartFile } from '@fastify/multipart'
import type { DiffQuery } from './padron.schema.js'

type PrismaTx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

const python = axios.create({ baseURL: env.PYTHON_SERVICE_URL, timeout: 300_000 })

// ─── helpers ─────────────────────────────────────────────────────────────────

async function pollJob(jobId: string, maxWaitMs = 240_000): Promise<unknown> {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const { data } = await python.get(`/job/${jobId}`)
    if (data.status === 'done') return data.result
    if (data.status === 'error') throw new Error(`Job Python falló: ${data.error}`)
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error('Timeout esperando job Python')
}

async function getSnapshotOrThrow(id: string) {
  const snapshot = await prisma.padronSnapshot.findUnique({ where: { id } })
  if (!snapshot) throw AppError.notFound('Snapshot no encontrado')
  return snapshot
}

// ─── S2-19: diff calculado por Node contra Postgres ─────────────────────────
// Columnas del resultado de Dotaneitor que se comparan campo a campo.
// Clave: nombre en el DataFrame Python (snake_case del COL_MAP). Valor: campo
// en Cargo u Ocupacion para saber dónde vive ese dato en el modelo relacional.
const COLS_WATCH: Record<string, 'cargo' | 'ocupacion'> = {
  literal_puesto:        'cargo',
  especialidad:          'cargo',
  agrupador:             'cargo',
  unificador_de_puestos: 'cargo',
  situacion_de_revista:  'ocupacion',
  estado:                'ocupacion',
}

type RegistroPython = Record<string, unknown>

async function fetchAllPreview(sessionId: string): Promise<RegistroPython[]> {
  const limit = 500
  let page = 1
  const all: RegistroPython[] = []
  while (true) {
    const { data } = await python.get<{ rows: RegistroPython[]; total: number }>(
      '/preview', { params: { session_id: sessionId, page, limit } }
    )
    all.push(...data.rows)
    if (all.length >= data.total) break
    page++
  }
  return all
}

function strVal(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

async function calcularDiff(sessionId: string) {
  const registros = await fetchAllPreview(sessionId)

  // Mapa id_sial -> registro Python
  const nuevosMap = new Map<string, RegistroPython>()
  for (const r of registros) {
    const idSial = strVal(r['ID SIAL'] ?? r['id_sial'])
    if (idSial) nuevosMap.set(idSial, r)
  }

  // Estado actual en Postgres: Cargo + Ocupacion activa (hasta IS NULL)
  const cargosActuales = await prisma.cargo.findMany({
    where: { estado: 'vigente' },
    select: {
      idSial: true,
      literalPuesto: true,
      especialidad: true,
      agrupador: true,
      unificadorPuesto: true,
      ocupaciones: {
        where: { hasta: null },
        select: { idSialRol: true, situacionRevista: true, estadoPersona: true, cuilYRol: true },
        take: 1,
      },
    },
  })

  const actualesMap = new Map<string, typeof cargosActuales[number]>()
  for (const c of cargosActuales) actualesMap.set(c.idSial, c)

  const nuevosIds   = new Set(nuevosMap.keys())
  const actualesIds = new Set(actualesMap.keys())

  type DiffEntry = {
    snapshotId: string
    tipo: 'nuevo' | 'modificado' | 'eliminado'
    idSialRol: string
    campo: string | null
    valorAnterior: string | null
    valorNuevo: string | null
  }

  const diffs: Omit<DiffEntry, 'snapshotId'>[] = []

  // Nuevos
  for (const idSial of nuevosIds) {
    if (actualesIds.has(idSial)) continue
    const r = nuevosMap.get(idSial)!
    const cuilYRol = strVal(r['CUIL Y ROL'] ?? r['cuil_y_rol'])
    const idSialRol = cuilYRol ? `${idSial}-${cuilYRol}` : idSial
    diffs.push({
      tipo: 'nuevo',
      idSialRol,
      campo: null,
      valorAnterior: null,
      valorNuevo: JSON.stringify({
        id_sial:        idSial,
        cuil_y_rol:     cuilYRol,
        ayn:            strVal(r['AYN'] ?? r['ayn']),
        siglas:         strVal(r['SIGLAS'] ?? r['siglas']),
        escalafon:      strVal(r['ESCALAFON'] ?? r['escalafon']),
        literal_puesto: strVal(r['LITERAL PUESTO'] ?? r['literal_puesto']),
        especialidad:   strVal(r['ESPECIALIDAD'] ?? r['especialidad']),
        tipo_hospital_sigla: strVal(r['TIPO DE HOSPITAL / SIGLA'] ?? r['tipo_hospital_sigla']),
        situacion_de_revista: strVal(r['SITUACION DE REVISTA'] ?? r['situacion_de_revista']),
        estado:         strVal(r['ESTADO'] ?? r['estado']),
        agrupador:      strVal(r['AGRUPADOR'] ?? r['agrupador']),
        unificador_de_puestos: strVal(r['UNIFICADOR DE PUESTOS'] ?? r['unificador_de_puestos']),
      }),
    })
  }

  // Eliminados
  for (const idSial of actualesIds) {
    if (nuevosIds.has(idSial)) continue
    const actual = actualesMap.get(idSial)!
    const ocup = actual.ocupaciones[0]
    const idSialRol = ocup?.idSialRol ?? idSial
    diffs.push({
      tipo: 'eliminado',
      idSialRol,
      campo: null,
      valorAnterior: JSON.stringify({
        id_sial:        idSial,
        cuil_y_rol:     ocup?.cuilYRol ?? null,
        literal_puesto: actual.literalPuesto,
        especialidad:   actual.especialidad,
        agrupador:      actual.agrupador,
        situacion_de_revista: ocup?.situacionRevista ?? null,
        estado:         ocup?.estadoPersona ?? null,
      }),
      valorNuevo: null,
    })
  }

  // Modificados
  const CAMPO_CARGO_MAP: Record<string, keyof typeof cargosActuales[number]> = {
    literal_puesto:        'literalPuesto',
    especialidad:          'especialidad',
    agrupador:             'agrupador',
    unificador_de_puestos: 'unificadorPuesto',
  }
  const CAMPO_OCUP_MAP: Record<string, string> = {
    situacion_de_revista: 'situacionRevista',
    estado:               'estadoPersona',
  }

  for (const idSial of nuevosIds) {
    if (!actualesIds.has(idSial)) continue
    const r      = nuevosMap.get(idSial)!
    const actual = actualesMap.get(idSial)!
    const ocup   = actual.ocupaciones[0]
    const cuilYRol = strVal(r['CUIL Y ROL'] ?? r['cuil_y_rol'])
    const idSialRol = ocup?.idSialRol ?? (cuilYRol ? `${idSial}-${cuilYRol}` : idSial)

    for (const [colPython, tabla] of Object.entries(COLS_WATCH)) {
      const vNuevo = strVal(r[colPython.toUpperCase().replace(/_/g, ' ')] ?? r[colPython])
      let vAnterior = ''
      if (tabla === 'cargo') {
        const key = CAMPO_CARGO_MAP[colPython]
        vAnterior = strVal(key ? actual[key] : null)
      } else {
        const key = CAMPO_OCUP_MAP[colPython]
        vAnterior = strVal(key && ocup ? (ocup as Record<string, unknown>)[key] : null)
      }
      if (vNuevo !== vAnterior) {
        diffs.push({
          tipo: 'modificado',
          idSialRol,
          campo: colPython,
          valorAnterior: vAnterior || null,
          valorNuevo:    vNuevo   || null,
        })
      }
    }
  }

  const totalNuevos      = diffs.filter((d) => d.tipo === 'nuevo').length
  const totalEliminados  = diffs.filter((d) => d.tipo === 'eliminado').length
  const totalModificados = new Set(diffs.filter((d) => d.tipo === 'modificado').map((d) => d.idSialRol)).size
  const totalCampos      = diffs.filter((d) => d.tipo === 'modificado').length

  return { diffs, totalNuevos, totalEliminados, totalModificados, totalCampos }
}

async function assertNoPendiente() {
  const pendiente = await prisma.padronSnapshot.findFirst({
    where: { estado: 'pendiente' },
    select: { id: true, fechaAsignada: true },
  })
  if (pendiente) throw AppError.snapshotPendiente()
}

// ─── S2-12: bloqueo doble carga ───────────────────────────────────────────────

// ─── S2-2 + S2-3 + S2-4 + S2-19: upload → Python → diff Node → guardar ──────────

export async function uploadPadronService(
  file: MultipartFile,
  fechaAsignada: string,
  usuarioId: string
) {
  await assertNoPendiente()

  const fechaDate = new Date(fechaAsignada)
  const existe = await prisma.padronSnapshot.findUnique({ where: { fechaAsignada: fechaDate } })
  if (existe) throw AppError.conflict(`Ya existe un snapshot para la fecha ${fechaAsignada}`)

  const fileBuffer = await file.toBuffer()

  const { data: sessionData } = await python.post('/session')
  const sessionId: string = sessionData.session_id

  try {
    const form = new FormData()
    form.append('session_id', sessionId)
    form.append('file', fileBuffer, { filename: file.filename, contentType: file.mimetype })
    const { data: uploadData } = await python.post('/upload-cargos', form, {
      headers: form.getHeaders(),
    })
    const totalRegistros: number = uploadData.rows ?? 0

    const { data: normJob } = await python.post('/normalizar', { session_id: sessionId })
    await pollJob(normJob.job_id)

    const { data: procJob } = await python.post('/procesar', {
      session_id: sessionId,
      fecha_asignada: fechaAsignada,
    })
    await pollJob(procJob.job_id)

    const { data: cruzarJob } = await python.post('/cruzar', { session_id: sessionId })
    await pollJob(cruzarJob.job_id)

    // S2-19: diff calculado por Node contra Postgres (no más /diff en Python)
    const { diffs, totalNuevos, totalEliminados, totalModificados, totalCampos } =
      await calcularDiff(sessionId)

    const snapshot = await prisma.$transaction(async (tx: PrismaTx) => {
      const snap = await tx.padronSnapshot.create({
        data: {
          fechaAsignada: fechaDate,
          filename: file.filename,
          totalRegistros,
          procesadoPorId: usuarioId,
          estado: 'pendiente',
        },
      })

      if (diffs.length > 0) {
        await tx.padronDiff.createMany({
          data: diffs.map((d) => ({ ...d, snapshotId: snap.id })),
        })
      }

      return snap
    })

    return {
      snapshotId: snapshot.id,
      fechaAsignada,
      totalRegistros,
      resumen: {
        nuevos: totalNuevos,
        modificados: totalModificados,
        eliminados: totalEliminados,
        camposModificados: totalCampos,
      },
    }
  } finally {
    python.post('/session/delete', { session_id: sessionId }).catch(() => {})
  }
}

// ─── S2-5: listar snapshots + diff paginado ───────────────────────────────────

export async function listSnapshotsService() {
  return prisma.padronSnapshot.findMany({
    orderBy: { fechaAsignada: 'desc' },
    select: {
      id: true,
      fechaAsignada: true,
      filename: true,
      totalRegistros: true,
      estado: true,
      aprobadoAt: true,
      createdAt: true,
      procesadoPor: { select: { username: true } },
      aprobadoPor: { select: { username: true } },
    },
  })
}

export async function getSnapshotDiffService(id: string, query: DiffQuery) {
  const snapshot = await getSnapshotOrThrow(id)

  const where = {
    snapshotId: id,
    ...(query.tipo ? { tipo: query.tipo } : {}),
  }

  const [total, diffs] = await Promise.all([
    prisma.padronDiff.count({ where }),
    prisma.padronDiff.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: [{ tipo: 'asc' }, { idSialRol: 'asc' }],
    }),
  ])

  const [nuevos, modificados, eliminados, camposModificados] = await Promise.all([
    prisma.padronDiff.count({ where: { snapshotId: id, tipo: 'nuevo' } }),
    prisma.padronDiff.count({ where: { snapshotId: id, tipo: 'modificado' } }),
    prisma.padronDiff.count({ where: { snapshotId: id, tipo: 'eliminado' } }),
    prisma.padronDiff.count({ where: { snapshotId: id, tipo: 'modificado' } }),
  ])

  return {
    snapshot: {
      id: snapshot.id,
      fechaAsignada: snapshot.fechaAsignada,
      filename: snapshot.filename,
      totalRegistros: snapshot.totalRegistros,
      estado: snapshot.estado,
    },
    summary: { nuevos, modificados, eliminados, camposModificados },
    diffs: {
      data: diffs,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        pages: Math.ceil(total / query.limit),
      },
    },
  }
}

// ─── S2-6 + S2-7: aprobar snapshot ───────────────────────────────────────────

export async function aprobarSnapshotService(id: string, usuarioId: string) {
  const snapshot = await getSnapshotOrThrow(id)
  if (snapshot.estado !== 'pendiente') throw AppError.conflict(`El snapshot ya está ${snapshot.estado}`)

  const diffs = await prisma.padronDiff.findMany({ where: { snapshotId: id } })

  await prisma.$transaction(async (tx: PrismaTx) => {
    const porSialRol = new Map<string, typeof diffs>()
    for (const d of diffs) {
      const arr = porSialRol.get(d.idSialRol) ?? []
      arr.push(d)
      porSialRol.set(d.idSialRol, arr)
    }

    // Caché de catálogos para evitar N queries al mismo hospital/escalafon
    const hospitalCache = new Map<string, { id: string; sigla: string }>()
    const escalafonCache = new Map<string, { id: string; nombre: string }>()

    for (const [idSialRol, cambios] of porSialRol) {
      if (cambios.length === 0) continue
      const tipo = cambios[0]!.tipo

      if (tipo === 'nuevo') {
        const datos = JSON.parse(cambios[0]!.valorNuevo ?? '{}')

        // Hospital — con caché
        const siglaKey: string = datos.siglas ?? idSialRol
        let hospital = hospitalCache.get(siglaKey)
        if (!hospital) {
          const found = await tx.hospital.findUnique({ where: { sigla: siglaKey } })
          hospital = found ?? await tx.hospital.create({
            data: { sigla: siglaKey, nombre: siglaKey, tipo: datos.tipo_hospital_sigla ?? null },
          })
          hospitalCache.set(siglaKey, hospital!)
        }

        // Escalafon — con caché
        const escalafonKey: string = datos.escalafon ?? idSialRol
        let escalafon = escalafonCache.get(escalafonKey)
        if (!escalafon) {
          const found = await tx.escalafon.findFirst({ where: { nombre: escalafonKey } })
          escalafon = found ?? await tx.escalafon.create({
            data: { codigo: escalafonKey, nombre: escalafonKey },
          })
          escalafonCache.set(escalafonKey, escalafon!)
        }

        let persona = datos.cuil
          ? await tx.persona.findUnique({ where: { cuil: datos.cuil } })
          : null
        if (!persona && datos.cuil) {
          persona = await tx.persona.create({
            data: { cuil: datos.cuil, apellidoNombre: datos.ayn ?? '' },
          })
        }

        let cargo = await tx.cargo.findUnique({ where: { idSial: datos.id_sial } })
        if (!cargo) {
          cargo = await tx.cargo.create({
            data: {
              idSial: datos.id_sial,
              hospitalId: hospital!.id,
              escalafonId: escalafon!.id,
              literalPuesto: datos.literal_puesto ?? null,
              especialidad: datos.especialidad ?? null,
              agrupador: datos.agrupador ?? null,
              unificadorPuesto: datos.unificador_de_puestos ?? null,
            },
          })
        }

        if (persona) {
          const existeOcupacion = await tx.ocupacion.findUnique({ where: { idSialRol } })
          if (!existeOcupacion) {
            await tx.ocupacion.create({
              data: {
                personaId: persona.id,
                cargoId: cargo.id,
                idSialRol,
                cuilYRol: datos.cuil_y_rol ?? null,
                situacionRevista: datos.situacion_de_revista ?? null,
                estadoPersona: datos.estado ?? null,
                snapshotId: id,
              },
            })
          }
        }
      } else if (tipo === 'eliminado') {
        await tx.ocupacion.updateMany({
          where: { idSialRol },
          data: { hasta: new Date() },
        })
      } else if (tipo === 'modificado') {
        const camposCargo: Record<string, string> = {
          literal_puesto: 'literalPuesto',
          especialidad: 'especialidad',
          agrupador: 'agrupador',
          unificador_de_puestos: 'unificadorPuesto',
        }
        const camposOcupacion: Record<string, string> = {
          situacion_de_revista: 'situacionRevista',
          estado: 'estadoPersona',
        }

        const updateCargo: Record<string, string> = {}
        const updateOcupacion: Record<string, string> = {}

        for (const cambio of cambios) {
          if (!cambio.campo) continue
          const campo: string = cambio.campo
          const mappedCargo = camposCargo[campo]
          const mappedOcupacion = camposOcupacion[campo]
          if (mappedCargo) updateCargo[mappedCargo] = cambio.valorNuevo ?? ''
          if (mappedOcupacion) updateOcupacion[mappedOcupacion] = cambio.valorNuevo ?? ''
        }

        // Obtener cargoId desde la ocupación (FK directa, no split frágil)
        const ocupModif = await tx.ocupacion.findUnique({ where: { idSialRol } })
        if (ocupModif && Object.keys(updateCargo).length > 0) {
          await tx.cargo.update({ where: { id: ocupModif.cargoId }, data: updateCargo })
        }
        if (Object.keys(updateOcupacion).length > 0) {
          await tx.ocupacion.updateMany({ where: { idSialRol }, data: updateOcupacion })
        }
      }

      // Guardar en historico
      const ocupacion = await tx.ocupacion.findUnique({ where: { idSialRol } })
      if (ocupacion) {
        const cargo = await tx.cargo.findUnique({
          where: { id: ocupacion.cargoId },
          include: { hospital: true, escalafon: true },
        })
        if (cargo) {
          await tx.padronHistorico.create({
            data: {
              snapshotId: id,
              fechaAsignada: snapshot.fechaAsignada,
              personaId: ocupacion.personaId,
              cargoId: cargo.id,
              idSialRol,
              escalafon: cargo.escalafon.nombre,
              hospitalSigla: cargo.hospital.sigla,
              literalPuesto: cargo.literalPuesto,
              especialidad: cargo.especialidad,
              agrupador: cargo.agrupador,
              estadoPersona: ocupacion.estadoPersona,
              situacionRevista: ocupacion.situacionRevista,
            },
          })
        }
      }
    }

    await tx.padronSnapshot.update({
      where: { id },
      data: { estado: 'aprobado', aprobadoPorId: usuarioId, aprobadoAt: new Date() },
    })
  })

  return { ok: true, snapshotId: id }
}

// ─── S2-8: rechazar snapshot ──────────────────────────────────────────────────

export async function rechazarSnapshotService(id: string) {
  const snapshot = await getSnapshotOrThrow(id)
  if (snapshot.estado !== 'pendiente') throw AppError.conflict(`El snapshot ya está ${snapshot.estado}`)

  await prisma.padronSnapshot.update({
    where: { id },
    data: { estado: 'rechazado' },
  })

  return { ok: true, snapshotId: id }
}
