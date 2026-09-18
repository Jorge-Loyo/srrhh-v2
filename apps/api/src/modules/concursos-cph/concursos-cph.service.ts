import { Prisma, type ConcursoCph } from '@prisma/client'
import { parse as parseCsv } from 'csv-parse/sync'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type {
  ConcursosCphQuery,
  PatchConcursoCphBody,
  SuspenderConcursoCphBody,
  DesignarCphBody,
  DeclararDesiertoBody,
} from './concursos-cph.schema.js'
import {
  calcConcursoCph,
  SUB_ESTADO_3_SQL_PG,
  type ConcursoCphCalcInput,
} from './concursosCph.calc.js'
import { crearAutorizacion } from '../autorizaciones/autorizaciones.service.js'
import { crearNotificacion } from '../notificaciones/notificaciones.service.js'

const include = {
  concurso: {
    include: {
      cargo: { include: { hospital: true, codigoRegistro: true } },
      persona: true,
      baja: true,
    },
  },
  hospital: true,
  personaDesignada: true,
  codigoRegistroSolicitado: true,
  // PS16D: historial de rondas desiertas
  desiertoHistorial: { orderBy: { nroRonda: 'asc' as const } },
  // Etiquetas asignadas (relación N:M vía tabla join)
  etiquetas: { include: { etiqueta: true } },
} satisfies Prisma.ConcursoCphInclude

// Aplana la relación join `etiquetas: [{ etiqueta }]` a `etiquetas: Etiqueta[]`
// para que el frontend consuma un array plano. Devuelve el mismo objeto con
// el campo `etiquetas` reemplazado por las etiquetas activas ordenadas.
function flattenEtiquetas<
  T extends { etiquetas?: { etiqueta: { activo: boolean; nombre: string } }[] },
>(row: T): T {
  if (!row?.etiquetas) return row
  const planas = row.etiquetas
    .map((e) => e.etiqueta)
    .filter((e) => e.activo)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return { ...row, etiquetas: planas } as unknown as T
}

// Extrae los campos que usa calcConcursoCph() de una fila completa —
// reutilizado por patch/suspender (ambos parten de la fila existente y
// pisan solo lo que cambió) para no repetir la lista de campos dos veces.
function toCalcInput(row: ConcursoCph): ConcursoCphCalcInput {
  return {
    suspendido: row.suspendido,
    eeBaja: row.eeBaja,
    fechaBaja: row.fechaBaja,
    eeConcurso: row.eeConcurso,
    fechaEeConcurso: row.fechaEeConcurso,
    fechaAutorizacion: row.fechaAutorizacion,
    sorteoJurado: row.sorteoJurado,
    disposicion: row.disposicion,
    fechaInscDesde: row.fechaInscDesde,
    fechaInscHasta: row.fechaInscHasta,
    inscripcionCerrada: row.inscripcionCerrada,
    ordenMeritoConfirmado: row.ordenMeritoConfirmado,
    fechaExamen: row.fechaExamen,
    fechaOrdenMerito: row.fechaOrdenMerito,
    fechaIfacs: row.fechaIfacs,
    fechaInsal: row.fechaInsal,
    eeDesignacion: row.eeDesignacion,
    cargaDocumentacion: row.cargaDocumentacion,
    fechaAptoMedico: row.fechaAptoMedico,
    fechaIte: row.fechaIte,
    proyectoResolucion: row.proyectoResolucion,
    resoALaFirma: row.resoALaFirma,
    resolucionDesignacion: row.resolucionDesignacion,
    fechaResolucion: row.fechaResolucion,
    cargoSial: row.cargoSial,
    dispoDesierta: row.dispoDesierta,
    fechaDispoDesierta: row.fechaDispoDesierta,
  }
}

