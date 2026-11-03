import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { createConcursoTx } from '../concursos/concursos.service.js'
import type { CreateConcursoBody } from '../concursos/concursos.schema.js'
import type { CrearConcursoParaIdSialBody } from './incidencias.schema.js'
import {
  aprobarDiffNuevoService,
  marcarTransferenciaService,
  rechazarDiffNuevoService,
  buscarConcursosParaDiffService,
  diagnosticarDiffsNuevosService,
  aprobarTodosDiffsPendientesService,
  getAprobacionProgreso,
} from '../padron/padron.service.js'

// ─── Re-exportación de los servicios de acción del padrón ───────────────────
// Los 6 servicios de acción + getAprobacionProgreso quedan accesibles desde
// este módulo (reexportados — ver context/plan: moverlos arrastraría una gran
// superficie de helpers/tipos privados del aprobar y sus dependencias cruzadas
// con esValidableContraConcurso/resolverConcursoDesignadoPorCuil, que SE QUEDAN
// en padron; reexportar es la alternativa aceptable que compila más limpio y no
// rompe las rutas viejas del padrón). La lógica Opción A §5.3 (padron_historico
// + KPI del mes de gestión) ya vive dentro de aprobarDiffNuevoService en
// padron.service.ts, así que se hereda tal cual acá.
export {
  aprobarDiffNuevoService,
  marcarTransferenciaService,
  rechazarDiffNuevoService,
  buscarConcursosParaDiffService,
  diagnosticarDiffsNuevosService,
  aprobarTodosDiffsPendientesService,
  getAprobacionProgreso,
}

// ─── Resolución de snapshotId por diffId ────────────────────────────────────
// El módulo trabaja por diffId; las firmas de los servicios del padrón esperan
// (snapshotId, diffId, ...). Se resuelve el snapshotId leyendo el diff (no se
// cambian las firmas, para no romper las rutas viejas del padrón).
async function snapshotIdDeDiff(diffId: string): Promise<string> {
  const diff = await prisma.padronDiff.findUnique({
    where: { id: diffId },
    select: { snapshotId: true },
  })
  if (!diff) throw AppError.notFound('Diff no encontrado')
  return diff.snapshotId
}

// Crear cargo para un id_sial nuevo (opcionalmente vinculando un concurso CPH
// existente). Delega en aprobarDiffNuevoService, que ya escribe padron_historico
// + repuebla el KPI del mes de gestión (Opción A §5.3).
export async function crearCargoParaIdSialService(
  diffId: string,
  usuarioId: string,
  vincularConcursoId?: string,
) {
  const snapshotId = await snapshotIdDeDiff(diffId)
  return aprobarDiffNuevoService(snapshotId, diffId, usuarioId, vincularConcursoId)
}

// Marcar un id_sial nuevo como transferencia de otro ministerio.
export async function transferenciaParaIdSialService(diffId: string, usuarioId: string) {
  const snapshotId = await snapshotIdDeDiff(diffId)
  return marcarTransferenciaService(snapshotId, diffId, usuarioId)
}

// Dejar un id_sial nuevo "sin código" (rechazado): crea el cargo sin código y
// NO escribe histórico/KPI (no cuenta hasta gestionar como cargo real).
export async function sinCodigoParaIdSialService(diffId: string) {
  const snapshotId = await snapshotIdDeDiff(diffId)
  return rechazarDiffNuevoService(snapshotId, diffId)
}

// Buscar concursos CPH candidatos para vincular a un id_sial nuevo.
export async function buscarConcursosParaIdSialService(diffId: string, q?: string) {
  const snapshotId = await snapshotIdDeDiff(diffId)
  return buscarConcursosParaDiffService(snapshotId, diffId, q)
}

// CUIL puro (11 dígitos) desde el `cuil_y_rol` del padrón — mismo criterio que
// cuilDe() en padron.service.ts (privado allí; replicado acá para no ampliar la
// superficie exportada del padrón).
function cuilDeDatos(datos: Record<string, string>): string | undefined {
  return datos.cuil_y_rol ? datos.cuil_y_rol.split('-')[0] : undefined
}

// Datos parseados de un diff "nuevo" (valorNuevo es el JSON del registro del
// padrón para el id_sial).
interface PendienteParsed {
  diffId: string
  snapshotId: string
  idSialRol: string
  idSial: string | null
  cuil: string | null
  ayn: string | null
  siglas: string | null
  escalafon: string | null
  literalPuesto: string | null
  codigoDeRegistro: string | null
  especialidad: string | null
  fechaAsignada: Date
}

