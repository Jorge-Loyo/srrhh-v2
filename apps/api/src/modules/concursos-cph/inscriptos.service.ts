// =============================================================================
// Inscriptos al concurso CPH (Etapa 3 — Inscripción / Examen / OM)
// =============================================================================
// Alta manual (uno por uno) o importación de Excel/CSV. La "cantidad de
// inscriptos" del concurso (ConcursoCph.qInscriptos) se AUTOCALCULA contando
// las filas de inscriptos_concurso — no se carga a mano.

import * as XLSX from 'xlsx'
import type { ConcursoCph } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { InscriptoBody, InscriptoPatchBody } from './inscriptos.schema.js'
import { calcConcursoCph } from './concursosCph.calc.js'

function toDate(v: string | null | undefined): Date | null {
  return v ? new Date(v) : null
}

// Recuenta los inscriptos del concurso y persiste qInscriptos (autocalculado).
async function recalcularCantidad(concursoCphId: string) {
  const total = await prisma.inscriptoConcurso.count({ where: { concursoCphId } })
  await prisma.concursoCph.update({ where: { id: concursoCphId }, data: { qInscriptos: total } })
  return total
}

async function assertConcurso(concursoCphId: string) {
  const c = await prisma.concursoCph.findUnique({
    where: { id: concursoCphId },
    select: { id: true },
  })
  if (!c) throw AppError.notFound('Concurso CPH no encontrado')
}

// Lista los inscriptos de un concurso (orden alfabético).
export async function listInscriptosService(concursoCphId: string) {
  await assertConcurso(concursoCphId)
  return prisma.inscriptoConcurso.findMany({
    where: { concursoCphId },
    orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
  })
}

// Alta manual de un inscripto.
export async function createInscriptoService(concursoCphId: string, body: InscriptoBody) {
  await assertConcurso(concursoCphId)
  const inscripto = await prisma.inscriptoConcurso.create({
    data: {
      concursoCphId,
      apellido: body.apellido,
      nombre: body.nombre,
      dni: body.dni ?? null,
      cuil: body.cuil ?? null,
      sexo: body.sexo ?? null,
      fechaNacimiento: toDate(body.fechaNacimiento),
      nacionalidad: body.nacionalidad ?? null,
      telefono: body.telefono ?? null,
      email: body.email ?? null,
      titulo: body.titulo ?? null,
      matricula: body.matricula ?? null,
      especialidad: body.especialidad ?? null,
      observaciones: body.observaciones ?? null,
    },
  })
  await recalcularCantidad(concursoCphId)
  return inscripto
}

// Edición de un inscripto.
export async function updateInscriptoService(
  concursoCphId: string,
  inscriptoId: string,
  body: InscriptoPatchBody,
) {
  const existe = await prisma.inscriptoConcurso.findFirst({
    where: { id: inscriptoId, concursoCphId },
    select: { id: true },
  })
  if (!existe) throw AppError.notFound('Inscripto no encontrado')
  return prisma.inscriptoConcurso.update({
    where: { id: inscriptoId },
    data: {
      ...(body.apellido !== undefined ? { apellido: body.apellido } : {}),
      ...(body.nombre !== undefined ? { nombre: body.nombre } : {}),
      ...(body.dni !== undefined ? { dni: body.dni } : {}),
      ...(body.cuil !== undefined ? { cuil: body.cuil } : {}),
      ...(body.sexo !== undefined ? { sexo: body.sexo } : {}),
      ...(body.fechaNacimiento !== undefined
        ? { fechaNacimiento: toDate(body.fechaNacimiento) }
        : {}),
      ...(body.nacionalidad !== undefined ? { nacionalidad: body.nacionalidad } : {}),
      ...(body.telefono !== undefined ? { telefono: body.telefono } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.titulo !== undefined ? { titulo: body.titulo } : {}),
      ...(body.matricula !== undefined ? { matricula: body.matricula } : {}),
      ...(body.especialidad !== undefined ? { especialidad: body.especialidad } : {}),
      ...(body.presentoExamen !== undefined ? { presentoExamen: body.presentoExamen } : {}),
      ...(body.nota !== undefined ? { nota: body.nota } : {}),
      ...(body.ordenMerito !== undefined ? { ordenMerito: body.ordenMerito } : {}),
      ...(body.observaciones !== undefined ? { observaciones: body.observaciones } : {}),
    },
  })
}