// ─── S4-1: listado paginado con filtros ─────────────────────────────────────
export async function listConcursosCphService(query: ConcursosCphQuery) {
  const {
    page,
    limit,
    hospitalId,
    cargoId,
    estado,
    subEstado,
    subEstado3,
    suspendido,
    pendienteAutorizacion,
    search,
    conFaltantes,
    especialidad,
    origen,
  } = query
  const offset = (page - 1) * limit

  // subEstado3 depende de la fecha de hoy (ver concursosCph.calc.ts) — el
  // valor guardado puede haberse desactualizado solo con el paso del tiempo,
  // así que se recalcula en SQL al filtrar, mismo patrón que
  // cargos.service.ts usa para resolver ids vía $queryRaw antes del where
  // tipado de Prisma.
  let subEstado3Ids: string[] | undefined
  if (subEstado3) {
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM concursos_cph WHERE (${Prisma.raw(SUB_ESTADO_3_SQL_PG)}) = ${subEstado3}
    `)
    subEstado3Ids = rows.map((r) => r.id)
  }

  // search: busca en campos del concurso Y en la persona de la baja
  // (apellido_nombre, cuil, numero_doc, id_sial_rol de la ocupación)
  let conFaltantesIds: string[] | undefined
  if (conFaltantes) {
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM concursos_cph
      WHERE estado IN ('activo','no_iniciado') AND suspendido = false
        AND (
          (sub_estado IN ('A-AUTZN','B-SORTEO JUR','C-DISPO DE LLAMADO','D-EXAMEN PUBLICADO','E-ORDEN DE MERITO','F-IFACS','G-INSAL','H-TAD','I-CARGA DOCU','J-APTO MED','K-ITE','L-PYCTO DE RESO','M-RESO A LA FIRMA','N-DESIGNADO','O-ALTA SIAL') AND fecha_autorizacion IS NULL)
          OR (sub_estado IN ('C-DISPO DE LLAMADO','D-EXAMEN PUBLICADO','E-ORDEN DE MERITO','F-IFACS','G-INSAL','H-TAD','I-CARGA DOCU','J-APTO MED','K-ITE','L-PYCTO DE RESO','M-RESO A LA FIRMA','N-DESIGNADO','O-ALTA SIAL') AND disposicion IS NULL)
          OR (sub_estado IN ('D-EXAMEN PUBLICADO','E-ORDEN DE MERITO','F-IFACS','G-INSAL','H-TAD','I-CARGA DOCU','J-APTO MED','K-ITE','L-PYCTO DE RESO','M-RESO A LA FIRMA','N-DESIGNADO','O-ALTA SIAL') AND (fecha_insc_desde IS NULL OR fecha_insc_hasta IS NULL))
          OR (sub_estado IN ('E-ORDEN DE MERITO','F-IFACS','G-INSAL','H-TAD','I-CARGA DOCU','J-APTO MED','K-ITE','L-PYCTO DE RESO','M-RESO A LA FIRMA','N-DESIGNADO','O-ALTA SIAL') AND fecha_orden_merito IS NULL)
          OR (sub_estado IN ('F-IFACS','G-INSAL','H-TAD','I-CARGA DOCU','J-APTO MED','K-ITE','L-PYCTO DE RESO','M-RESO A LA FIRMA','N-DESIGNADO','O-ALTA SIAL') AND fecha_ifacs IS NULL)
          OR (sub_estado IN ('G-INSAL','H-TAD','I-CARGA DOCU','J-APTO MED','K-ITE','L-PYCTO DE RESO','M-RESO A LA FIRMA','N-DESIGNADO','O-ALTA SIAL') AND fecha_insal IS NULL)
          OR (sub_estado IN ('H-TAD','I-CARGA DOCU','J-APTO MED','K-ITE','L-PYCTO DE RESO','M-RESO A LA FIRMA','N-DESIGNADO','O-ALTA SIAL') AND ee_designacion IS NULL)
          OR (sub_estado IN ('N-DESIGNADO','O-ALTA SIAL') AND resolucion_designacion IS NULL)
        )
    `)
    conFaltantesIds = rows.map((r) => r.id)
  }

  let searchIds: string[] | undefined
  if (search) {
    const like = `%${search}%`
    const likeNorm = `%${search.replace(/-/g, '')}%`
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT DISTINCT cc.id
      FROM concursos_cph cc
      JOIN concursos c ON c.id = cc.concurso_id
      LEFT JOIN hospitales h ON h.id = cc.hospital_id
      LEFT JOIN cargos ca ON ca.id = c.cargo_id
      LEFT JOIN personas p ON p.id = c.persona_id
      LEFT JOIN ocupaciones o ON o.cargo_id = c.cargo_id
      LEFT JOIN personas p2 ON p2.id = o.persona_id
      WHERE unaccent(cc.ee_baja)                      ILIKE unaccent(${like})
         OR unaccent(cc.ee_concurso)                  ILIKE unaccent(${like})
         OR unaccent(cc.especialidad_solicitada)      ILIKE unaccent(${like})
         OR unaccent(cc.resolucion_designacion)       ILIKE unaccent(${like})
         OR unaccent(coalesce(h.sigla,''))            ILIKE unaccent(${like})
         OR unaccent(coalesce(h.nombre,''))           ILIKE unaccent(${like})
         OR unaccent(coalesce(ca.codigo,''))          ILIKE unaccent(${like})
         OR unaccent(coalesce(ca.literal_puesto,''))  ILIKE unaccent(${like})
         OR unaccent(coalesce(p.apellido_nombre,''))  ILIKE unaccent(${like})
         OR p.cuil                                    ILIKE ${likeNorm}
         OR p.numero_doc                              ILIKE ${like}
         OR unaccent(coalesce(p2.apellido_nombre,'')) ILIKE unaccent(${like})
         OR p2.cuil                                   ILIKE ${likeNorm}
         OR p2.numero_doc                             ILIKE ${like}
         OR o.id_sial_rol                             ILIKE ${like}
    `)
    searchIds = rows.map((r) => r.id)
  }

  // Filtro dedicado por especialidad: busca en la especialidad solicitada del
  // concurso y en la especialidad del cargo (legacy incluida).
  let especialidadIds: string[] | undefined
  if (especialidad) {
    const like = `%${especialidad}%`
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT DISTINCT cc.id
      FROM concursos_cph cc
      JOIN concursos c ON c.id = cc.concurso_id
      LEFT JOIN cargos ca ON ca.id = c.cargo_id
      WHERE unaccent(coalesce(cc.especialidad_solicitada,'')) ILIKE unaccent(${like})
         OR unaccent(coalesce(ca.especialidad_legacy,''))     ILIKE unaccent(${like})
    `)
    especialidadIds = rows.map((r) => r.id)
  }

  // Varios filtros resuelven a un conjunto de ids (subEstado3, search,
  // conFaltantes, especialidad). Como todos aplican sobre `id`, hay que
  // INTERSECTARLOS — antes cada uno escribía `id: { in }` por separado y el
  // último ganaba, ignorando a los demás.
  const idFilters = [subEstado3Ids, searchIds, conFaltantesIds, especialidadIds].filter(
    (x): x is string[] => x !== undefined,
  )
  let idIn: string[] | undefined
  if (idFilters.length > 0) {
    idIn = idFilters.reduce((acc, cur) => acc.filter((id) => cur.includes(id)))
  }

  const where: Prisma.ConcursoCphWhereInput = {
    ...(hospitalId && { hospitalId }),
    ...(cargoId && { cargoId }),
    ...(estado && { estado }),
    ...(subEstado && { subEstado }),
    ...(suspendido !== undefined && { suspendido }),
    ...(pendienteAutorizacion !== undefined && { pendienteAutorizacion }),
    ...(idIn !== undefined && { id: { in: idIn } }),
    // Origen / documentación respaldatoria:
    //  - baja: tiene baja asociada
    //  - ampliacion: sin baja, pero el cargo tiene expediente de alta
    //  - cobertura: sin baja y sin expediente de cargo (sin documentación)
    ...(origen === 'baja' && { concurso: { is: { bajaId: { not: null } } } }),
    ...(origen === 'ampliacion' && {
      concurso: { is: { bajaId: null, cargo: { is: { expediente: { not: null } } } } },
    }),
    ...(origen === 'cobertura' && {
      concurso: { is: { bajaId: null, cargo: { is: { expediente: null } } } },
    }),
  }

  const [total, data] = await Promise.all([
    prisma.concursoCph.count({ where }),
    prisma.concursoCph.findMany({
      where,
      include,
      orderBy: { updatedAt: 'desc' },
      skip: offset,
      take: limit,
    }),
  ])

  return {
    data: data.map(flattenEtiquetas),
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  }
}

