import { TipoConcurso } from '@srrhh/types'
import type { MotivoConcurso, Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { CreateConcursoBody } from './concursos.schema.js'
import { calcConcursoCph, type ConcursoCphCalcInput } from '../concursos-cph/concursosCph.calc.js'
import { crearNotificacion } from '../notificaciones/notificaciones.service.js'
import { prefijoRemplazante, siguienteCodigoCargo } from '../../shared/codigoCargo.js'

// Label legible de cada motivo para la notificación concurso_iniciado a sgrasv.
const MOTIVO_CONCURSO_LABEL: Record<MotivoConcurso, string> = {
  nuevo_cargo: 'Nuevo cargo',
  alta_por_baja: 'Alta por baja',
  retencion_de_cargo: 'Retención de cargo',
  cobertura_dotacion: 'Cobertura de dotación',
}

const CALC_INPUT_VACIO: Omit<ConcursoCphCalcInput, 'suspendido' | 'eeBaja' | 'fechaBaja'> = {
  eeConcurso: null,
  fechaEeConcurso: null,
  fechaAutorizacion: null,
  sorteoJurado: null,
  disposicion: null,
  fechaInscDesde: null,
  fechaInscHasta: null,
  inscripcionCerrada: null,
  ordenMeritoConfirmado: null,
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

// ─── Lógica interna reutilizable dentro de una transacción existente ────────
// Separada de createConcursoService para que createBajaService (S5-5) pueda
// llamarla dentro de su propia transacción sin anidar $transaction.
type Tx = Omit<
  Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

export async function createConcursoTx(
  tx: Tx,
  body: CreateConcursoBody,
  usuarioId: string,
  bajaId?: string,
) {
  // Retención de cargo: el titular retiene su cargo y se concursa un
  // reemplazante. El código del cargo del concurso conserva su número y se le
  // inserta -R- (CPH-POF-017530 → CPH-POF-R-000NNN), mismo criterio de
  // prefijo/secuencial que registrarRetencionService (retenciones.service.ts).
  // El cargo retenido NO se toca. Se recodifica in-place el cargo del concurso.
  if (body.motivoConcurso === 'retencion_de_cargo') {
    const cargo = await tx.cargo.findUnique({
      where: { id: body.cargoId },
      select: { codigo: true },
    })
    // Omitir si no hay código (cargo legacy sin codificar) o si ya está
    // recodificado como remplazante (-R- / -TTR-) — no aplicar dos veces.
    if (cargo?.codigo && !/-(R|TTR)-\d{6}$/.test(cargo.codigo)) {
      const prefijoBase = cargo.codigo.replace(/-\d{6}$/, '')
      const prefijo = prefijoRemplazante(prefijoBase, 'R')
      const nuevoCodigo = await siguienteCodigoCargo(prefijo, tx)
      await tx.cargo.update({ where: { id: body.cargoId }, data: { codigo: nuevoCodigo } })
    }
  }

  const concurso = await tx.concurso.create({
    data: {
      cargoId: body.cargoId,
      hospitalId: body.hospitalId,
      personaId: body.personaId ?? null,
      bajaId: bajaId ?? null,
      origen: body.origen,
      fechaVacante: new Date(body.fechaVacante),
      motivo: body.motivo ?? null,
      motivoConcurso: body.motivoConcurso ?? null,
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

    // S14-4/5: notificar a sgrasv cuando el concurso se inicia desde un alta
    if (body.motivoConcurso) {
      const cargo = await tx.cargo.findUnique({
        where: { id: body.cargoId },
        select: { codigo: true, literalPuesto: true, hospital: { select: { sigla: true } } },
      })
      const label = cargo?.codigo ?? body.cargoId.slice(0, 8)
      const motivoLabel = MOTIVO_CONCURSO_LABEL[body.motivoConcurso]
      await crearNotificacion({
        tipo: 'concurso_iniciado',
        rolSlug: 'sgrasv',
        titulo: `Nuevo concurso CPH iniciado — ${label}`,
        mensaje: `Se inició un concurso CPH para el cargo ${label} (${cargo?.literalPuesto ?? ''}) en ${cargo?.hospital?.sigla ?? ''}. Motivo: ${motivoLabel}.`,
        origenTipo: 'concurso_cph',
        origenId: concursoCph.id,
        origenKey: `concurso_iniciado:cph:${concursoCph.id}`,
      })
    }

    return { concurso, concursoCph }
  }

  if (body.tipoConcurso === TipoConcurso.CEETPS) {
    const concursoCeetps = await tx.concursoCeetps.create({
      data: {
        concursoId: concurso.id,
        cargoId: body.cargoId,
        hospitalId: body.hospitalId,
        escalafonId: body.escalafonId as string,
        puestoSolicitado: body.puestoSolicitado ?? null,
      },
    })

    // S14-4/5: notificar a sgrasv cuando el concurso se inicia desde un alta
    if (body.motivoConcurso) {
      const cargo = await tx.cargo.findUnique({
        where: { id: body.cargoId },
        select: { codigo: true, literalPuesto: true, hospital: { select: { sigla: true } } },
      })
      const label = cargo?.codigo ?? body.cargoId.slice(0, 8)
      const motivoLabel = MOTIVO_CONCURSO_LABEL[body.motivoConcurso]
      await crearNotificacion({
        tipo: 'concurso_iniciado',
        rolSlug: 'sgrasv',
        titulo: `Nuevo concurso CEETPS iniciado — ${label}`,
        mensaje: `Se inició un concurso CEETPS para el cargo ${label} (${cargo?.literalPuesto ?? ''}) en ${cargo?.hospital?.sigla ?? ''}. Motivo: ${motivoLabel}.`,
        origenTipo: 'concurso_ceetps',
        origenId: concursoCeetps.id,
        origenKey: `concurso_iniciado:ceetps:${concursoCeetps.id}`,
      })
    }

    return { concurso, concursoCeetps }
  }

  return { concurso }
}

// ─── S4-6: crear concurso (entrada pública — valida y delega a createConcursoTx) ─
export async function createConcursoService(body: CreateConcursoBody, usuarioId: string) {
  const cargo = await prisma.cargo.findUnique({ where: { id: body.cargoId } })
  if (!cargo) throw AppError.notFound('Cargo no encontrado')

  const hospital = await prisma.hospital.findUnique({ where: { id: body.hospitalId } })
  if (!hospital) throw AppError.notFound('Hospital no encontrado')

  if (body.tipoConcurso === TipoConcurso.CPH) {
    // PS16D: 'desierto' ya no es un estado — una ronda desierta queda
    // registrada en concursoCphDesierto con estado='activo'+suspendido=true
    const abierto = await prisma.concursoCph.findFirst({
      where: { cargoId: body.cargoId, estado: { not: 'finalizado' }, suspendido: false },
    })
    if (abierto) throw AppError.conflict('Ya existe un concurso CPH abierto para este cargo')
  }

  return prisma.$transaction((tx) => createConcursoTx(tx, body, usuarioId))
}
