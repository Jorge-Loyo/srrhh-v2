import { Prisma } from '@prisma/client'
import { parse as parseCsv } from 'csv-parse/sync'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { BajasQuery, CreateBajaBody, VinculacionQuery } from './bajas.schema.js'
import { createConcursoTx } from '../concursos/concursos.service.js'
import { TipoConcurso } from '@srrhh/types'

const include = {
  cargo: { include: { hospital: true, escalafon: true } },
  hospital: true,
  persona: true,
  registradoPor: { select: { username: true } },
  // S16-6: concurso asociado para mostrar link en AutorizacionesPage
  concursos: {
    select: {
      id: true,
      tipoConcurso: true,
      concursoCph:   { select: { id: true, estado: true, subEstado: true, subEstado3: true } },
      concursoCeetps: { select: { id: true, estado: true } },
    },
    take: 1,
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.BajaInclude

// Set de id_sial presentes en algún snapshot SIAL (cache por request)
async function getSialIdSialSet(): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ cargo: string }[]>`
    SELECT DISTINCT cargo FROM baja_sial_registros
  `
  return new Set(rows.map((r) => r.cargo))
}

// --- S5-4: listado paginado con filtros -------------------------------------
export async function listBajasService(query: BajasQuery) {
  const { page, limit, hospitalId, estado, search } = query
  const offset = (page - 1) * limit

  const where: Prisma.BajaWhereInput = {
    ...(hospitalId && { hospitalId }),
    ...(estado && { estado }),
    ...(search && {
      OR: [
        { motivo: { contains: search, mode: 'insensitive' } },
        { tipoBaja: { contains: search, mode: 'insensitive' } },
        { tipificadorOrigen: { contains: search, mode: 'insensitive' } },
        { cargo: { codigo: { contains: search, mode: 'insensitive' } } },
        { persona: { apellidoNombre: { contains: search, mode: 'insensitive' } } },
      ],
    }),
  }

  const [total, data, sialSet] = await Promise.all([
    prisma.baja.count({ where }),
    prisma.baja.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    getSialIdSialSet(),
  ])

  const dataConSial = data.map((b) => ({
    ...b,
    enSial: b.cargo?.idSial ? sialSet.has(b.cargo.idSial) : false,
  }))

  return { data: dataConSial, meta: { total, page, limit, pages: Math.ceil(total / limit) } }
}

// --- S17-5: GET /vinculacion — bajas confirmadas y su estado de vinculación
// al padrón semanal (ver SPRINT_17_bajas_sgrasv_padron.md) --------------------
export async function listVinculacionService(query: VinculacionQuery) {
  const { search, vinculacion } = query

  const where: Prisma.BajaWhereInput = {
    estado: 'confirmada',
    ...(vinculacion === 'vinculadas' && { snapshotVinculadoId: { not: null } }),
    ...(vinculacion === 'sin_vincular' && { snapshotVinculadoId: null }),
    ...(search && {
      OR: [
        { cargo: { codigo: { contains: search, mode: 'insensitive' } } },
        { hospital: { nombre: { contains: search, mode: 'insensitive' } } },
        { persona: { apellidoNombre: { contains: search, mode: 'insensitive' } } },
      ],
    }),
  }

  const bajas = await prisma.baja.findMany({
    where,
    orderBy: { fechaBaja: 'asc' },
    select: {
      id: true,
      cargoId: true,
      fechaBaja: true,
      estado: true,
      generaConcurso: true,
      padronVinculadoAt: true,
      cargo: { select: { codigo: true } },
      hospital: { select: { nombre: true } },
      persona: { select: { apellidoNombre: true } },
      snapshotVinculado: { select: { id: true, filename: true, fechaAsignada: true } },
      concursos: {
        select: { concursoCph: { select: { id: true } } },
        take: 1,
        orderBy: { createdAt: 'desc' as const },
      },
    },
  })

  return bajas.map((b) => ({
    id: b.id,
    cargoId: b.cargoId,
    cargoCodigo: b.cargo?.codigo ?? null,
    hospitalNombre: b.hospital?.nombre ?? '',
    personaApellidoNombre: b.persona?.apellidoNombre ?? null,
    fechaBaja: b.fechaBaja,
    estado: b.estado,
    generaConcurso: b.generaConcurso,
    concursoId: b.concursos[0]?.concursoCph?.id ?? null,
    padronVinculadoAt: b.padronVinculadoAt,
    snapshotVinculado: b.snapshotVinculado
      ? { id: b.snapshotVinculado.id, filename: b.snapshotVinculado.filename, fechaArchivo: b.snapshotVinculado.fechaAsignada }
      : null,
  }))
}