// ─── S4-2: detalle completo ──────────────────────────────────────────────────
export async function getConcursoCphByIdService(id: string) {
  const concursoCph = await prisma.concursoCph.findUnique({ where: { id }, include })
  if (!concursoCph) throw AppError.notFound('Concurso CPH no encontrado')
  return flattenEtiquetas(concursoCph)
}

// Campos de tipo fecha del PATCH — explícito en vez de heurística por nombre
// (`key.startsWith('fecha')` se probó y falla para `sorteoJurado`, que es
// fecha pero no arranca con ese prefijo: la columna quedaba con el string
// "YYYY-MM-DD" crudo en vez de un Date, y Prisma lo rechazaba en runtime con
// "premature end of input. Expected ISO-8601 DateTime" — tsc no lo detecta
// porque PatchConcursoCphBody tipa las fechas como `string`, igual que
// cualquier otro campo de texto).
const CAMPOS_FECHA = new Set<keyof PatchConcursoCphBody>([
  'fechaBaja',
  'fechaEeConcurso',
  'fechaAutorizacion',
  'sorteoJurado',
  'fechaInscDesde',
  'fechaInscHasta',
  'fechaExamen',
  'fechaOrdenMerito',
  'fechaIfacs',
  'fechaInsal',
  'fechaAptoMedico',
  'fechaIte',
  'fechaResolucion',
  'fechaDispoDesierta',
])

// ─── S4-3: actualizar campos por fase — estado/subEstado se recalculan ──────
export async function patchConcursoCphService(id: string, body: PatchConcursoCphBody) {
  const existing = await prisma.concursoCph.findUnique({ where: { id }, include })
  if (!existing) throw AppError.notFound('Concurso CPH no encontrado')

  // Detectar cambio de sigla o código de registro (campos que requieren autorización doble: director → sgrasv)
  const cargo = (
    existing.concurso as unknown as {
      cargo?: { hospital?: { sigla?: string }; codigoRegistro?: { id?: string } }
    }
  )?.cargo
  const siglaActual = cargo?.hospital?.sigla ?? ''
  const crIdActual = cargo?.codigoRegistro?.id ?? ''
  const cambiaSigla = body.sigla !== undefined && body.sigla !== siglaActual
  const cambiaCr = body.codigoRegistroId !== undefined && body.codigoRegistroId !== crIdActual
  const requiereAutorizacionDoble = (cambiaSigla || cambiaCr) && !body.pendienteAutorizacion

  // Detectar cambios que requieren solo autorización de SGRASV (sin director)
  const eeConcursoAnterior = existing.eeConcurso
  const eeConcursoCargadoPorPrimeraVez = !eeConcursoAnterior && !!body.eeConcurso
  const eeConcursoModificado =
    !!eeConcursoAnterior && body.eeConcurso !== undefined && body.eeConcurso !== eeConcursoAnterior
  const camposProtegidos: (keyof PatchConcursoCphBody)[] = [
    'especialidadSolicitada',
    'puestoSolicitado',
  ]
  const tieneCambioProtegido =
    !requiereAutorizacionDoble &&
    !existing.pendienteAutorizacion &&
    (eeConcursoModificado || camposProtegidos.some((k) => body[k] !== undefined))
  // Solicitud de autorización de apertura (solo SGRASV): se carga el expediente
  // de concurso por primera vez y hay IF de autorización cargado (en el body o
  // ya existente). Este es el gatillo del paso Etapa 1 → autorización.
  const ifAutorizacionResuelto =
    body.ifAutorizacion !== undefined ? body.ifAutorizacion : existing.ifAutorizacion
  const solicitaAutorizacionApertura =
    !requiereAutorizacionDoble &&
    !tieneCambioProtegido &&
    !existing.pendienteAutorizacion &&
    eeConcursoCargadoPorPrimeraVez &&
    !!ifAutorizacionResuelto
  const requiereAutorizacion =
    requiereAutorizacionDoble || tieneCambioProtegido || solicitaAutorizacionApertura

  const patch: Prisma.ConcursoCphUpdateInput = {}
  for (const [key, value] of Object.entries(body) as [keyof PatchConcursoCphBody, unknown][]) {
    if (value === undefined) continue
    if (key === 'sigla' || key === 'codigoRegistroId') continue // se manejan aparte
    const isFecha = CAMPOS_FECHA.has(key)
    ;(patch as Record<string, unknown>)[key] =
      isFecha && typeof value === 'string' ? new Date(value) : value
  }

  // Si se carga eeConcurso por primera vez, registrar la fecha automáticamente
  if (eeConcursoCargadoPorPrimeraVez && !patch.fechaEeConcurso) {
    patch.fechaEeConcurso = new Date()
  }

  if (requiereAutorizacionDoble) {
    patch.pendienteAutorizacion = true
    patch.siglaSolicitada = body.sigla ?? null
    if (body.codigoRegistroId !== undefined) {
      patch.codigoRegistroSolicitado = body.codigoRegistroId
        ? { connect: { id: body.codigoRegistroId } }
        : { disconnect: true }
    }
  } else if (tieneCambioProtegido || solicitaAutorizacionApertura) {
    patch.pendienteAutorizacion = true
  }

  const merged = toCalcInput({ ...existing, ...(patch as Partial<ConcursoCph>) } as ConcursoCph)
  const calc = calcConcursoCph(merged)

  const updated = await prisma.concursoCph.update({
    where: { id },
    data: {
      ...patch,
      estado: calc.estado,
      subEstado: calc.subEstado,
      subEstado3: calc.subEstado3,
    },
    include,
  })

  // Crear Autorizacion genérica según el tipo de cambio
  if (requiereAutorizacionDoble) {
    // Cambio estructural: director primero, luego sgrasv
    await crearAutorizacion(prisma, {
      tipo: 'concurso_cph',
      referenciaId: id,
      referenciaTipo: 'concurso_cph',
      solicitadoPorId: undefined,
      resolverPorRolSlug: 'director',
    })
  } else if (tieneCambioProtegido || solicitaAutorizacionApertura) {
    // Cambio de especialidad/puesto/eeConcurso modificado, o solicitud de
    // autorización de apertura (eeConcurso + IF cargados): solo sgrasv.
    await crearAutorizacion(prisma, {
      tipo: 'concurso_cph',
      referenciaId: id,
      referenciaTipo: 'concurso_cph',
      solicitadoPorId: undefined,
      resolverPorRolSlug: 'sgrasv',
    })
  } else if (eeConcursoCargadoPorPrimeraVez) {
    // Carga inicial del expediente: notificación informativa a SGRASV (no bloquea)
    const cargoCodigo =
      (existing.concurso as unknown as { cargo?: { codigo?: string } })?.cargo?.codigo ??
      id.slice(0, 8)
    await crearNotificacion({
      tipo: 'autorizacion_pendiente',
      rolSlug: 'sgrasv',
      titulo: `Nuevo expediente de concurso — ${cargoCodigo}`,
      mensaje: `Se cargó el expediente ${body.eeConcurso} para el concurso ${cargoCodigo}. Revisá y validá para habilitar la siguiente etapa.`,
      origenTipo: 'concurso_cph',
      origenId: id,
      origenKey: `ee_concurso_cargado:${id}`,
    })
  }

  return flattenEtiquetas(updated)
}