// ─── §4.2 — Cola de id_sial nuevos pendientes de gestión ────────────────────
// Diffs tipo='nuevo' con aprobado IS NULL, de snapshots estado='aprobado', con
// campo IS DISTINCT FROM '__alta_desdoblada__' (INCLUYE campo=null; los
// desdoblados 24/07 se materializan solo al aprobar el snapshot, no se gestionan
// acá). Orden por snapshot.fechaAsignada DESC.
//
// OJO Prisma: `campo: { not: '__alta_desdoblada__' }` sobre un nullable NO trae
// los campo=null (semántica SQL de `<> ...`). Por eso el WHERE se expresa como
// OR explícito { campo: null } | { campo: { not: '__alta_desdoblada__' } }, que
// replica `IS DISTINCT FROM`.
export async function getPendientesService() {
  const diffs = await prisma.padronDiff.findMany({
    where: {
      tipo: 'nuevo',
      aprobado: null,
      snapshot: { estado: 'aprobado' },
      OR: [{ campo: null }, { campo: { not: '__alta_desdoblada__' } }],
    },
    select: {
      id: true,
      snapshotId: true,
      idSialRol: true,
      valorNuevo: true,
      snapshot: { select: { fechaAsignada: true } },
    },
    orderBy: { snapshot: { fechaAsignada: 'desc' } },
  })

  const parsed: PendienteParsed[] = diffs.map((d) => {
    const datos: Record<string, string> = JSON.parse(d.valorNuevo ?? '{}')
    return {
      diffId: d.id,
      snapshotId: d.snapshotId,
      idSialRol: d.idSialRol,
      idSial: (datos.id_sial as string | undefined) ?? null,
      cuil: cuilDeDatos(datos) ?? null,
      ayn: (datos.ayn as string | undefined) ?? null,
      siglas: (datos.siglas as string | undefined) ?? null,
      escalafon: (datos.escalafon as string | undefined) ?? null,
      literalPuesto: (datos.literal_puesto as string | undefined) ?? null,
      codigoDeRegistro: (datos.codigo_de_registro as string | undefined) ?? null,
      especialidad: (datos.especialidad as string | undefined) ?? null,
      fechaAsignada: d.snapshot.fechaAsignada,
    }
  })

  // Diagnóstico (concursoCphId/clasificacion) reusando diagnosticarDiffsNuevosService
  // por snapshot (un solo llamado por snapshot distinto). Se indexa por diffId.
  const snapshotIds = [...new Set(parsed.map((p) => p.snapshotId))]
  const diagnosticoPorDiff = new Map<
    string,
    { clasificacion: string; concursoCphId: string | null; concursoCodigo: string | null }
  >()
  for (const snapshotId of snapshotIds) {
    const diag = await diagnosticarDiffsNuevosService(snapshotId)
    for (const d of diag.detalle) {
      // El detalle de diagnosticarDiffsNuevosService no expone diffId; se cruza
      // por idSialRol (único por diff dentro del snapshot).
      diagnosticoPorDiff.set(`${snapshotId}:${d.idSialRol}`, {
        clasificacion: d.clasificacion,
        concursoCphId: d.concursoCphId,
        concursoCodigo: d.concursoCodigo,
      })
    }
  }

  // tieneBajaAsociada: existe una Baja para la persona (por CUIL) o para el
  // cargo que comparte el id_sial del diff. Un id_sial nuevo todavía no tiene
  // cargo propio, así que el cruce relevante es por persona (la vacante que
  // deja su baja) y, si el id_sial matchea un cargo existente, por ese cargo.
  const cuils = [...new Set(parsed.map((p) => p.cuil).filter((v): v is string => Boolean(v)))]
  const idSials = [...new Set(parsed.map((p) => p.idSial).filter((v): v is string => Boolean(v)))]

  const [bajasPorPersona, cargosPorIdSial] = await Promise.all([
    cuils.length > 0
      ? prisma.baja.findMany({
          where: { persona: { cuil: { in: cuils } } },
          select: { persona: { select: { cuil: true } } },
        })
      : Promise.resolve([] as Array<{ persona: { cuil: string } | null }>),
    idSials.length > 0
      ? prisma.cargo.findMany({
          where: { idSial: { in: idSials } },
          select: { idSial: true, bajas: { select: { id: true }, take: 1 } },
        })
      : Promise.resolve([] as Array<{ idSial: string; bajas: Array<{ id: string }> }>),
  ])

  const cuilsConBaja = new Set(
    bajasPorPersona.map((b) => b.persona?.cuil).filter((v): v is string => Boolean(v)),
  )
  const idSialsConBaja = new Set(
    cargosPorIdSial.filter((c) => c.bajas.length > 0).map((c) => c.idSial),
  )

  const pendientes = parsed.map((p) => {
    const diag = diagnosticoPorDiff.get(`${p.snapshotId}:${p.idSialRol}`) ?? null
    const tieneBajaAsociada =
      (p.cuil ? cuilsConBaja.has(p.cuil) : false) ||
      (p.idSial ? idSialsConBaja.has(p.idSial) : false)
    return {
      diffId: p.diffId,
      snapshotId: p.snapshotId,
      idSialRol: p.idSialRol,
      fechaAsignada: p.fechaAsignada,
      valorNuevo: {
        idSial: p.idSial,
        cuil: p.cuil,
        ayn: p.ayn,
        siglas: p.siglas,
        escalafon: p.escalafon,
        literalPuesto: p.literalPuesto,
        codigoDeRegistro: p.codigoDeRegistro,
        especialidad: p.especialidad,
      },
      diagnostico: diag,
      tieneBajaAsociada,
    }
  })

  const resumen = {
    total: pendientes.length,
    conConcurso: pendientes.filter((p) => p.diagnostico?.concursoCphId != null).length,
    sinConcurso: pendientes.filter((p) => p.diagnostico?.concursoCphId == null).length,
    conBajaAsociada: pendientes.filter((p) => p.tieneBajaAsociada).length,
  }

  return { pendientes, resumen }
}

