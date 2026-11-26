import { TipoConcurso } from '@prisma/client'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type { DimIncidenciasQuery, DimConcursosQuery } from './dim-incidencias.schema.js'

// ─── Incidencias ─────────────────────────────────────────────────────────────

export async function listDimIncidenciasService(q: DimIncidenciasQuery) {
  const where = {
    ...(q.tipo   && { tipo:   q.tipo }),
    ...(q.estado && { estado: q.estado }),
    ...(q.efector        && { efector:        q.efector }),
    ...(q.codigoRegistro && { codigoRegistro: q.codigoRegistro }),
  }

  const [rows, total] = await Promise.all([
    prisma.dimIncidencia.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:  (q.page - 1) * q.limit,
      take:  q.limit,
      include: {
        efectorRel: { select: { nombre: true } },
        sesion:     { select: { fechaArchivo: true } },
        concurso:   { select: { id: true, tipo: true, estado: true } },
      },
    }),
    prisma.dimIncidencia.count({ where }),
  ])

  return { rows, total, page: q.page, limit: q.limit, pages: Math.ceil(total / q.limit) }
}

export async function iniciarConcursoService(
  incidenciaId: string,
  observaciones?: string,
) {
  const inc = await prisma.dimIncidencia.findUnique({ where: { id: incidenciaId } })
  if (!inc) throw AppError.notFound('Incidencia no encontrada')
  if (inc.estado !== 'pendiente') throw AppError.badRequest('La incidencia no está pendiente')
  if (inc.concursoId) throw AppError.badRequest('La incidencia ya tiene un concurso asociado')

  // Determinar tipo de concurso desde dim_gestionables
  const gestionable = await prisma.dimGestionables.findUnique({
    where: { codigoRegistro: inc.codigoRegistro },
  })
  if (!gestionable?.tipoConcurso) {
    throw AppError.badRequest(`La carrera ${inc.codigoRegistro} no tiene tipo de concurso definido`)
  }

  const tipo = gestionable.tipoConcurso.toLowerCase() as TipoConcurso

  const concurso = await prisma.$transaction(async (tx) => {
    const c = await tx.dimConcurso.create({
      data: {
        tipo,
        motivoOrigen: inc.tipo,
        efector:       inc.efector,
        codigoRegistro: inc.codigoRegistro,
        literalPuesto:  inc.literalPuesto,
        especialidad:   inc.especialidad,
        codigoCargo:    inc.codigoCargo,
        observaciones,
        estado: 'no_iniciado',
      },
    })

    // Crear hijo según tipo
    if (tipo === 'cph') {
      await tx.dimConcursoCph.create({ data: { concursoId: c.id } })
    } else {
      await tx.dimConcursoCeetps.create({ data: { concursoId: c.id } })
    }

    // Vincular incidencia → concurso y marcar resuelta
    await tx.dimIncidencia.update({
      where: { id: incidenciaId },
      data:  { estado: 'resuelta', concursoId: c.id },
    })

    return c
  })

  return concurso
}

export async function descartarIncidenciaService(incidenciaId: string, motivo?: string) {
  const inc = await prisma.dimIncidencia.findUnique({ where: { id: incidenciaId } })
  if (!inc) throw AppError.notFound('Incidencia no encontrada')
  if (inc.estado !== 'pendiente') throw AppError.badRequest('La incidencia no está pendiente')

  return prisma.dimIncidencia.update({
    where: { id: incidenciaId },
    data:  { estado: 'descartada', resolucion: motivo ?? null },
  })
}

export async function getDimIncidenciaContextoService(incidenciaId: string) {
  const inc = await prisma.dimIncidencia.findUnique({ where: { id: incidenciaId } })
  if (!inc) throw AppError.notFound('Incidencia no encontrada')

  const [puesto, persona, actividad, arbol, pou, cargo, diffs] = await Promise.all([
    inc.idSialRol
      ? prisma.dimPuestos.findUnique({ where: { idSialRol: inc.idSialRol } })
      : null,
    inc.cuil
      ? prisma.dimPersonas.findUnique({ where: { cuil: inc.cuil } })
      : null,
    inc.idSialRol
      ? prisma.dimActividadHechos.findMany({
          where:   { idSialRol: inc.idSialRol },
          orderBy: { fechaDesde: 'desc' },
          take: 10,
        })
      : [],
    prisma.dimOrganigrama.findFirst({ where: { sigla: inc.efector } }),
    prisma.dimPouOcupacion.findFirst({
      where: { sigla: inc.efector, perfil: inc.literalPuesto },
    }),
    inc.codigoCargo
      ? prisma.dimCargos.findUnique({ where: { codigoCargo: inc.codigoCargo } })
      : prisma.dimCargos.findFirst({
          where: {
            efector:        inc.efector,
            codigoRegistro: inc.codigoRegistro,
            estado:         'validacion_vacante',
            literalPuestoLegacy: { contains: inc.literalPuesto.split(' ')[0], mode: 'insensitive' },
          },
        }),
    inc.idSialRol
      ? prisma.dimCargaDiff.findMany({
          where:   { sesionId: inc.sesionId, clave: inc.idSialRol },
          orderBy: { id: 'asc' },
        })
      : [],
  ])

  return { inc, puesto, persona, actividad, arbol, pou, cargo, diffs }
}

// ─── Análisis de carga ───────────────────────────────────────────────────────