// ─── Aprobar autorización (flujo dos pasos: director → sgrasv) ──────────────
export async function aprobarAutorizacionCphService(
  id: string,
  rolSlug: string,
  aprobado: boolean,
  observaciones?: string,
) {
  const existing = await prisma.concursoCph.findUnique({ where: { id }, include })
  if (!existing) throw AppError.notFound('Concurso CPH no encontrado')
  if (!existing.pendienteAutorizacion)
    throw AppError.conflict('Este concurso no tiene una autorización pendiente')

  const cargoCodigo =
    (existing.concurso as unknown as { cargo?: { codigo?: string } })?.cargo?.codigo ??
    id.slice(0, 8)

  // Paso 1: director aprueba → notifica a sgrasv para segunda firma
  if (rolSlug === 'director') {
    if (!aprobado) {
      // Director rechaza → limpia todo y notifica a concursales_cph
      await prisma.concursoCph.update({
        where: { id },
        data: {
          pendienteAutorizacion: false,
          aprobadoDirector: false,
          siglaSolicitada: null,
          codigoRegistroSolicitadoId: null,
          ...(observaciones !== undefined && { observaciones }),
        },
        include,
      })
      await crearNotificacion({
        tipo: 'autorizacion_resuelta',
        rolSlug: 'concursales_cph',
        titulo: `Autorización rechazada — ${cargoCodigo}`,
        mensaje: `La modificación del concurso ${cargoCodigo} fue rechazada por el Director.${observaciones ? ` Observación: ${observaciones}` : ''}`,
        origenTipo: 'concurso_cph',
        origenId: id,
        origenKey: `autorizacion_resuelta:cph:${id}:${Date.now()}`,
      })
      return prisma.concursoCph.findUnique({ where: { id }, include })
    }
    // Director aprueba → marca aprobadoDirector y notifica a sgrasv
    const updated = await prisma.concursoCph.update({
      where: { id },
      data: { aprobadoDirector: true, ...(observaciones !== undefined && { observaciones }) },
      include,
    })
    await crearNotificacion({
      tipo: 'autorizacion_pendiente',
      rolSlug: 'sgrasv',
      titulo: `Autorización aprobada por Director — ${cargoCodigo}`,
      mensaje: `El Director aprobó la modificación del concurso ${cargoCodigo}. Requiere segunda firma de SGRASV.`,
      origenTipo: 'concurso_cph',
      origenId: id,
      origenKey: `autorizacion_sgrasv:cph:${id}`,
    })
    return updated
  }

  // Paso 2: sgrasv resuelve definitivamente
  if (rolSlug === 'sgrasv') {
    const requiereDirector = !!(existing.siglaSolicitada || existing.codigoRegistroSolicitadoId)
    if (requiereDirector && !existing.aprobadoDirector) {
      throw AppError.conflict(
        'El Director debe autorizar el cambio de sigla o código de registro antes de que SGRASV pueda resolver',
      )
    }

    return prisma.$transaction(async (tx) => {
      // Si aprueba y hay cambios estructurales pendientes, aplicarlos al cargo
      if (aprobado && requiereDirector) {
        const cargo = (existing.concurso as unknown as { cargo?: { id?: string } })?.cargo
        if (cargo?.id) {
          const cargoUpdate: Record<string, unknown> = {}
          if (existing.siglaSolicitada) {
            const hospital = await tx.hospital.findFirst({
              where: { sigla: existing.siglaSolicitada },
            })
            if (hospital) cargoUpdate.hospitalId = hospital.id
          }
          if (existing.codigoRegistroSolicitadoId) {
            cargoUpdate.codigoRegistroId = existing.codigoRegistroSolicitadoId
          }
          if (Object.keys(cargoUpdate).length > 0) {
            await tx.cargo.update({ where: { id: cargo.id }, data: cargoUpdate })
          }
        }
      }

      const updated = await tx.concursoCph.update({
        where: { id },
        data: {
          pendienteAutorizacion: false,
          aprobadoDirector: false,
          siglaSolicitada: null,
          codigoRegistroSolicitadoId: null,
          ...(observaciones !== undefined && { observaciones }),
        },
        include,
      })

      // Salto de etapas por reutilización de orden de mérito: si al aprobar hay
      // un candidato de OM reservado para este concurso (integrante designado,
      // no anulado), se arrastran los datos de las etapas 2 y 3 del concurso de
      // origen de esa OM, de modo que el concurso salta directo a IFACS/INSAL.
      let resultado = updated
      if (aprobado) {
        const integranteReservado = await tx.ordenMeritoIntegrante.findFirst({
          where: { concursoCphDesignadoId: id, designado: true, anulado: false },
          include: { ordenMerito: true },
        })
        if (integranteReservado) {
          const origen = await tx.concursoCph.findUnique({
            where: { id: integranteReservado.ordenMerito.concursoCphId },
          })
          if (origen) {
            const arrastre = {
              fechaAutorizacion: origen.fechaAutorizacion,
              sorteoJurado: origen.sorteoJurado,
              disposicion: origen.disposicion,
              fechaInscDesde: origen.fechaInscDesde,
              fechaInscHasta: origen.fechaInscHasta,
              inscripcionCerrada: origen.inscripcionCerrada,
              fechaExamen: origen.fechaExamen,
              fechaOrdenMerito: origen.fechaOrdenMerito,
              presentadosConfirmados: origen.presentadosConfirmados,
              ordenMeritoConfirmado: origen.ordenMeritoConfirmado,
            }
            const merged = toCalcInput({ ...updated, ...arrastre } as ConcursoCph)
            const calc = calcConcursoCph(merged)
            resultado = await tx.concursoCph.update({
              where: { id },
              data: {
                ...arrastre,
                estado: calc.estado,
                subEstado: calc.subEstado,
                subEstado3: calc.subEstado3,
              },
              include,
            })
          }
        }
      }

      await crearNotificacion({
        tipo: 'autorizacion_resuelta',
        rolSlug: 'concursales_cph',
        titulo: `Autorización ${aprobado ? 'aprobada' : 'rechazada'} — ${cargoCodigo}`,
        mensaje: `La modificación del concurso ${cargoCodigo} fue ${aprobado ? 'aprobada' : 'rechazada'} por SGRASV.${observaciones ? ` Observación: ${observaciones}` : ''}`,
        origenTipo: 'concurso_cph',
        origenId: id,
        origenKey: `autorizacion_resuelta:cph:${id}:${Date.now()}`,
      })

      return resultado
    })
  }

  throw AppError.forbidden('No tenés permiso para resolver esta autorización')
}