// --- GET /:id ---------------------------------------------------------------
export async function getBajaService(id: string) {
  const baja = await prisma.baja.findUnique({ where: { id }, include })
  if (!baja) throw AppError.notFound('Baja no encontrada')
  return baja
}

// --- PATCH /:id --- actualizar borrador ------------------------------------
export async function updateBajaService(id: string, body: CreateBajaBody, usuarioId: string) {
  const baja = await prisma.baja.findUnique({ where: { id } })
  if (!baja) throw AppError.notFound('Baja no encontrada')
  if (baja.estado !== 'resolucion_a_la_firma') throw AppError.conflict('Solo se pueden editar bajas en estado resolucion_a_la_firma')

  return prisma.$transaction(async (tx) => {
    const updated = await tx.baja.update({
      where: { id },
      data: {
        fechaBaja: body.fechaBaja ? new Date(body.fechaBaja) : baja.fechaBaja,
        tipoBaja: body.tipoBaja ?? baja.tipoBaja,
        motivo: body.motivo ?? baja.motivo,
        tipificadorOrigen: body.tipificadorOrigen ?? baja.tipificadorOrigen,
        eeBaja: body.eeBaja ?? baja.eeBaja,
        partidaPresupuestaria: body.partida ?? baja.partidaPresupuestaria,
        docRespaldatoria: body.docRespaldatoria ?? baja.docRespaldatoria,
        fechaPaseParalelo: body.fechaPaseParalelo ? new Date(body.fechaPaseParalelo) : baja.fechaPaseParalelo,
        cargaHoraria: body.cargaHoraria ?? baja.cargaHoraria,
        generaConcurso: body.generaConcurso,
        observaciones: body.observaciones ?? baja.observaciones,
        ...(body.estado && body.estado !== 'resolucion_a_la_firma' && { estado: body.estado as never }),
      },
      include,
    })

    // Si sale del borrador, aplicar lógica de negocio
    if (body.estado && body.estado !== 'resolucion_a_la_firma') {
      const generaConcurso = body.generaConcurso ?? baja.generaConcurso

      if (generaConcurso && body.tipoConcurso) {
        // Con concurso: cargo pasa a vigente (vacante esperando designación)
        if (body.tipoConcurso === TipoConcurso.CPH) {
          // PS16D: 'desierto' ya no es un estado — una ronda desierta queda
          // registrada en concursoCphDesierto con estado='activo'+suspendido=true
          const abierto = await tx.concursoCph.findFirst({
            where: { cargoId: baja.cargoId, estado: { not: 'finalizado' }, suspendido: false },
          })
          if (abierto) throw AppError.conflict('Ya existe un concurso CPH abierto para este cargo')
        }
        await tx.cargo.update({
          where: { id: baja.cargoId },
          data: { estado: 'vigente', estadoDesde: new Date() },
        })
        const fechaVacanteUpdate = (body.fechaBaja && body.fechaBaja !== '')
          ? body.fechaBaja
          : baja.fechaBaja instanceof Date
            ? baja.fechaBaja.toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10)
        await createConcursoTx(
          tx,
          {
            cargoId: baja.cargoId,
            hospitalId: baja.hospitalId,
            personaId: baja.personaId ?? undefined,
            origen: 'Baja',
            fechaVacante: fechaVacanteUpdate,
            motivo: body.motivo ?? baja.motivo ?? undefined,
            tipoConcurso: body.tipoConcurso,
            escalafonId: body.escalafonId,
            fechaBaja: fechaVacanteUpdate,
            eeBaja: body.eeBaja ?? baja.eeBaja ?? undefined,
          },
          usuarioId,
          id
        )
      } else {
        // Sin concurso: cargo pasa a no_vigente (baja definitiva)
        await tx.cargo.update({
          where: { id: baja.cargoId },
          data: { estado: 'no_vigente', estadoDesde: new Date() },
        })
      }

      // En ambos casos la baja queda confirmada automáticamente
      await tx.baja.update({
        where: { id },
        data: { estado: 'confirmada' },
      })
    }

    return updated
  })
}