// ─── Crear un concurso para un id_sial nuevo sin concurso ───────────────────
// Envuelve createConcursoTx (concursos.service.ts) en una $transaction: resuelve
// cargoId (por id_sial del diff) y hospitalId (por sigla del diff), arma el
// CreateConcursoBody con el input del usuario y marca el diff como gestionado
// (aprobado=true, resolucion='concurso_creado'). Mismo patrón que bajas.service.
export async function crearConcursoParaIdSialService(
  diffId: string,
  body: CrearConcursoParaIdSialBody,
  usuarioId: string,
) {
  const diff = await prisma.padronDiff.findUnique({ where: { id: diffId } })
  if (!diff) throw AppError.notFound('Diff no encontrado')
  if (diff.tipo !== 'nuevo')
    throw AppError.badRequest('Solo se puede crear concurso para diffs de tipo nuevo')
  if (diff.campo === '__alta_desdoblada__')
    throw AppError.badRequest(
      'Un alta desdoblada (Residencias 24 / Docentes 07) no se gestiona individualmente',
    )

  const datos: Record<string, string> = JSON.parse(diff.valorNuevo ?? '{}')

  // Resolver el cargo a concursar por id_sial del diff.
  const cargo = datos.id_sial
    ? await prisma.cargo.findUnique({ where: { idSial: datos.id_sial }, select: { id: true } })
    : null
  if (!cargo)
    throw AppError.badRequest(
      'No existe un cargo para este id_sial; creá el cargo antes de concursarlo',
    )

  // Resolver el hospital por sigla del diff.
  const hospital = datos.siglas
    ? await prisma.hospital.findUnique({ where: { sigla: datos.siglas }, select: { id: true } })
    : null
  if (!hospital) throw AppError.badRequest(`Hospital no encontrado (${datos.siglas ?? ''})`)

  const concursoBody: CreateConcursoBody = {
    cargoId: cargo.id,
    hospitalId: hospital.id,
    origen: body.origen,
    fechaVacante: body.fechaVacante,
    tipoConcurso: body.tipoConcurso,
    motivo: body.motivo,
    expediente: body.expediente,
    motivoConcurso: body.motivoConcurso,
    especialidadSolicitada: body.especialidadSolicitada,
    eeBaja: body.eeBaja,
    fechaBaja: body.fechaBaja,
    escalafonId: body.escalafonId,
    puestoSolicitado: body.puestoSolicitado,
  }

  const resultado = await prisma.$transaction(async (tx) => {
    const concurso = await createConcursoTx(tx, concursoBody, usuarioId)
    await tx.padronDiff.update({
      where: { id: diffId },
      data: { aprobado: true, resolucion: 'concurso_creado' },
    })
    return concurso
  })

  return { ok: true, diffId, concurso: resultado }
}