// ─── Persona designada ───────────────────────────────────────────────────────
// Orden: 1) personaDesignadaId (FK directa)
//        2) cargoSial → Cargo.idSial → Ocupacion → Persona  (237 concursos legacy)
//        3) OrdenMeritoIntegrante.designado = true
export async function getPersonaDesignadaService(id: string) {
  const concurso = await prisma.concursoCph.findUnique({
    where: { id },
    select: { personaDesignadaId: true, cargoSial: true },
  })
  if (!concurso) throw AppError.notFound('Concurso CPH no encontrado')

  const sel = {
    id: true,
    cuil: true,
    apellidoNombre: true,
    numeroDoc: true,
    especialidadPrincipal: true,
    telefono: true,
    mailLaboral: true,
  } as const

  // 1. FK directa
  if (concurso.personaDesignadaId) {
    const persona = await prisma.persona.findUnique({
      where: { id: concurso.personaDesignadaId },
      select: sel,
    })
    if (persona) return { fuente: 'persona' as const, persona, cargo: null, integrante: null }
  }

  // 2. cargoSial → Cargo.idSial → Ocupacion → Persona
  if (concurso.cargoSial) {
    const cargoNuevo = await prisma.cargo.findFirst({
      where: { idSial: concurso.cargoSial },
      select: {
        id: true,
        idSial: true,
        codigo: true,
        ocupaciones: {
          select: { personaId: true, situacionRevista: true, estadoPersona: true },
          orderBy: { desde: 'desc' },
          take: 1,
        },
      },
    })
    const ocup = cargoNuevo?.ocupaciones[0]
    if (ocup?.personaId) {
      const persona = await prisma.persona.findUnique({
        where: { id: ocup.personaId },
        select: sel,
      })
      if (persona)
        return {
          fuente: 'cargo_sial' as const,
          persona,
          cargo: {
            codigo: cargoNuevo!.codigo,
            idSial: cargoNuevo!.idSial,
            situacionRevista: ocup.situacionRevista,
          },
          integrante: null,
        }
    }
  }

  // 3. OrdenMeritoIntegrante designado
  const integrante = await prisma.ordenMeritoIntegrante.findFirst({
    where: { concursoCphDesignadoId: id, designado: true },
    include: {
      persona: { select: sel },
      ordenMerito: { select: { id: true, especialidad: true, fechaPublicacion: true } },
    },
    orderBy: { posicion: 'asc' },
  })
  if (integrante)
    return { fuente: 'orden_merito' as const, persona: integrante.persona, cargo: null, integrante }

  throw AppError.notFound(
    concurso.cargoSial
      ? `El cargo SIAL ${concurso.cargoSial} no tiene persona asignada en el sistema`
      : 'Este concurso no tiene persona designada asignada en el sistema',
  )
}

// ─── S4-5: suspender / reanudar ──────────────────────────────────────────────
export async function suspenderConcursoCphService(id: string, body: SuspenderConcursoCphBody) {
  const existing = await prisma.concursoCph.findUnique({ where: { id } })
  if (!existing) throw AppError.notFound('Concurso CPH no encontrado')
  // PS16D-4: solo bloquear finalizado (desierto ya no es estado terminal)
  if (existing.estado === 'finalizado') {
    throw AppError.conflict('No se puede modificar el estado de un concurso finalizado')
  }
  if (existing.suspendido === body.suspendido) {
    throw AppError.conflict(
      body.suspendido ? 'El concurso ya está suspendido' : 'El concurso no está suspendido',
    )
  }

  const merged = toCalcInput({ ...existing, suspendido: body.suspendido })
  const calc = calcConcursoCph(merged)

  return prisma.concursoCph.update({
    where: { id },
    data: {
      suspendido: body.suspendido,
      ...(body.observaciones !== undefined && { observaciones: body.observaciones }),
      estado: calc.estado,
      subEstado: calc.subEstado,
      subEstado3: calc.subEstado3,
    },
    include,
  })
}

