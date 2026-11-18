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
import { esCargoGestionable } from './incidencias.gestionable.js'
import { logger } from '../../shared/logger.js'

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
  // Paralelizar: diffs + lookup de bajas (por todos los cuils/idsials del universo
  // gestionable) en simultáneo, sin esperar el parse del primer resultado.
  const [diffs, todasBajasPorPersona, todosCargosConBaja] = await Promise.all([
    prisma.padronDiff.findMany({
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
    }),
    // Traer todos los CUILs que tienen baja (sin filtrar por subset)
    prisma.baja.findMany({
      select: { persona: { select: { cuil: true } } },
    }),
    // Traer todos los idSials de cargos que tienen baja
    prisma.cargo.findMany({
      where: { idSial: { not: null }, bajas: { some: {} } },
      select: { idSial: true },
    }),
  ])

  logger.debug({ total: diffs.length }, 'getPendientesService: diffs traídos de Prisma antes de filtro gestionable')
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
    // Filtro gestionable (FASE 1): un id_sial nuevo solo es incidencia si su
    // carrera cumple la regla de negocio (PLENOS o 83+Anexo II). El código y el
    // literal del puesto vienen del JSON valor_nuevo del diff. Misma fuente de
    // verdad que la pestaña baja-sin-concurso (esCargoGestionable).
    .filter((p) => esCargoGestionable({ codigoRegistro: p.codigoDeRegistro, literalPuesto: p.literalPuesto }))

  logger.debug(
    {
      totalFiltrados: parsed.length,
      codigos: [...new Set(parsed.map((p) => p.codigoDeRegistro ?? '(null)'))],
    },
    'getPendientesService: diffs después de filtro gestionable',
  )

  // tieneBajaAsociada: usa los resultados ya disponibles del Promise.all
  const cuilsConBaja = new Set(
    todasBajasPorPersona.map((b) => b.persona?.cuil).filter((v): v is string => Boolean(v)),
  )
  const idSialsConBaja = new Set(
    todosCargosConBaja.map((c) => c.idSial).filter((v): v is string => Boolean(v)),
  )

  const pendientes = parsed.map((p) => {
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
      diagnostico: null as null,
      tieneBajaAsociada,
    }
  })

  const resumen = {
    total: pendientes.length,
    conConcurso: 0,
    sinConcurso: pendientes.length,
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