// Baja de un inscripto.
export async function deleteInscriptoService(concursoCphId: string, inscriptoId: string) {
  const existe = await prisma.inscriptoConcurso.findFirst({
    where: { id: inscriptoId, concursoCphId },
    select: { id: true },
  })
  if (!existe) throw AppError.notFound('Inscripto no encontrado')
  await prisma.inscriptoConcurso.delete({ where: { id: inscriptoId } })
  await recalcularCantidad(concursoCphId)
  return { ok: true }
}

// ── Importación Excel/CSV ────────────────────────────────────────────────────
// Acepta .xlsx/.xls/.csv (xlsx.read maneja los tres). Reconoce encabezados de
// forma flexible (acentos, mayúsculas, sinónimos). Solo apellido y nombre son
// obligatorios por fila; las filas sin ambos se ignoran.
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

// Solo campos de texto del inscripto (excluye presentoExamen, que es boolean y
// no viene en la importación — los inscriptos importados aún no se presentaron).
type CampoTextoInscripto = Exclude<keyof InscriptoBody, 'presentoExamen' | 'ordenMerito' | 'nota'>

// Mapa de sinónimos de encabezado → campo del modelo.
const HEADERS: Record<string, CampoTextoInscripto> = {
  apellido: 'apellido',
  apellidos: 'apellido',
  nombre: 'nombre',
  nombres: 'nombre',
  dni: 'dni',
  documento: 'dni',
  'nro documento': 'dni',
  'numero de documento': 'dni',
  cuil: 'cuil',
  cuit: 'cuil',
  sexo: 'sexo',
  genero: 'sexo',
  'fecha de nacimiento': 'fechaNacimiento',
  'fecha nacimiento': 'fechaNacimiento',
  nacimiento: 'fechaNacimiento',
  nacionalidad: 'nacionalidad',
  telefono: 'telefono',
  'telefono celular': 'telefono',
  celular: 'telefono',
  tel: 'telefono',
  email: 'email',
  correo: 'email',
  mail: 'email',
  'correo electronico': 'email',
  titulo: 'titulo',
  matricula: 'matricula',
  'matricula profesional': 'matricula',
  especialidad: 'especialidad',
  observaciones: 'observaciones',
  observacion: 'observaciones',
}

// Convierte un valor de celda de fecha (string o serial de Excel) a YYYY-MM-DD.
function celdaAFecha(v: unknown): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') {
    // Serial de fecha de Excel
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(v).trim()
  // dd/mm/yyyy → yyyy-mm-dd
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return null
}

export async function importarInscriptosService(concursoCphId: string, buffer: Buffer) {
  await assertConcurso(concursoCphId)

  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) throw AppError.badRequest('El archivo no tiene hojas de datos')
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  let creados = 0
  let ignorados = 0
  const datos: InscriptoBody[] = []

  for (const fila of filas) {
    const registro: Partial<Record<CampoTextoInscripto, string>> = {}
    for (const [col, valor] of Object.entries(fila)) {
      const campo = HEADERS[norm(col)]
      if (!campo) continue
      const val = campo === 'fechaNacimiento' ? celdaAFecha(valor) : String(valor ?? '').trim()
      if (val) registro[campo] = val
    }
    if (!registro.apellido || !registro.nombre) {
      ignorados++
      continue
    }
    datos.push({ apellido: registro.apellido, nombre: registro.nombre, ...registro })
  }

  if (datos.length > 0) {
    await prisma.inscriptoConcurso.createMany({
      data: datos.map((d) => ({
        concursoCphId,
        apellido: d.apellido,
        nombre: d.nombre,
        dni: d.dni ?? null,
        cuil: d.cuil ?? null,
        sexo: d.sexo ?? null,
        fechaNacimiento: toDate(d.fechaNacimiento),
        nacionalidad: d.nacionalidad ?? null,
        telefono: d.telefono ?? null,
        email: d.email ?? null,
        titulo: d.titulo ?? null,
        matricula: d.matricula ?? null,
        especialidad: d.especialidad ?? null,
      })),
    })
    creados = datos.length
  }

  const total = await recalcularCantidad(concursoCphId)
  return { creados, ignorados, total }
}