// --- S8B: Validacion de Bajas -----------------------------------------------

export async function listValidacionService() {
  const cargos = await prisma.cargo.findMany({
    where: { estado: 'validacion_vacante' },
    include: {
      hospital: { select: { sigla: true, nombre: true } },
      escalafon: { select: { nombre: true } },
      ocupaciones: {
        include: { persona: { select: { id: true, apellidoNombre: true, cuil: true } } },
        orderBy: { desde: 'desc' },
        take: 1,
      },
    },
    orderBy: { estadoDesde: 'asc' },
  })

  const hoy = new Date()
  const cargoIds = cargos.map((c) => c.id)
  const idsSial  = cargos.map((c) => c.idSial).filter(Boolean) as string[]

  // Snapshot de bajas SIAL más reciente (pendiente o aprobado)
  // Nota: estado es varchar en DB, no enum — filtrar con queryRaw
  const ultimoSnapshotSial = await prisma.$queryRaw<{ id: string; fecha_archivo: Date }[]>`
    SELECT id, fecha_archivo FROM baja_sial_snapshots
    WHERE estado IN ('pendiente', 'aprobado')
    ORDER BY fecha_archivo DESC
    LIMIT 1
  `.then((rows) => rows[0] ? { id: rows[0].id, fechaArchivo: rows[0].fecha_archivo } : null)

  // Registros del snapshot SIAL más reciente para los idSial de estos cargos
  const registrosSial = ultimoSnapshotSial && idsSial.length > 0
    ? await prisma.bajaSialRegistro.findMany({
        where: { snapshotId: ultimoSnapshotSial.id, cargo: { in: idsSial } },
        select: { cargo: true, motBaja: true, ayn: true, cuil: true },
      })
    : []
  const sialMap = new Map(registrosSial.map((r) => [r.cargo, r]))

  // Bajas manuales registradas para estos cargos
  const bajasManuales = cargoIds.length > 0
    ? await prisma.baja.findMany({
        where: { cargoId: { in: cargoIds } },
        select: { id: true, cargoId: true, estado: true, fechaBaja: true, motivo: true, tipoBaja: true },
        orderBy: { createdAt: 'desc' },
      })
    : []
  const bajaManualMap = new Map<string, typeof bajasManuales[number]>()
  for (const b of bajasManuales) {
    if (!bajaManualMap.has(b.cargoId)) bajaManualMap.set(b.cargoId, b)
  }

  // Diffs de padron eliminados que originaron la validacion_vacante
  const estadosDesdeFechas = [...new Set(
    cargos.map((c) => c.estadoDesde?.toISOString().slice(0, 10)).filter(Boolean) as string[]
  )]
  const snapshotIds = estadosDesdeFechas.length > 0
    ? (await prisma.padronSnapshot.findMany({
        where: {
          estado: { in: ['aprobado', 'pendiente'] },
          fechaAsignada: { in: estadosDesdeFechas.map((f) => new Date(f)) },
        },
        select: { id: true },
      })).map((s) => s.id)
    : []

  const diffsPadron = snapshotIds.length > 0
    ? await prisma.padronDiff.findMany({
        where: { tipo: 'eliminado', snapshotId: { in: snapshotIds } },
        select: { valorAnterior: true, snapshotId: true },
      })
    : []

  const diffPadronMap = new Map<string, { snapshotId: string }>()
  for (const d of diffsPadron) {
    try {
      const idSial = JSON.parse(d.valorAnterior ?? '{}').id_sial as string
      if (idSial && !diffPadronMap.has(idSial)) diffPadronMap.set(idSial, { snapshotId: d.snapshotId })
    } catch { /* ignorar */ }
  }

  return cargos.map(({ ocupaciones, estadoDesde, ...c }) => {
    const bajaManual  = bajaManualMap.get(c.id) ?? null
    const enPadron    = c.idSial ? diffPadronMap.has(c.idSial) : false
    const enSial      = c.idSial ? sialMap.has(c.idSial) : false
    const sialRegistro = c.idSial ? sialMap.get(c.idSial) ?? null : null

    const origen: 'padron' | 'baja_sial' | 'baja_manual' | 'ambos' | 'desconocido' =
      enPadron && enSial ? 'ambos'
      : enPadron         ? 'padron'
      : enSial           ? 'baja_sial'
      : bajaManual       ? 'baja_manual'
      : 'desconocido'

    const ultimaOcup = ocupaciones[0] ?? null

    return {
      ...c,
      estadoDesde: estadoDesde?.toISOString().slice(0, 10) ?? null,
      diasEnValidacion: estadoDesde
        ? Math.floor((hoy.getTime() - estadoDesde.getTime()) / 86_400_000)
        : null,
      ultimaOcupacion: ultimaOcup,
      tienePersonaActiva: ultimaOcup?.hasta == null && ultimaOcup?.persona != null,
      motivoBaja: sialRegistro?.motBaja ?? bajaManual?.motivo ?? null,
      origen,
      bajaManual,
      enPadronPendiente: enPadron,
      enSial,
      sialFecha: ultimoSnapshotSial?.fechaArchivo?.toISOString().slice(0, 10) ?? null,
    }
  })
}

