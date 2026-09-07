import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { BajasQuery, CreateBajaBody } from './bajas.schema.js'
import { createConcursoTx } from '../concursos/concursos.service.js'
import { TipoConcurso } from '@srrhh/types'
import { crearNotificacion } from '../notificaciones/notificaciones.service.js'

const include = {
  cargo: { include: { hospital: true, escalafon: true } },
  hospital: true,
  persona: true,
  registradoPor: { select: { username: true } },
} satisfies Prisma.BajaInclude

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

  const [total, data] = await Promise.all([
    prisma.baja.count({ where }),
    prisma.baja.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
  ])

  return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } }
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

    // Si pasa a pendiente/confirmada, marcar cargo no_vigente
    if (body.estado && body.estado !== 'resolucion_a_la_firma') {
      await tx.cargo.update({
        where: { id: baja.cargoId },
        data: { estado: 'no_vigente' },
      })

      if (body.generaConcurso && body.tipoConcurso) {
        if (body.tipoConcurso === TipoConcurso.CPH) {
          const abierto = await tx.concursoCph.findFirst({
            where: { cargoId: baja.cargoId, estado: { notIn: ['finalizado', 'desierto'] } },
          })
          if (abierto) throw AppError.conflict('Ya existe un concurso CPH abierto para este cargo')
        }
        await createConcursoTx(
          tx,
          {
            cargoId: baja.cargoId,
            hospitalId: baja.hospitalId,
            personaId: baja.personaId ?? undefined,
            origen: 'Baja',
            fechaVacante: body.fechaBaja,
            motivo: body.motivo,
            tipoConcurso: body.tipoConcurso,
            escalafonId: body.escalafonId,
            fechaBaja: body.fechaBaja,
            eeBaja: body.eeBaja,
          },
          usuarioId,
          id
        )
      }
    }

    // S13-8: notificar al director cuando la baja pasa a pendiente
    if (body.estado === 'pendiente') {
      const cargoInfo = updated.cargo as unknown as { codigo?: string; hospital?: { sigla?: string } }
      const cargoCodigo = cargoInfo?.codigo ?? baja.cargoId.slice(0, 8)
      const hospitalSigla = cargoInfo?.hospital?.sigla ?? ''
      await crearNotificacion({
        tipo:       'baja_pendiente',
        rolSlug:    'director',
        titulo:     `Baja procesada: ${cargoCodigo}`,
        mensaje:    `La baja del cargo ${cargoCodigo} - ${hospitalSigla} fue procesada y esta pendiente de confirmacion.`,
        origenTipo: 'baja',
        origenId:   id,
        origenKey:  `baja_pendiente:${id}`,
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
        where: { hasta: { not: null } },
        include: { persona: { select: { id: true, apellidoNombre: true, cuil: true } } },
        orderBy: { hasta: 'desc' },
        take: 1,
      },
    },
    orderBy: { estadoDesde: 'asc' },
  })

  const hoy = new Date()

  // Buscar motivo de baja en baja_sial_registros por id_sial del cargo
  const idsSial = cargos.map((c) => c.idSial).filter(Boolean) as string[]
  const bajasMotivo = idsSial.length > 0
    ? await prisma.bajaSialRegistro.findMany({
        where: { cargo: { in: idsSial } },
        select: { cargo: true, motBaja: true },
        distinct: ['cargo'],
        orderBy: { id: 'desc' },
      })
    : []
  const motivoMap = new Map(bajasMotivo.map((b) => [b.cargo, b.motBaja]))

  return cargos.map(({ ocupaciones, estadoDesde, ...c }) => ({
    ...c,
    estadoDesde: estadoDesde?.toISOString().slice(0, 10) ?? null,
    diasEnValidacion: estadoDesde
      ? Math.floor((hoy.getTime() - estadoDesde.getTime()) / 86_400_000)
      : null,
    ultimaOcupacion: ocupaciones[0] ?? null,
    motivoBaja: motivoMap.get(c.idSial ?? '') ?? null,
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

    // S5-7: marcar cargo como no_vigente al registrar la baja
    await tx.cargo.update({
      where: { id: body.cargoId },
      data: { estado: 'no_vigente' },
    })

    // S5-5: si genera_concurso, crear el seguimiento automaticamente
    if (body.generaConcurso && body.tipoConcurso) {
      if (body.tipoConcurso === TipoConcurso.CPH) {
        const abierto = await tx.concursoCph.findFirst({
          where: { cargoId: body.cargoId, estado: { notIn: ['finalizado', 'desierto'] } },
        })
        if (abierto) throw AppError.conflict('Ya existe un concurso CPH abierto para este cargo')
      }

      await createConcursoTx(
        tx,
        {
          cargoId: body.cargoId,
          hospitalId: body.hospitalId,
          personaId: body.personaId,
          origen: 'Baja',
          fechaVacante: body.fechaBaja,
          motivo: body.motivo,
          tipoConcurso: body.tipoConcurso,
          escalafonId: body.escalafonId,
          fechaBaja: body.fechaBaja,
          eeBaja: body.eeBaja,
        },
        usuarioId,
        baja.id
      )
    }

    return baja
  })
}