// ── Cierre / reapertura del período de inscripción ───────────────────────────
// Recalcula estado/subEstado del concurso con el mapeo hacia calcConcursoCph.
function recalcCph(c: ConcursoCph) {
  return calcConcursoCph({
    suspendido: c.suspendido,
    eeBaja: c.eeBaja,
    fechaBaja: c.fechaBaja,
    eeConcurso: c.eeConcurso,
    fechaEeConcurso: c.fechaEeConcurso,
    fechaAutorizacion: c.fechaAutorizacion,
    sorteoJurado: c.sorteoJurado,
    disposicion: c.disposicion,
    fechaInscDesde: c.fechaInscDesde,
    fechaInscHasta: c.fechaInscHasta,
    inscripcionCerrada: c.inscripcionCerrada,
    ordenMeritoConfirmado: c.ordenMeritoConfirmado,
    fechaExamen: c.fechaExamen,
    fechaOrdenMerito: c.fechaOrdenMerito,
    fechaIfacs: c.fechaIfacs,
    fechaInsal: c.fechaInsal,
    eeDesignacion: c.eeDesignacion,
    cargaDocumentacion: c.cargaDocumentacion,
    fechaAptoMedico: c.fechaAptoMedico,
    fechaIte: c.fechaIte,
    proyectoResolucion: c.proyectoResolucion,
    resoALaFirma: c.resoALaFirma,
    resolucionDesignacion: c.resolucionDesignacion,
    fechaResolucion: c.fechaResolucion,
    cargoSial: c.cargoSial,
    dispoDesierta: c.dispoDesierta,
    fechaDispoDesierta: c.fechaDispoDesierta,
  })
}

// Cierra el período de inscripción: avanza el sub-estado a "D — Publicación
// Examen" (esperando publicar el examen). Requiere que haya fechas de
// inscripción cargadas y que el examen no esté publicado todavía.
// "Publicar fechas de inscripción": guarda las fechas desde/hasta (si vienen en
// el body) y cierra el período de inscripción, avanzando el sub-estado a
// "D — Publicación Examen".
export async function cerrarInscripcionService(
  concursoCphId: string,
  fechas?: { fechaInscDesde?: string | null; fechaInscHasta?: string | null },
) {
  const c = await prisma.concursoCph.findUnique({ where: { id: concursoCphId } })
  if (!c) throw AppError.notFound('Concurso CPH no encontrado')

  const fechaInscDesde = fechas?.fechaInscDesde ? new Date(fechas.fechaInscDesde) : c.fechaInscDesde
  const fechaInscHasta = fechas?.fechaInscHasta ? new Date(fechas.fechaInscHasta) : c.fechaInscHasta
  if (!fechaInscDesde || !fechaInscHasta) {
    throw AppError.conflict('Cargá las fechas de inscripción (desde y hasta) antes de publicarlas.')
  }
  if (c.fechaExamen)
    throw AppError.conflict('El examen ya fue publicado; las inscripciones ya están cerradas.')
  if (c.inscripcionCerrada)
    throw AppError.conflict('Las fechas de inscripción ya fueron publicadas.')

  const merged = { ...c, fechaInscDesde, fechaInscHasta, inscripcionCerrada: true } as ConcursoCph
  const calc = recalcCph(merged)
  return prisma.concursoCph.update({
    where: { id: concursoCphId },
    data: {
      fechaInscDesde,
      fechaInscHasta,
      inscripcionCerrada: true,
      fechaCierreInscripcion: new Date(),
      estado: calc.estado,
      subEstado: calc.subEstado,
      subEstado3: calc.subEstado3,
    },
  })
}