// ─── S16-1: registrar designación — crea Ocupacion, avanza a N-DESIGNADO ────
export async function designarConcursoCphService(id: string, body: DesignarCphBody) {
  const concurso = await prisma.concursoCph.findUnique({
    where: { id },
    include: { concurso: { include: { cargo: true } } },
  })
  if (!concurso) throw AppError.notFound('Concurso CPH no encontrado')
  if (concurso.estado === 'finalizado') throw AppError.conflict('El concurso ya está finalizado')
  // PS16D-4: eliminado guard por estado==='desierto' (ya no existe ese estado)

  const persona = await prisma.persona.findUnique({ where: { id: body.personaId } })
  if (!persona) throw AppError.notFound('Persona no encontrada')

  const cargoId = concurso.cargoId

  // Validar que no haya ocupación activa en el cargo
  const ocupActiva = await prisma.ocupacion.findFirst({ where: { cargoId, hasta: null } })
  if (ocupActiva) throw AppError.conflict('El cargo ya tiene una ocupación activa')

  // idSialRol sintético si no se conoce todavía — el padrón siguiente lo sobreescribirá
  const idSialRol = body.idSialRol ?? `MANUAL-${cargoId.slice(0, 8)}-${body.fechaDesde}`

  return prisma.$transaction(async (tx) => {
    // Crear la ocupación
    await tx.ocupacion.create({
      data: {
        personaId: body.personaId,
        cargoId,
        idSialRol,
        desde: new Date(body.fechaDesde),
        hasta: null,
      },
    })

    // Cargo → vigente (ocupado)
    await tx.cargo.update({
      where: { id: cargoId },
      data: { estado: 'vigente', estadoDesde: new Date(body.fechaDesde) },
    })

    // Avanzar sub-estado a N-DESIGNADO y estado a finalizado
    const updated = await tx.concursoCph.update({
      where: { id },
      data: {
        personaDesignadaId: body.personaId,
        subEstado: 'N-DESIGNADO',
        estado: 'finalizado',
        subEstado3: 'G-RESOLUCION',
      },
      include,
    })

    // Notificar al equipo CPH
    const cargoCodigo =
      (concurso.concurso as unknown as { cargo?: { codigo?: string } })?.cargo?.codigo ??
      id.slice(0, 8)
    await crearNotificacion({
      tipo: 'autorizacion_resuelta',
      rolSlug: 'concursales_cph',
      titulo: `Designación registrada — ${cargoCodigo}`,
      mensaje: `${persona.apellidoNombre} fue designado/a en el cargo ${cargoCodigo}.`,
      origenTipo: 'concurso_cph',
      origenId: id,
      origenKey: `designacion_cph:${id}`,
    })

    return updated
  })
}

