import { TipoConcurso } from '@srrhh/types'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { CreateConcursoBody } from './concursos.schema.js'
import { calcConcursoCph, type ConcursoCphCalcInput } from '../concursos-cph/concursosCph.calc.js'

const CALC_INPUT_VACIO: Omit<ConcursoCphCalcInput, 'suspendido' | 'eeBaja' | 'fechaBaja'> = {
  eeConcurso: null,
  fechaEeConcurso: null,
  fechaAutorizacion: null,
  sorteoJurado: null,
  disposicion: null,
  fechaInscHasta: null,
  fechaExamen: null,
  fechaOrdenMerito: null,
  fechaIfacs: null,
  fechaInsal: null,
  eeDesignacion: null,
  cargaDocumentacion: null,
  fechaAptoMedico: null,
  fechaIte: null,
  proyectoResolucion: null,
  resoALaFirma: null,
  resolucionDesignacion: null,
  fechaResolucion: null,
  cargoSial: null,
  dispoDesierta: null,
  fechaDispoDesierta: null,
}

// ─── S4-6: crear concurso (manual por ahora, ver nota en concursos.schema.ts) ─
export async function createConcursoService(body: CreateConcursoBody, usuarioId: string) {
  const cargo = await prisma.cargo.findUnique({ where: { id: body.cargoId } })
  if (!cargo) throw AppError.notFound('Cargo no encontrado')

  const hospital = await prisma.hospital.findUnique({ where: { id: body.hospitalId } })
  if (!hospital) throw AppError.notFound('Hospital no encontrado')

  if (body.tipoConcurso === TipoConcurso.CPH) {
    // Un cargo puede tener concursos históricos (ej. quedó desierto y se
    // reabre) — lo que no puede tener es dos concursos CPH abiertos a la vez.
    const abierto = await prisma.concursoCph.findFirst({
      where: { cargoId: body.cargoId, estado: { notIn: ['finalizado', 'desierto'] } },
    })
    if (abierto) throw AppError.conflict('Ya existe un concurso CPH abierto para este cargo')
  }

  return prisma.$transaction(async (tx) => {
    const concurso = await tx.concurso.create({
      data: {
        cargoId: body.cargoId,
        hospitalId: body.hospitalId,
        personaId: body.personaId ?? null,
        origen: body.origen,
        fechaVacante: new Date(body.fechaVacante),
        motivo: body.motivo ?? null,
        expediente: body.expediente ?? null,
        tipoConcurso: body.tipoConcurso,
        registradoPorId: usuarioId,
      },
    })

    if (body.tipoConcurso === TipoConcurso.CPH) {
      const calcInput: ConcursoCphCalcInput = {
        ...CALC_INPUT_VACIO,
        suspendido: false,
        eeBaja: body.eeBaja ?? null,
        fechaBaja: body.fechaBaja ? new Date(body.fechaBaja) : null,
      }
      const calc = calcConcursoCph(calcInput)

      const concursoCph = await tx.concursoCph.create({
        data: {
          concursoId: concurso.id,
          cargoId: body.cargoId,
          hospitalId: body.hospitalId,
          especialidadSolicitada: body.especialidadSolicitada ?? null,
          eeBaja: calcInput.eeBaja,
          fechaBaja: calcInput.fechaBaja,
          estado: calc.estado,
          subEstado: calc.subEstado,
          subEstado3: calc.subEstado3,
        },
      })
      return { concurso, concursoCph }
    }

    if (body.tipoConcurso === TipoConcurso.CEETPS) {
      // escalafonId garantizado por el .refine() de createConcursoSchema
      const concursoCeetps = await tx.concursoCeetps.create({
        data: {
          concursoId: concurso.id,
          cargoId: body.cargoId,
          hospitalId: body.hospitalId,
          escalafonId: body.escalafonId as string,
          puestoSolicitado: body.puestoSolicitado ?? null,
        },
      })
      return { concurso, concursoCeetps }
    }

    return { concurso }
  })
}