// "Publicar examen": requiere inscripción publicada. Guarda la fecha de examen
// (si viene en el body) → el sub-estado queda en D con E como próximo pendiente.
export async function publicarExamenService(concursoCphId: string, fechaExamenStr?: string | null) {
  const c = await prisma.concursoCph.findUnique({ where: { id: concursoCphId } })
  if (!c) throw AppError.notFound('Concurso CPH no encontrado')
  if (!c.inscripcionCerrada) throw AppError.conflict('Publicá primero las fechas de inscripción.')
  const fechaExamen = fechaExamenStr ? new Date(fechaExamenStr) : c.fechaExamen
  if (!fechaExamen) throw AppError.conflict('Cargá la fecha de examen antes de publicarla.')
  if (c.fechaExamen) throw AppError.conflict('El examen ya fue publicado.')

  const merged = { ...c, fechaExamen } as ConcursoCph
  const calc = recalcCph(merged)
  return prisma.concursoCph.update({
    where: { id: concursoCphId },
    data: {
      fechaExamen,
      estado: calc.estado,
      subEstado: calc.subEstado,
      subEstado3: calc.subEstado3,
    },
  })
}

// Despublica el examen (revertir): solo si presentados NO están confirmados.
export async function despublicarExamenService(concursoCphId: string) {
  const c = await prisma.concursoCph.findUnique({ where: { id: concursoCphId } })
  if (!c) throw AppError.notFound('Concurso CPH no encontrado')
  if (!c.fechaExamen) throw AppError.conflict('El examen no está publicado.')
  if (c.presentadosConfirmados)
    throw AppError.conflict('Revertí primero la confirmación de presentados.')

  const merged = { ...c, fechaExamen: null } as ConcursoCph
  const calc = recalcCph(merged)
  return prisma.concursoCph.update({
    where: { id: concursoCphId },
    data: {
      fechaExamen: null,
      estado: calc.estado,
      subEstado: calc.subEstado,
      subEstado3: calc.subEstado3,
    },
  })
}

// Reabre el período de inscripción (por si se cerró por error). Solo si el
// examen aún no fue publicado.
export async function reabrirInscripcionService(concursoCphId: string) {
  const c = await prisma.concursoCph.findUnique({ where: { id: concursoCphId } })
  if (!c) throw AppError.notFound('Concurso CPH no encontrado')
  if (!c.inscripcionCerrada) throw AppError.conflict('Las inscripciones no están cerradas.')
  if (c.fechaExamen) throw AppError.conflict('No se puede reabrir: el examen ya fue publicado.')

  const merged = { ...c, inscripcionCerrada: false } as ConcursoCph
  const calc = recalcCph(merged)
  return prisma.concursoCph.update({
    where: { id: concursoCphId },
    data: {
      inscripcionCerrada: false,
      fechaCierreInscripcion: null,
      estado: calc.estado,
      subEstado: calc.subEstado,
      subEstado3: calc.subEstado3,
    },
  })
}

