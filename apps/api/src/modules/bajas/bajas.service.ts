import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { BajasQuery, CreateBajaBody } from './bajas.schema.js'
import { createConcursoTx } from '../concursos/concursos.service.js'
import { TipoConcurso } from '@srrhh/types'

const include = {
  cargo: { include: { hospital: true, escalafon: true } },
  hospital: true,
  persona: true,
  registradoPor: { select: { username: true } },
} satisfies Prisma.BajaInclude

// ─── S5-4: listado paginado con filtros ─────────────────────────────────────
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

// ─── S5-4 + S5-7: crear baja + marcar cargo no_vigente ──────────────────────
// S5-5 (lógica genera_concurso → crear seguimiento automático) se agrega
// en la siguiente tarea, una vez que el módulo de bajas esté integrado.
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
        fechaBaja: new Date(body.fechaBaja),
        tipoBaja: body.tipoBaja ?? null,
        motivo: body.motivo ?? null,
        tipificadorOrigen: body.tipificadorOrigen ?? null,
        generaConcurso: body.generaConcurso,
        observaciones: body.observaciones ?? null,
        registradoPorId: usuarioId,
      },
      include,
    })

    // S5-7: marcar cargo como no_vigente al registrar la baja
    await tx.cargo.update({
      where: { id: body.cargoId },
      data: { estado: 'no_vigente' },
    })

    // S5-5: si genera_concurso, crear el seguimiento automáticamente
    if (body.generaConcurso && body.tipoConcurso) {
      // Guard CPH: no puede haber dos concursos abiertos para el mismo cargo
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
        },
        usuarioId,
        baja.id
      )
    }

    return baja
  })
}