export async function listSoloBajaSialService() {
  // Snapshot SIAL más reciente (pendiente o aprobado)
  const [snapshotSial] = await prisma.$queryRaw<{ id: string; fecha_archivo: Date }[]>`
    SELECT id, fecha_archivo FROM baja_sial_snapshots
    WHERE estado IN ('pendiente', 'aprobado')
    ORDER BY fecha_archivo DESC LIMIT 1
  `
  if (!snapshotSial) return []

  // Snapshot padrón más reciente aprobado
  const [snapshotPadron] = await prisma.$queryRaw<{ id: string; fecha_asignada: Date }[]>`
    SELECT id, fecha_asignada FROM padron_snapshots
    WHERE estado = 'aprobado'
    ORDER BY fecha_asignada DESC LIMIT 1
  `
  if (!snapshotPadron) return []

  // Personas en bajas SIAL que siguen activas en el padrón activo
  // Agrupamos por CUIL para evitar duplicados (una persona puede tener varios cargos en SIAL)
  const rows = await prisma.$queryRaw<{
    cuil_baja: string
    ayn: string
    mot_baja: string | null
    id_sial_rol: string
    hospital_sigla: string
    literal_puesto: string | null
    escalafon: string | null
    cargo_sial: string
    cargo_id: string | null
    cargo_estado: string | null
    cargo_codigo: string | null
  }[]>`
    SELECT DISTINCT ON (REPLACE(bsr.cuil, '-', ''))
      bsr.cuil        AS cuil_baja,
      bsr.ayn,
      bsr.mot_baja,
      ph.id_sial_rol,
      ph.hospital_sigla,
      ph.literal_puesto,
      ph.escalafon,
      bsr.cargo       AS cargo_sial,
      c.id            AS cargo_id,
      c.estado        AS cargo_estado,
      c.codigo        AS cargo_codigo
    FROM baja_sial_registros bsr
    JOIN padron_historico ph
      ON ph.cuil = REPLACE(bsr.cuil, '-', '')
     AND ph.snapshot_id = ${snapshotPadron.id}::uuid
    LEFT JOIN cargos c ON c.id_sial = bsr.cargo
    WHERE bsr.snapshot_id = ${snapshotSial.id}::uuid
    ORDER BY REPLACE(bsr.cuil, '-', ''), bsr.ayn
  `

  return rows.map((r) => ({
    cuil: r.cuil_baja,
    apellidoNombre: r.ayn,
    motivoBaja: r.mot_baja,
    idSialRol: r.id_sial_rol,
    hospitalSigla: r.hospital_sigla,
    literalPuesto: r.literal_puesto,
    escalafon: r.escalafon,
    cargoSial: r.cargo_sial,
    cargoId: r.cargo_id,
    cargoEstado: r.cargo_estado,
    cargoCodigo: r.cargo_codigo,
    sialFecha: snapshotSial.fecha_archivo.toISOString().slice(0, 10),
    padronFecha: snapshotPadron.fecha_asignada.toISOString().slice(0, 10),
  }))
}