// ── Confirmación de presentados al examen ────────────────────────────────────
// Congela quién se presentó (no se puede editar después). Requiere fecha de
// examen cargada.
export async function confirmarPresentadosService(concursoCphId: string) {
  const c = await prisma.concursoCph.findUnique({ where: { id: concursoCphId } })
  if (!c) throw AppError.notFound('Concurso CPH no encontrado')
  if (!c.fechaExamen)
    throw AppError.conflict('Cargá la fecha de examen antes de confirmar los presentados.')
  if (c.presentadosConfirmados) throw AppError.conflict('Los presentados ya fueron confirmados.')
  return prisma.concursoCph.update({
    where: { id: concursoCphId },
    data: { presentadosConfirmados: true },
  })
}

export async function revertirPresentadosService(concursoCphId: string) {
  const c = await prisma.concursoCph.findUnique({ where: { id: concursoCphId } })
  if (!c) throw AppError.notFound('Concurso CPH no encontrado')
  if (!c.presentadosConfirmados) throw AppError.conflict('Los presentados no están confirmados.')
  if (c.ordenMeritoConfirmado)
    throw AppError.conflict('Revertí primero la confirmación del orden de mérito.')
  return prisma.concursoCph.update({
    where: { id: concursoCphId },
    data: { presentadosConfirmados: false },
  })
}

// ── Confirmación del orden de mérito ─────────────────────────────────────────
// Requiere: presentados confirmados + todos los presentados con posición única
// y sin faltantes. Al confirmar: setea fechaOrdenMerito=hoy, marca el flag y
// recalcula el sub-estado (avanza a E — Orden de mérito).
export async function confirmarOrdenMeritoService(concursoCphId: string) {
  const c = await prisma.concursoCph.findUnique({
    where: { id: concursoCphId },
    include: { concurso: { include: { cargo: true } } },
  })
  if (!c) throw AppError.notFound('Concurso CPH no encontrado')
  if (!c.presentadosConfirmados)
    throw AppError.conflict('Confirmá primero los presentados al examen.')
  if (c.ordenMeritoConfirmado) throw AppError.conflict('El orden de mérito ya fue confirmado.')

  const presentados = await prisma.inscriptoConcurso.findMany({
    where: { concursoCphId, presentoExamen: true },
    orderBy: { ordenMerito: 'asc' },
  })
  if (presentados.length === 0) {
    throw AppError.conflict('No hay inscriptos presentados para armar el orden de mérito.')
  }
  const sinPos = presentados.filter((p) => p.ordenMerito == null)
  if (sinPos.length > 0) {
    throw AppError.conflict(`Faltan asignar ${sinPos.length} posición(es) del orden de mérito.`)
  }
  const posiciones = presentados.map((p) => p.ordenMerito as number)
  if (new Set(posiciones).size !== posiciones.length) {
    throw AppError.conflict('Hay posiciones repetidas en el orden de mérito.')
  }

  // Vigencia del orden de mérito reutilizable: 6 meses desde la publicación (hoy).
  const fechaPublicacion = new Date()
  const fechaVencimiento = new Date(fechaPublicacion)
  fechaVencimiento.setMonth(fechaVencimiento.getMonth() + 6)

  const especialidadOm =
    c.especialidadSolicitada ?? c.concurso?.cargo?.especialidadLegacy ?? 'SIN ESPECIALIDAD'
  const puestoOm = c.puestoSolicitado ?? c.concurso?.cargo?.literalPuesto ?? null

  const merged = { ...c, ordenMeritoConfirmado: true, fechaOrdenMerito: new Date() } as ConcursoCph
  const calc = recalcCph(merged)

  return prisma.$transaction(async (tx) => {
    const actualizado = await tx.concursoCph.update({
      where: { id: concursoCphId },
      data: {
        ordenMeritoConfirmado: true,
        fechaOrdenMerito: fechaPublicacion,
        estado: calc.estado,
        subEstado: calc.subEstado,
        subEstado3: calc.subEstado3,
      },
    })

    // Poblar el documento de orden de mérito reutilizable. Se reemplaza
    // cualquier OM previa de este concurso (idempotente ante reconfirmaciones).
    await tx.ordenMerito.deleteMany({ where: { concursoCphId } })
    await tx.ordenMerito.create({
      data: {
        concursoCphId,
        especialidad: especialidadOm,
        puesto: puestoOm,
        fechaPublicacion,
        fechaVencimiento,
        estado: 'vigente',
        integrantes: {
          create: presentados.map((p) => ({
            cuil: (p.cuil ?? '').replace(/\D/g, '') || '00000000000',
            apellidoNombre: `${p.apellido}, ${p.nombre}`,
            especialidad: p.especialidad,
            posicion: p.ordenMerito as number,
          })),
        },
      },
    })

    return actualizado
  })
}