export async function getAnalisisCargaService(sesionId?: string) {
  // Sesión: la indicada o la última completada
  const sesion = sesionId
    ? await prisma.dimCargaSesion.findUnique({ where: { id: sesionId } })
    : await prisma.dimCargaSesion.findFirst({
        where:   { estado: 'completado' },
        orderBy: { createdAt: 'desc' },
      })
  if (!sesion) throw AppError.notFound('Sin sesiones completadas')

  const sid = sesion.id

  const [sesiones, incidencias, puestosModificados, puestosEliminados, actividadCerrada, personasNuevas, cargosVV] = await Promise.all([
    // selector: todas las sesiones completadas
    prisma.dimCargaSesion.findMany({
      where:   { estado: 'completado' },
      orderBy: { createdAt: 'desc' },
      select:  { id: true, tipo: true, fechaArchivo: true, createdAt: true, informe: true },
    }),
    // incidencias pendientes acumuladas (todas las sesiones)
    prisma.dimIncidencia.findMany({
      where:   { estado: 'pendiente' },
      orderBy: { createdAt: 'desc' },
      include: { efectorRel: { select: { nombre: true } }, sesion: { select: { fechaArchivo: true } }, concurso: { select: { id: true, tipo: true, estado: true } } },
    }),
    // puestos con cambios en la sesión seleccionada
    prisma.dimCargaDiff.findMany({
      where:   { sesionId: sid, tablaAfectada: 'dim_puestos', tipoDiff: 'modificado' },
      orderBy: { id: 'asc' },
    }),
    // puestos eliminados del padrón en la sesión seleccionada
    prisma.dimCargaDiff.findMany({
      where:   { sesionId: sid, tablaAfectada: 'dim_puestos', tipoDiff: 'eliminado' },
    }),
    // actividades cerradas en la sesión seleccionada
    prisma.dimCargaDiff.findMany({
      where:   { sesionId: sid, tablaAfectada: 'dim_actividad_hechos', tipoDiff: 'eliminado' },
    }),
    // personas nuevas en la sesión seleccionada
    prisma.dimCargaDiff.findMany({
      where:   { sesionId: sid, tablaAfectada: 'dim_personas', tipoDiff: 'nuevo' },
    }),
    // cargos en validacion_vacante (acumulado)
    prisma.dimCargos.findMany({
      where:   { estado: 'validacion_vacante' },
      orderBy: { codigoCargo: 'asc' },
      select:  { codigoCargo: true, codigoRegistro: true, efector: true, estado: true, subEstado: true, literalPuestoLegacy: true, especialidadLegacy: true },
    }),
  ])

  // Enriquecer puestos modificados/eliminados con datos de dim_puestos
  const clavesModificados = [...new Set(puestosModificados.map((d) => d.clave))]
  const clavesEliminados  = puestosEliminados.map((d) => d.clave)
  const clavesActividad   = actividadCerrada.map((d) => d.clave)

  const [puestosDetalle, puestosEliminadosDetalle, actividadDetalle] = await Promise.all([
    clavesModificados.length
      ? prisma.dimPuestos.findMany({ where: { idSialRol: { in: clavesModificados } } })
      : [],
    clavesEliminados.length
      ? prisma.dimPuestos.findMany({ where: { idSialRol: { in: clavesEliminados } } })
      : [],
    clavesActividad.length
      ? prisma.dimActividadHechos.findMany({ where: { idSialRol: { in: clavesActividad } }, orderBy: { fechaDesde: 'desc' } })
      : [],
  ])

  return {
    sesionActual: sesion,
    sesiones,
    incidencias,
    puestos: {
      modificados: puestosModificados,
      eliminados:  puestosEliminados,
      detalle:     puestosDetalle,
      eliminadosDetalle: puestosEliminadosDetalle,
    },
    actividad: {
      cerradas: actividadCerrada,
      detalle:  actividadDetalle,
    },
    personas: { nuevas: personasNuevas },
    cargosVV,
  }
}

// ─── Concursos ───────────────────────────────────────────────────────────────

export async function listDimConcursosService(q: DimConcursosQuery) {
  const where = {
    ...(q.tipo           && { tipo:           q.tipo }),
    ...(q.estado         && { estado:         q.estado }),
    ...(q.efector        && { efector:        q.efector }),
    ...(q.codigoRegistro && { codigoRegistro: q.codigoRegistro }),
  }

  const [rows, total] = await Promise.all([
    prisma.dimConcurso.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:  (q.page - 1) * q.limit,
      take:  q.limit,
      include: {
        efectorRel: { select: { nombre: true } },
        cph:        true,
        ceetps:     true,
        incidencia: { select: { id: true, tipo: true } },
      },
    }),
    prisma.dimConcurso.count({ where }),
  ])

  return { rows, total, page: q.page, limit: q.limit, pages: Math.ceil(total / q.limit) }
}

export async function getDimConcursoService(id: string) {
  const c = await prisma.dimConcurso.findUnique({
    where: { id },
    include: {
      efectorRel: { select: { nombre: true } },
      cph:        true,
      ceetps:     true,
      incidencia: { select: { id: true, tipo: true, idSialRol: true, cuil: true } },
      sesion:     { select: { fechaArchivo: true } },
    },
  })
  if (!c) throw AppError.notFound('Concurso no encontrado')
  return c
}