export async function listValidacionHistoricoService() {
  // Cargos no_vigente que pasaron por validacion_vacante:
  // cruzamos con diffs de padron eliminados en snapshots aprobados
  const snapshotsAprobados = await prisma.$queryRaw<{ id: string; fecha_archivo: Date }[]>`
    SELECT id, fecha_archivo FROM baja_sial_snapshots
    WHERE estado = 'aprobado'
    ORDER BY fecha_archivo DESC
  `

  const padronSnapshotsAprobados = await prisma.padronSnapshot.findMany({
    where: { estado: 'aprobado' },
    select: { id: true, fechaAsignada: true },
    orderBy: { fechaAsignada: 'desc' },
  })

  const padronSnapshotIds = padronSnapshotsAprobados.map((s) => s.id)

  const diffsPadron = padronSnapshotIds.length > 0
    ? await prisma.padronDiff.findMany({
        where: { tipo: 'eliminado', snapshotId: { in: padronSnapshotIds } },
        select: { valorAnterior: true, snapshotId: true },
      })
    : []

  const idSialEnPadron = new Set<string>()
  for (const d of diffsPadron) {
    try {
      const idSial = JSON.parse(d.valorAnterior ?? '{}').id_sial as string
      if (idSial) idSialEnPadron.add(idSial)
    } catch { /* ignorar */ }
  }

  // Todos los snapshots SIAL aprobados — registros
  const sialSnapshotIds = snapshotsAprobados.map((s) => s.id)
  const registrosSialAprobados = sialSnapshotIds.length > 0
    ? await prisma.bajaSialRegistro.findMany({
        where: { snapshotId: { in: sialSnapshotIds } },
        select: { cargo: true, motBaja: true, snapshotId: true },
        distinct: ['cargo'],
        orderBy: { snapshotId: 'desc' },
      })
    : []
  const sialHistoricoMap = new Map(registrosSialAprobados.map((r) => [r.cargo, r]))

  const cargos = await prisma.cargo.findMany({
    where: {
      estado: 'no_vigente',
      idSial: { in: [...idSialEnPadron] },
    },
    include: {
      hospital: { select: { sigla: true, nombre: true } },
      escalafon: { select: { nombre: true } },
      ocupaciones: {
        include: { persona: { select: { id: true, apellidoNombre: true, cuil: true } } },
        orderBy: { desde: 'desc' },
        take: 1,
      },
    },
    orderBy: { estadoDesde: 'desc' },
    take: 200,
  })

  return cargos.map(({ ocupaciones, estadoDesde, ...c }) => ({
    ...c,
    estadoDesde: estadoDesde?.toISOString().slice(0, 10) ?? null,
    ultimaOcupacion: ocupaciones[0] ?? null,
    motivoBaja: sialHistoricoMap.get(c.idSial ?? '')?.motBaja ?? null,
    enSial: sialHistoricoMap.has(c.idSial ?? ''),
  }))
}

export async function confirmarValidacionService(cargoId: string, actaAdministrativa?: string) {
  const cargo = await prisma.cargo.findUnique({ where: { id: cargoId } })
  if (!cargo) throw AppError.notFound('Cargo no encontrado')
  if (cargo.estado !== 'validacion_vacante') throw AppError.conflict(`El cargo no esta en validacion_vacante (estado actual: ${cargo.estado})`)

  return prisma.cargo.update({
    where: { id: cargoId },
    data: {
      estado: 'no_vigente',
      estadoDesde: new Date(),
      ...(actaAdministrativa && { expediente: actaAdministrativa }),
    },
  })
}

export async function rechazarValidacionService(cargoId: string) {
  const cargo = await prisma.cargo.findUnique({ where: { id: cargoId } })
  if (!cargo) throw AppError.notFound('Cargo no encontrado')
  if (cargo.estado !== 'validacion_vacante') throw AppError.conflict(`El cargo no esta en validacion_vacante (estado actual: ${cargo.estado})`)

  return prisma.$transaction(async (tx) => {
    const ultimaOcup = await tx.ocupacion.findFirst({
      where: { cargoId, hasta: { not: null } },
      orderBy: { hasta: 'desc' },
    })
    if (ultimaOcup) {
      await tx.ocupacion.update({ where: { id: ultimaOcup.id }, data: { hasta: null } })
      await tx.persona.update({ where: { id: ultimaOcup.personaId }, data: { activo: true } })
    }
    return tx.cargo.update({
      where: { id: cargoId },
      data: { estado: 'vigente', estadoDesde: null },
    })
  })
}