export async function revertirOrdenMeritoService(concursoCphId: string) {
  const c = await prisma.concursoCph.findUnique({ where: { id: concursoCphId } })
  if (!c) throw AppError.notFound('Concurso CPH no encontrado')
  if (!c.ordenMeritoConfirmado) throw AppError.conflict('El orden de mérito no está confirmado.')

  // No permitir revertir si algún integrante ya fue tomado (designado) por
  // otro concurso — eso rompería la trazabilidad de la reutilización.
  const usados = await prisma.ordenMeritoIntegrante.count({
    where: { ordenMerito: { concursoCphId }, designado: true },
  })
  if (usados > 0) {
    throw AppError.conflict(
      'No se puede revertir: ya hay integrantes de este orden de mérito designados en otros concursos.',
    )
  }

  const merged = { ...c, ordenMeritoConfirmado: false, fechaOrdenMerito: null } as ConcursoCph
  const calc = recalcCph(merged)
  return prisma.$transaction(async (tx) => {
    await tx.ordenMerito.deleteMany({ where: { concursoCphId } })
    return tx.concursoCph.update({
      where: { id: concursoCphId },
      data: {
        ordenMeritoConfirmado: false,
        fechaOrdenMerito: null,
        estado: calc.estado,
        subEstado: calc.subEstado,
        subEstado3: calc.subEstado3,
      },
    })
  })
}

// ── Órdenes de mérito vigentes (reutilizables) ──────────────────────────────
// Lista las OM cuyo estado es vigente/prorrogada y cuya vigencia no expiró
// (fechaVencimiento >= hoy, o fechaProrroga >= hoy si tiene prórroga). Incluye
// los integrantes (con su estado designado/anulado) y el concurso de origen.
// Se agregan contadores de disponibles para la UI.
export async function listOrdenesMeritoVigentesService() {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const ordenes = await prisma.ordenMerito.findMany({
    where: {
      estado: { in: ['vigente', 'prorrogada'] },
      OR: [{ fechaVencimiento: { gte: hoy } }, { fechaProrroga: { gte: hoy } }],
    },
    orderBy: [{ fechaPublicacion: 'desc' }],
    include: {
      integrantes: { orderBy: { posicion: 'asc' } },
      concursoCph: {
        select: {
          id: true,
          especialidadSolicitada: true,
          concurso: {
            select: {
              cargo: {
                select: {
                  codigo: true,
                  literalPuesto: true,
                  especialidadLegacy: true,
                  escalafonId: true,
                  hospital: { select: { sigla: true, nombre: true } },
                },
              },
            },
          },
        },
      },
    },
  })

  // Descartar las que ya no tienen ningún integrante disponible (todos
  // designados o anulados) — dejan de ser reutilizables.
  return ordenes
    .map((o) => {
      const disponibles = o.integrantes.filter((i) => !i.designado && !i.anulado).length
      return { ...o, disponibles }
    })
    .filter((o) => o.disponibles > 0)
}