// ─── Importar CSV de concursos CPH ─────────────────────────────────────────
// Clave de match: ee_concurso (expediente). Si no existe, intenta por cargo_baja (id_sial).
// Actualiza campos sin tocar el flujo de autorizaciones.
export async function importarConcursosCsvService(buffer: Buffer) {
  const rows: Record<string, string>[] = parseCsv(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  })

  function fecha(v: string | undefined): Date | null {
    if (!v || v.trim() === '' || v === 'nan') return null
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  }
  function bool(v: string | undefined): boolean | null {
    if (!v || v.trim() === '') return null
    return v.toLowerCase() === 'true' || v === '1' || v.toLowerCase() === 'si'
  }
  function str(v: string | undefined): string | null {
    if (!v || v.trim() === '' || v === 'nan') return null
    return v.trim()
  }
  function num(v: string | undefined): number | null {
    if (!v || v.trim() === '') return null
    const n = parseInt(v, 10)
    return isNaN(n) ? null : n
  }

  // Pre-cargar todos los id_sial de cargos en memoria para evitar N queries
  const cargosMap = new Map(
    (await prisma.cargo.findMany({ select: { id: true, idSial: true, hospitalId: true } })).map(
      (c) => [c.idSial, c],
    ),
  )

  let actualizados = 0,
    creados = 0,
    noEncontrados = 0

  for (const row of rows) {
    const eeConcurso = str(row['ee_concurso'])
    const cargoBaja = str(row['cargo_baja'])
    const suspendido = bool(row['suspendido'])

    // Buscar el ConcursoCph por ee_concurso o por cargo (id_sial)
    let concursoCph = eeConcurso
      ? await prisma.concursoCph.findFirst({ where: { eeConcurso } })
      : null

    if (!concursoCph && cargoBaja) {
      const cargo = cargosMap.get(cargoBaja)
      if (cargo) {
        concursoCph = await prisma.concursoCph.findFirst({ where: { cargoId: cargo.id } })
      }
    }

    // Si no existe, crear si el cargo está en DB
    if (!concursoCph) {
      const cargo = cargoBaja ? cargosMap.get(cargoBaja) : null
      if (!cargo) {
        noEncontrados++
        continue
      }

      const estadoCsv = str(row['estado'])?.toUpperCase()
      // Solo crear si tiene ee_concurso (mínimo identificador)
      if (!eeConcurso) {
        noEncontrados++
        continue
      }

      const fechaBajaVal = fecha(row['fecha_baja'])
      const eeBajaVal = str(row['ee_baja_ampliacion'])
      const calcInput = {
        suspendido: suspendido ?? estadoCsv === 'SUSPENDIDO',
        eeBaja: eeBajaVal,
        fechaBaja: fechaBajaVal,
        eeConcurso,
        fechaEeConcurso: fecha(row['fecha_ee_concurso']),
        fechaAutorizacion: fecha(row['fecha_autorizacion']),
        sorteoJurado: fecha(row['sorteo_de_jurado']),
        disposicion: str(row['disposicion']),
        fechaInscDesde: fecha(row['fecha_insc_desde']),
        fechaInscHasta: fecha(row['fecha_insc_hasta']),
        inscripcionCerrada: bool(row['inscripcion_cerrada']) ?? false,
        ordenMeritoConfirmado: bool(row['orden_merito_confirmado']) ?? false,
        fechaExamen: fecha(row['fecha_examen']),
        fechaOrdenMerito: fecha(row['fecha_om']),
        fechaIfacs: fecha(row['fecha_ifacs']),
        fechaInsal: fecha(row['fecha_insal']),
        eeDesignacion: str(row['ee_designacion']),
        cargaDocumentacion: bool(row['carga_de_documentacion']),
        fechaAptoMedico: fecha(row['fecha_apto_medico']),
        fechaIte: fecha(row['fecha_ite']),
        proyectoResolucion: bool(row['proyecto_de_resolucion']),
        resoALaFirma: bool(row['reso_a_la_firma']),
        resolucionDesignacion: str(row['resolucion_de_designacion']),
        fechaResolucion: fecha(row['fecha_resolucion']),
        cargoSial: str(row['cargo_sial']),
        dispoDesierta: str(row['dispo_desierta']),
        fechaDispoDesierta: fecha(row['fecha_dispo_desierta']),
      }
      // Si el CSV dice FINALIZADO, forzar estado finalizado independientemente del calc
      const calc = calcConcursoCph(calcInput)
      const estadoFinal = estadoCsv === 'FINALIZADO' ? ('finalizado' as const) : calc.estado

      await prisma.$transaction(async (tx) => {
        const concurso = await tx.concurso.create({
          data: {
            cargoId: cargo.id,
            hospitalId: cargo.hospitalId,
            origen: 'Importado CSV',
            fechaVacante: fechaBajaVal ?? new Date('2000-01-01'),
            tipoConcurso: 'cph',
          },
        })
        concursoCph = await tx.concursoCph.create({
          data: {
            concursoId: concurso.id,
            cargoId: cargo.id,
            hospitalId: cargo.hospitalId,
            eeBaja: eeBajaVal,
            fechaBaja: fechaBajaVal,
            eeConcurso,
            fechaEeConcurso: calcInput.fechaEeConcurso,
            fechaAutorizacion: calcInput.fechaAutorizacion,
            sorteoJurado: calcInput.sorteoJurado,
            disposicion: calcInput.disposicion,
            fechaInscDesde: fecha(row['fecha_insc_desde']),
            fechaInscHasta: calcInput.fechaInscHasta,
            qInscriptos: num(row['q_inscriptos']),
            fechaExamen: calcInput.fechaExamen,
            fechaOrdenMerito: calcInput.fechaOrdenMerito,
            fechaIfacs: calcInput.fechaIfacs,
            insal: str(row['insal']),
            fechaInsal: calcInput.fechaInsal,
            eeDesignacion: calcInput.eeDesignacion,
            cargaDocumentacion: calcInput.cargaDocumentacion,
            fechaAptoMedico: calcInput.fechaAptoMedico,
            fechaIte: calcInput.fechaIte,
            proyectoResolucion: calcInput.proyectoResolucion,
            resoALaFirma: calcInput.resoALaFirma,
            resolucionDesignacion: calcInput.resolucionDesignacion,
            fechaResolucion: calcInput.fechaResolucion,
            cargoSial: calcInput.cargoSial,
            suspendido: calcInput.suspendido ?? false,
            dispoDesierta: calcInput.dispoDesierta,
            fechaDispoDesierta: calcInput.fechaDispoDesierta,
            especialidadSolicitada: str(row['especialidad_solicitada_2']),
            puestoSolicitado: str(row['puesto_2']),
            observaciones: str(row['observaciones']),
            estado: estadoFinal,
            subEstado: calc.subEstado,
            subEstado3: calc.subEstado3,
          },
        })
      })
      creados++
      continue
    }

    // Construir patch con los campos del CSV
    const patch: Prisma.ConcursoCphUpdateInput = {
      ...(eeConcurso && { eeConcurso }),
      ...(fecha(row['fecha_ee_concurso']) && { fechaEeConcurso: fecha(row['fecha_ee_concurso']) }),
      ...(fecha(row['fecha_autorizacion']) && {
        fechaAutorizacion: fecha(row['fecha_autorizacion']),
      }),
      ...(fecha(row['sorteo_de_jurado']) && { sorteoJurado: fecha(row['sorteo_de_jurado']) }),
      ...(str(row['disposicion']) && { disposicion: str(row['disposicion']) }),
      ...(fecha(row['fecha_insc_desde']) && { fechaInscDesde: fecha(row['fecha_insc_desde']) }),
      ...(fecha(row['fecha_insc_hasta']) && { fechaInscHasta: fecha(row['fecha_insc_hasta']) }),
      ...(num(row['q_inscriptos']) !== null && { qInscriptos: num(row['q_inscriptos']) }),
      ...(fecha(row['fecha_examen']) && { fechaExamen: fecha(row['fecha_examen']) }),
      ...(fecha(row['fecha_om']) && { fechaOrdenMerito: fecha(row['fecha_om']) }),
      ...(fecha(row['fecha_ifacs']) && { fechaIfacs: fecha(row['fecha_ifacs']) }),
      ...(str(row['insal']) && { insal: str(row['insal']) }),
      ...(fecha(row['fecha_insal']) && { fechaInsal: fecha(row['fecha_insal']) }),
      ...(str(row['ee_designacion']) && { eeDesignacion: str(row['ee_designacion']) }),
      ...(bool(row['carga_de_documentacion']) !== null && {
        cargaDocumentacion: bool(row['carga_de_documentacion']),
      }),
      ...(fecha(row['fecha_apto_medico']) && { fechaAptoMedico: fecha(row['fecha_apto_medico']) }),
      ...(fecha(row['fecha_ite']) && { fechaIte: fecha(row['fecha_ite']) }),
      ...(fecha(row['fecha_resolucion']) && { fechaResolucion: fecha(row['fecha_resolucion']) }),
      ...(bool(row['proyecto_de_resolucion']) !== null && {
        proyectoResolucion: bool(row['proyecto_de_resolucion']),
      }),
      ...(bool(row['reso_a_la_firma']) !== null && { resoALaFirma: bool(row['reso_a_la_firma']) }),
      ...(str(row['resolucion_de_designacion']) && {
        resolucionDesignacion: str(row['resolucion_de_designacion']),
      }),
      ...(str(row['cargo_sial']) && { cargoSial: str(row['cargo_sial']) }),
      ...(suspendido !== null && { suspendido: suspendido! }),
      ...(str(row['dispo_desierta']) && { dispoDesierta: str(row['dispo_desierta']) }),
      ...(fecha(row['fecha_dispo_desierta']) && {
        fechaDispoDesierta: fecha(row['fecha_dispo_desierta']),
      }),
      ...(str(row['observaciones']) && { observaciones: str(row['observaciones']) }),
      ...(str(row['especialidad_solicitada_2']) && {
        especialidadSolicitada: str(row['especialidad_solicitada_2']),
      }),
      ...(str(row['puesto_2']) && { puestoSolicitado: str(row['puesto_2']) }),
    }

    // Recalcular estado/subEstado
    const merged = { ...concursoCph, ...patch } as unknown as ConcursoCph
    const calc = calcConcursoCph({
      suspendido: merged.suspendido,
      eeBaja: merged.eeBaja,
      fechaBaja: merged.fechaBaja,
      eeConcurso: merged.eeConcurso,
      fechaEeConcurso: merged.fechaEeConcurso,
      fechaAutorizacion: merged.fechaAutorizacion,
      sorteoJurado: merged.sorteoJurado,
      disposicion: merged.disposicion,
      fechaInscDesde: merged.fechaInscDesde,
      fechaInscHasta: merged.fechaInscHasta,
      inscripcionCerrada: merged.inscripcionCerrada,
      ordenMeritoConfirmado: merged.ordenMeritoConfirmado,
      fechaExamen: merged.fechaExamen,
      fechaOrdenMerito: merged.fechaOrdenMerito,
      fechaIfacs: merged.fechaIfacs,
      fechaInsal: merged.fechaInsal,
      eeDesignacion: merged.eeDesignacion,
      cargaDocumentacion: merged.cargaDocumentacion,
      fechaAptoMedico: merged.fechaAptoMedico,
      fechaIte: merged.fechaIte,
      proyectoResolucion: merged.proyectoResolucion,
      resoALaFirma: merged.resoALaFirma,
      resolucionDesignacion: merged.resolucionDesignacion,
      fechaResolucion: merged.fechaResolucion,
      cargoSial: merged.cargoSial,
      dispoDesierta: merged.dispoDesierta,
      fechaDispoDesierta: merged.fechaDispoDesierta,
    })

    await prisma.concursoCph.update({
      where: { id: concursoCph.id },
      data: {
        ...patch,
        estado: calc.estado,
        subEstado: calc.subEstado,
        subEstado3: calc.subEstado3,
      },
    })
    actualizados++
  }

  return { total: rows.length, actualizados, creados, noEncontrados }
}
// Guarda snapshot en ConcursoCphDesierto, limpia campos de la ronda,
// pone suspendido=true y sub-estado Q-DESIERTO.
export async function declararDesiertoService(
  id: string,
  body: DeclararDesiertoBody,
  usuarioId: string,
) {
  const concurso = await prisma.concursoCph.findUnique({ where: { id }, include })
  if (!concurso) throw AppError.notFound('Concurso CPH no encontrado')
  if (concurso.estado === 'finalizado') throw AppError.conflict('El concurso ya está finalizado')

  const nroRonda = (await prisma.concursoCphDesierto.count({ where: { concursoCphId: id } })) + 1

  return prisma.$transaction(async (tx) => {
    await tx.concursoCphDesierto.create({
      data: {
        concursoCphId: id,
        nroRonda,
        dispoDesierta: body.dispoDesierta,
        fechaDispoDesierta: new Date(body.fechaDispoDesierta),
        sorteoJurado: concurso.sorteoJurado,
        disposicion: concurso.disposicion,
        fechaInscDesde: concurso.fechaInscDesde,
        fechaInscHasta: concurso.fechaInscHasta,
        fechaExamen: concurso.fechaExamen,
        fechaOrdenMerito: concurso.fechaOrdenMerito,
        qInscriptos: concurso.qInscriptos,
        eeDesignacion: concurso.eeDesignacion,
        cargaDocumentacion: concurso.cargaDocumentacion,
        fechaAptoMedico: concurso.fechaAptoMedico,
        fechaIte: concurso.fechaIte,
        proyectoResolucion: concurso.proyectoResolucion,
        resoALaFirma: concurso.resoALaFirma,
        resolucionDesignacion: concurso.resolucionDesignacion,
        fechaResolucion: concurso.fechaResolucion,
        cargoSial: concurso.cargoSial,
        observaciones: body.observaciones ?? null,
        registradoPorId: usuarioId,
      },
    })

    return tx.concursoCph.update({
      where: { id },
      data: {
        suspendido: true,
        dispoDesierta: body.dispoDesierta,
        fechaDispoDesierta: new Date(body.fechaDispoDesierta),
        sorteoJurado: null,
        disposicion: null,
        fechaInscDesde: null,
        fechaInscHasta: null,
        fechaExamen: null,
        fechaOrdenMerito: null,
        qInscriptos: null,
        eeDesignacion: null,
        cargaDocumentacion: null,
        fechaAptoMedico: null,
        fechaIte: null,
        proyectoResolucion: null,
        resoALaFirma: null,
        resolucionDesignacion: null,
        fechaResolucion: null,
        cargoSial: null,
        estado: 'suspendido',
        subEstado: 'Q-DESIERTO',
        subEstado3: 'H-DESIERTO',
      },
      include,
    })
  })
}