// ─── Importar CSV de bajas CPH ──────────────────────────────────────────────────
// Solo procesa filas de 2026. Match por cargo (id_sial).
// Vincula con BajaSialRegistro del snapshot más reciente para traer motivo.
export async function importarBajasCsvService(buffer: Buffer) {
  const rows: Record<string, string>[] = parseCsv(buffer, {
    columns: true, skip_empty_lines: true, trim: true, relax_quotes: true,
  })

  function fecha(v: string | undefined): Date | null {
    if (!v || v.trim() === '' || v === 'nan') return null
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  }
  function str(v: string | undefined): string | null {
    if (!v || v.trim() === '' || v === 'nan') return null
    return v.trim()
  }

  // Cargar mot_baja más reciente por cargo/cuil de todos los snapshots aprobados
  // (un cargo puede estar en snapshots viejos pero no en el más reciente)
  const registrosSial = await prisma.$queryRaw<{ cargo: string; cuil: string; mot_baja: string | null }[]>`
    SELECT DISTINCT ON (cargo) cargo, cuil, mot_baja
    FROM baja_sial_registros bsr
    JOIN baja_sial_snapshots bss ON bss.id = bsr.snapshot_id
    WHERE bss.estado IN ('pendiente', 'aprobado')
    ORDER BY cargo, bss.fecha_archivo DESC
  `
  const sialPorIdSial = new Map(registrosSial.map((r) => [r.cargo, r]))
  const sialPorCuil   = new Map(registrosSial.map((r) => [r.cuil.replace(/-/g, ''), r]))

  let creados = 0, actualizados = 0, noEncontrados = 0, omitidos = 0

  for (const row of rows) {
    // Solo 2026
    const fechaStr = str(row['fecha_de_baja_ampliacion'])
    if (!fechaStr?.startsWith('2026')) { omitidos++; continue }

    const idSial = str(row['cargo'])
    const eeBaja = str(row['ex_baja_ampliacion'])
    if (!idSial) { noEncontrados++; continue }

    const cargo = await prisma.cargo.findFirst({ where: { idSial } })
    if (!cargo) { noEncontrados++; continue }

    const fechaBaja     = fecha(fechaStr)
    const tipoBaja      = str(row['motivo_de_baja'])
    const observaciones = str(row['observaciones'])
    const cuil          = str(row['cuil'])?.replace(/-/g, '')

    // Vincular con BajaSialRegistro para traer motivo (id_sial primero, fallback cuil)
    const sialReg = sialPorIdSial.get(idSial) ?? (cuil ? sialPorCuil.get(cuil) : undefined)
    const motivoSial = sialReg?.mot_baja ?? null

    // Buscar persona por CUIL
    let personaId: string | null = null
    if (cuil) {
      const persona = await prisma.persona.findFirst({ where: { cuil } })
      personaId = persona?.id ?? null
    }

    // Buscar baja existente por cargoId + eeBaja (o solo cargoId si no hay ee)
    const bajaExistente = eeBaja
      ? await prisma.baja.findFirst({ where: { cargoId: cargo.id, eeBaja } })
      : await prisma.baja.findFirst({ where: { cargoId: cargo.id } })

    if (bajaExistente) {
      await prisma.baja.update({
        where: { id: bajaExistente.id },
        data: {
          ...(fechaBaja    && { fechaBaja }),
          ...(tipoBaja     && { tipoBaja }),
          ...(eeBaja       && { eeBaja }),
          ...(personaId    && { personaId }),
          ...(motivoSial   && { motivo: motivoSial }),
          ...(observaciones && { observaciones }),
        },
      })
      actualizados++
    } else {
      await prisma.baja.create({
        data: {
          cargoId:           cargo.id,
          hospitalId:        cargo.hospitalId,
          personaId,
          fechaBaja:         fechaBaja ?? new Date(),
          tipoBaja,
          motivo:            motivoSial,
          eeBaja,
          observaciones,
          generaConcurso:    true,
          estado:            'confirmada',
          tipificadorOrigen: str(row['tipificador_1_origen']) ?? 'Importado CSV',
        },
      })
      creados++
    }
  }

  return { total: rows.length, creados, actualizados, noEncontrados, omitidos }
}