// ── Reservar un integrante de una orden de mérito compatible ────────────────
// Toma un integrante DISPONIBLE (no designado, no anulado) de una OM vigente
// y compatible (mismo puesto + especialidad + escalafón que el concurso
// destino) y lo "reserva" para ese concurso: marca el integrante como
// designado + concursoCphDesignadoId, y lo registra como persona designada del
// concurso destino (si el integrante está vinculado al padrón). NO finaliza el
// concurso: la designación formal (ocupación) y la terminación son pasos
// aparte.
export async function reservarIntegranteOmService(
  concursoDestinoId: string,
  integranteId: string,
  _usuarioId: string | null,
) {
  const destino = await prisma.concursoCph.findUnique({
    where: { id: concursoDestinoId },
    include: { concurso: { include: { cargo: true } } },
  })
  if (!destino) throw AppError.notFound('Concurso CPH no encontrado')
  if (destino.estado === 'finalizado') throw AppError.conflict('El concurso ya está finalizado')

  const integrante = await prisma.ordenMeritoIntegrante.findUnique({
    where: { id: integranteId },
    include: { ordenMerito: true },
  })
  if (!integrante) throw AppError.notFound('Integrante de orden de mérito no encontrado')
  if (integrante.designado)
    throw AppError.conflict('El integrante ya fue designado en otro concurso')
  if (integrante.anulado) throw AppError.conflict('El integrante está anulado')

  // Vigencia de la OM de origen.
  const om = integrante.ordenMerito
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const vence = om.fechaProrroga ?? om.fechaVencimiento
  if (om.estado === 'vencida' || vence < hoy) {
    throw AppError.conflict('La orden de mérito de origen ya no está vigente')
  }

  // Compatibilidad: mismo puesto + especialidad + escalafón que el destino.
  const cargo = destino.concurso?.cargo
  const especialidadDestino = destino.especialidadSolicitada ?? cargo?.especialidadLegacy ?? null
  const puestoDestino = destino.puestoSolicitado ?? cargo?.literalPuesto ?? null
  const norm = (s: string | null | undefined) =>
    (s ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  if (norm(om.especialidad) !== norm(especialidadDestino)) {
    throw AppError.conflict('La orden de mérito no es compatible: especialidad distinta')
  }
  if (om.puesto && puestoDestino && norm(om.puesto) !== norm(puestoDestino)) {
    throw AppError.conflict('La orden de mérito no es compatible: puesto distinto')
  }

  return prisma.$transaction(async (tx) => {
    await tx.ordenMeritoIntegrante.update({
      where: { id: integranteId },
      data: { designado: true, concursoCphDesignadoId: concursoDestinoId },
    })

    // Registrar la persona designada del concurso destino solo si el integrante
    // está vinculado al padrón (personaDesignadaId es FK a Persona). Si no,
    // la reserva queda registrada por la relación integrantesDesignados.
    if (integrante.personaId) {
      await tx.concursoCph.update({
        where: { id: concursoDestinoId },
        data: { personaDesignadaId: integrante.personaId },
      })
    }

    return tx.ordenMeritoIntegrante.findUnique({
      where: { id: integranteId },
      include: { ordenMerito: true },
    })
  })
}

// Libera una reserva de integrante (revierte designado + concursoCphDesignadoId)
// y limpia la persona designada del concurso destino.
export async function liberarIntegranteOmService(integranteId: string) {
  const integrante = await prisma.ordenMeritoIntegrante.findUnique({
    where: { id: integranteId },
  })
  if (!integrante) throw AppError.notFound('Integrante de orden de mérito no encontrado')
  if (!integrante.designado) throw AppError.conflict('El integrante no está reservado')

  const destinoId = integrante.concursoCphDesignadoId

  return prisma.$transaction(async (tx) => {
    await tx.ordenMeritoIntegrante.update({
      where: { id: integranteId },
      data: { designado: false, concursoCphDesignadoId: null },
    })
    if (destinoId && integrante.personaId) {
      const c = await tx.concursoCph.findUnique({ where: { id: destinoId } })
      if (c?.personaDesignadaId === integrante.personaId) {
        await tx.concursoCph.update({
          where: { id: destinoId },
          data: { personaDesignadaId: null },
        })
      }
    }
    return { ok: true }
  })
}

// Candidato de OM actualmente reservado para un concurso (el integrante con
// concursoCphDesignadoId = concurso y designado=true). Devuelve null si no hay,
// y disponiblesRestantes en la misma OM (para reelegir o declarar desierto).
export async function getCandidatoOmReservadoService(concursoDestinoId: string) {
  const integrante = await prisma.ordenMeritoIntegrante.findFirst({
    where: { concursoCphDesignadoId: concursoDestinoId, designado: true, anulado: false },
    include: { ordenMerito: true },
  })
  if (!integrante) return null
  const disponiblesRestantes = await prisma.ordenMeritoIntegrante.count({
    where: { ordenMeritoId: integrante.ordenMeritoId, designado: false, anulado: false },
  })
  return { integrante, disponiblesRestantes }
}

// Rechaza al integrante reservado: NO aceptó el cargo. Lo marca anulado (ya no
// vuelve a estar disponible), libera la reserva y limpia la persona designada
// del concurso destino. Devuelve cuántos integrantes disponibles quedan en la
// misma orden de mérito (para decidir si se puede reelegir o hay que declarar
// desierto).
export async function rechazarIntegranteOmService(integranteId: string, motivo?: string) {
  const integrante = await prisma.ordenMeritoIntegrante.findUnique({
    where: { id: integranteId },
  })
  if (!integrante) throw AppError.notFound('Integrante de orden de mérito no encontrado')
  if (integrante.anulado) throw AppError.conflict('El integrante ya está anulado')

  const destinoId = integrante.concursoCphDesignadoId

  return prisma.$transaction(async (tx) => {
    await tx.ordenMeritoIntegrante.update({
      where: { id: integranteId },
      data: {
        anulado: true,
        motivoAnulado: motivo?.trim() || 'No aceptó el cargo',
        designado: false,
        concursoCphDesignadoId: null,
      },
    })
    if (destinoId && integrante.personaId) {
      const c = await tx.concursoCph.findUnique({ where: { id: destinoId } })
      if (c?.personaDesignadaId === integrante.personaId) {
        await tx.concursoCph.update({
          where: { id: destinoId },
          data: { personaDesignadaId: null },
        })
      }
    }
    // Disponibles restantes en la misma OM (ni designados ni anulados).
    const disponibles = await tx.ordenMeritoIntegrante.count({
      where: { ordenMeritoId: integrante.ordenMeritoId, designado: false, anulado: false },
    })
    return { ok: true, disponiblesRestantes: disponibles }
  })
}

// Órdenes de mérito COMPATIBLES con un concurso destino (mismo puesto +
// especialidad + escalafón) que tengan integrantes disponibles. Usado en la
// Etapa 4 para ofrecer reutilizar un integrante.
export async function listOmCompatiblesService(concursoDestinoId: string) {
  const destino = await prisma.concursoCph.findUnique({
    where: { id: concursoDestinoId },
    include: { concurso: { include: { cargo: true } } },
  })
  if (!destino) throw AppError.notFound('Concurso CPH no encontrado')

  const cargo = destino.concurso?.cargo
  const especialidadDestino = destino.especialidadSolicitada ?? cargo?.especialidadLegacy ?? null
  const puestoDestino = destino.puestoSolicitado ?? cargo?.literalPuesto ?? null
  const norm = (s: string | null | undefined) =>
    (s ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()

  const vigentes = await listOrdenesMeritoVigentesService()
  return vigentes.filter((o) => {
    if (o.concursoCphId === concursoDestinoId) return false
    if (norm(o.especialidad) !== norm(especialidadDestino)) return false
    // Puesto: si ambos tienen puesto, deben coincidir; si el destino no lo
    // define, no se exige.
    if (o.puesto && puestoDestino && norm(o.puesto) !== norm(puestoDestino)) return false
    return true
  })
}
