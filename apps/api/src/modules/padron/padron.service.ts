import FormData from 'form-data'
import axios from 'axios'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { env } from '../../config/env.js'
import type { MultipartFile } from '@fastify/multipart'
import type { DiffQuery } from './padron.schema.js'

import { Prisma } from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'

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

// ─── S2-12: bloqueo doble carga ───────────────────────────────────────────────

async function assertNoPendiente() {
  const pendiente = await prisma.padronSnapshot.findFirst({
    where: { estado: 'pendiente' },
    select: { id: true, fechaAsignada: true },
  })
  if (pendiente) throw AppError.snapshotPendiente()
}

// ─── S2-2 + S2-3 + S2-4: upload → Python → guardar diff ─────────────────────

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

    const { data: diffData } = await python.post('/diff', {
      session_id: sessionId,
      fecha_asignada: fechaAsignada,
    })

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

      const diffsToCreate: {
        snapshotId: string
        tipo: 'nuevo' | 'modificado' | 'eliminado'
        idSialRol: string
        campo: string | null
        valorAnterior: string | null
        valorNuevo: string | null
      }[] = []

      for (const r of diffData.nuevos ?? []) {
        diffsToCreate.push({
          snapshotId: snap.id,
          tipo: 'nuevo',
          idSialRol: r.id_sial,
          campo: null,
          valorAnterior: null,
          valorNuevo: JSON.stringify(r),
        })
      }

      for (const r of diffData.eliminados ?? []) {
        diffsToCreate.push({
          snapshotId: snap.id,
          tipo: 'eliminado',
          idSialRol: r.id_sial,
          campo: null,
          valorAnterior: JSON.stringify(r),
          valorNuevo: null,
        })
      }

      for (const r of diffData.modificados ?? []) {
        for (const cambio of r.cambios ?? []) {
          diffsToCreate.push({
            snapshotId: snap.id,
            tipo: 'modificado',
            idSialRol: r.id_sial,
            campo: cambio.campo,
            valorAnterior: cambio.antes ?? null,
            valorNuevo: cambio.despues ?? null,
          })
        }
      }

      if (diffsToCreate.length > 0) {
        await tx.padronDiff.createMany({ data: diffsToCreate })
      }

      return snap
    })

    return {
      snapshotId: snapshot.id,
      fechaAsignada,
      totalRegistros,
      resumen: {
        nuevos: diffData.total_nuevos ?? 0,
        modificados: diffData.total_modificados ?? 0,
        eliminados: diffData.total_eliminados ?? 0,
        camposModificados: diffData.total_campos_modificados ?? 0,
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

    for (const [idSialRol, cambios] of porSialRol) {
      const tipo = cambios[0].tipo

      if (tipo === 'nuevo') {
        const datos = JSON.parse(cambios[0].valorNuevo ?? '{}')

        let hospital = await tx.hospital.findUnique({ where: { sigla: datos.siglas } })
        if (!hospital) {
          hospital = await tx.hospital.create({
            data: {
              sigla: datos.siglas ?? idSialRol,
              nombre: datos.siglas ?? idSialRol,
              tipo: datos.tipo_hospital_sigla ?? null,
            },
          })
        }

        let escalafon = await tx.escalafon.findFirst({ where: { nombre: datos.escalafon } })
        if (!escalafon) {
          escalafon = await tx.escalafon.create({
            data: { codigo: datos.escalafon ?? idSialRol, nombre: datos.escalafon ?? idSialRol },
          })
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
              hospitalId: hospital.id,
              escalafonId: escalafon.id,
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
          const campo = cambio.campo
          if (camposCargo[campo]) updateCargo[camposCargo[campo]] = cambio.valorNuevo ?? ''
          if (camposOcupacion[campo]) updateOcupacion[camposOcupacion[campo]] = cambio.valorNuevo ?? ''
        }

        const idSial = idSialRol.split('-')[0]
        const cargo = await tx.cargo.findUnique({ where: { idSial } })
        if (cargo && Object.keys(updateCargo).length > 0) {
          await tx.cargo.update({ where: { id: cargo.id }, data: updateCargo })
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