export async function createBajaService(body: CreateBajaBody, usuarioId: string) {
  const cargo = await prisma.cargo.findUnique({ where: { id: body.cargoId } })
  if (!cargo) throw AppError.notFound('Cargo no encontrado')

  const hospital = await prisma.hospital.findUnique({ where: { id: body.hospitalId } })
  if (!hospital) throw AppError.notFound('Hospital no encontrado')

  if (body.personaId) {
    const persona = await prisma.persona.findUnique({ where: { id: body.personaId } })
    if (!persona) throw AppError.notFound('Persona no encontrada')
  }

  return prisma.$transaction(async (tx) => {
    const baja = await tx.baja.create({
      data: {
        cargoId: body.cargoId,
        hospitalId: body.hospitalId,
        personaId: body.personaId ?? null,
        fechaBaja: body.fechaBaja ? new Date(body.fechaBaja) : new Date(),
        tipoBaja: body.tipoBaja ?? null,
        motivo: body.motivo ?? null,
        tipificadorOrigen: body.tipificadorOrigen ?? null,
        eeBaja: body.eeBaja ?? null,
        partidaPresupuestaria: body.partida ?? null,
        docRespaldatoria: body.docRespaldatoria ?? null,
        fechaPaseParalelo: body.fechaPaseParalelo ? new Date(body.fechaPaseParalelo) : null,
        cargaHoraria: body.cargaHoraria ?? null,
        generaConcurso: body.generaConcurso,
        observaciones: body.observaciones ?? null,
        registradoPorId: usuarioId,
        ...(body.estado && { estado: body.estado as never }),
      },
      include,
    })

    // Borrador iniciado: no tocar el cargo ni crear concurso
    if (body.estado === 'resolucion_a_la_firma') return baja

    // S5-5/S5-7: aplicar lógica de negocio según genera_concurso
    // generaConcurso puede ser undefined si el borrador no pasó por paso 2 —
    // en ese caso tratarlo como false (baja sin concurso) hasta que se confirme
    if (body.generaConcurso === true && body.tipoConcurso) {
      // Con concurso: cargo pasa a vigente (vacante esperando designación)
      if (body.tipoConcurso === TipoConcurso.CPH) {
        // PS16D: 'desierto' ya no es un estado — una ronda desierta queda
        // registrada en concursoCphDesierto con estado='activo'+suspendido=true
        const abierto = await tx.concursoCph.findFirst({
          where: { cargoId: body.cargoId, estado: { not: 'finalizado' }, suspendido: false },
        })
        if (abierto) throw AppError.conflict('Ya existe un concurso CPH abierto para este cargo')
      }
      await tx.cargo.update({
        where: { id: body.cargoId },
        data: { estado: 'vigente', estadoDesde: new Date() },
      })
      const fechaVacanteCreate = (body.fechaBaja && body.fechaBaja !== '')
        ? body.fechaBaja
        : new Date().toISOString().slice(0, 10)
      await createConcursoTx(
        tx,
        {
          cargoId: body.cargoId,
          hospitalId: body.hospitalId,
          personaId: body.personaId,
          origen: 'Baja',
          fechaVacante: fechaVacanteCreate,
          motivo: body.motivo,
          tipoConcurso: body.tipoConcurso,
          escalafonId: body.escalafonId,
          fechaBaja: fechaVacanteCreate,
          eeBaja: body.eeBaja,
        },
        usuarioId,
        baja.id
      )
    } else {
      // Sin concurso: cargo pasa a no_vigente (baja definitiva)
      await tx.cargo.update({
        where: { id: body.cargoId },
        data: { estado: 'no_vigente', estadoDesde: new Date() },
      })
    }

    // S17-2: baja nace confirmada — SGRASV ya tiene la potestad, no necesita
    // autorización del director. El flujo pendiente+autorizacion era incorrecto.
    await tx.baja.update({
      where: { id: baja.id },
      data: { estado: 'confirmada' },
    })

    return tx.baja.findUnique({ where: { id: baja.id }, include })
  })
}
