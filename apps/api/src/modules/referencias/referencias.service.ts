import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import type {
  RefListQuery,
  AgrupadorBody,
  UnificadorPuestoBody,
  EspecialidadCuilBody,
  AbreviaturaTecnicaBody,
  AbreviaturaTituloBody,
  CorreccionLitPuestoBody,
  CorreccionEspecialidadBody,
  EspecialidadPorPuestoBody,
  ConectorMinusculaBody,
  SufijoOrdinalBody,
} from './referencias.schema.js'

function paginar(query: RefListQuery, limitPorDefecto: number) {
  const limit = Math.min(500, query.limit ?? limitPorDefecto)
  const page = Math.max(1, query.page ?? 1)
  return { skip: (page - 1) * limit, take: limit, page, limit }
}

// P2002 (unique constraint) → 409, P2025 (registro no encontrado en update/delete) → 404.
// Centralizado acá porque las 10 tablas repiten exactamente el mismo mapeo de errores.
async function ejecutar<T>(fn: () => Promise<T>, entidad: string): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const campo = (error.meta?.target as string[] | undefined)?.[0] ?? 'valor'
        throw AppError.conflict(`Ya existe un registro de ${entidad} con ese ${campo}`)
      }
      if (error.code === 'P2025') {
        throw AppError.notFound(`Registro de ${entidad} no encontrado`)
      }
    }
    throw error
  }
}

// ── RefAgrupador ────────────────────────────────────────────────────────────
export async function listAgrupadores(query: RefListQuery) {
  const { skip, take, page, limit } = paginar(query, 500)
  const [rows, total] = await Promise.all([
    prisma.refAgrupador.findMany({ skip, take, orderBy: { agrupador: 'asc' } }),
    prisma.refAgrupador.count(),
  ])
  return { rows, total, page, limit }
}
export async function createAgrupador(body: AgrupadorBody) {
  return ejecutar(
    () =>
      prisma.refAgrupador.create({
        data: {
          cruce: body.cruce,
          escalafon: body.escalafon,
          litPuesto: body.litPuesto,
          agrupador: body.agrupador,
          activo: body.activo,
        },
      }),
    'agrupador'
  )
}
export async function updateAgrupador(id: string, body: Partial<AgrupadorBody>) {
  return ejecutar(() => prisma.refAgrupador.update({ where: { id }, data: body }), 'agrupador')
}
export async function deleteAgrupador(id: string) {
  await ejecutar(() => prisma.refAgrupador.delete({ where: { id } }), 'agrupador')
}

// ── RefUnificadorPuesto ─────────────────────────────────────────────────────
export async function listUnificadoresPuesto(query: RefListQuery) {
  const { skip, take, page, limit } = paginar(query, 500)
  const [rows, total] = await Promise.all([
    prisma.refUnificadorPuesto.findMany({ skip, take, orderBy: { unificador: 'asc' } }),
    prisma.refUnificadorPuesto.count(),
  ])
  return { rows, total, page, limit }
}
export async function createUnificadorPuesto(body: UnificadorPuestoBody) {
  return ejecutar(
    () =>
      prisma.refUnificadorPuesto.create({
        data: {
          cruce: body.cruce,
          litCodReg: body.litCodReg,
          litPuesto: body.litPuesto,
          unificador: body.unificador,
          activo: body.activo,
        },
      }),
    'unificador de puesto'
  )
}
export async function updateUnificadorPuesto(id: string, body: Partial<UnificadorPuestoBody>) {
  return ejecutar(
    () => prisma.refUnificadorPuesto.update({ where: { id }, data: body }),
    'unificador de puesto'
  )
}
export async function deleteUnificadorPuesto(id: string) {
  await ejecutar(() => prisma.refUnificadorPuesto.delete({ where: { id } }), 'unificador de puesto')
}

// ── RefEspecialidadCuil (49k+ filas — con búsqueda, sin ella no es usable) ──
export async function listEspecialidadesCuil(query: RefListQuery) {
  const { skip, take, page, limit } = paginar(query, 50)
  const where = query.search
    ? {
        OR: [
          { cuil: { contains: query.search, mode: 'insensitive' as const } },
          { especialidad: { contains: query.search, mode: 'insensitive' as const } },
          { cuilYRol: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }
    : {}
  const [rows, total] = await Promise.all([
    prisma.refEspecialidadCuil.findMany({ where, skip, take, orderBy: { especialidad: 'asc' } }),
    prisma.refEspecialidadCuil.count({ where }),
  ])
  return { rows, total, page, limit }
}
export async function createEspecialidadCuil(body: EspecialidadCuilBody) {
  return ejecutar(
    () =>
      prisma.refEspecialidadCuil.create({
        data: {
          tipo: body.tipo,
          cuil: body.cuil,
          cuilYRol: body.cuilYRol,
          especialidad: body.especialidad,
          activo: body.activo,
        },
      }),
    'especialidad por CUIL'
  )
}
export async function updateEspecialidadCuil(id: string, body: Partial<EspecialidadCuilBody>) {
  return ejecutar(
    () => prisma.refEspecialidadCuil.update({ where: { id }, data: body }),
    'especialidad por CUIL'
  )
}
export async function deleteEspecialidadCuil(id: string) {
  await ejecutar(() => prisma.refEspecialidadCuil.delete({ where: { id } }), 'especialidad por CUIL')
}

// ── RefAbreviaturaTecnica ───────────────────────────────────────────────────
export async function listAbreviaturasTecnicas(query: RefListQuery) {
  const { skip, take, page, limit } = paginar(query, 500)
  const [rows, total] = await Promise.all([
    prisma.refAbreviaturaTecnica.findMany({ skip, take, orderBy: { sigla: 'asc' } }),
    prisma.refAbreviaturaTecnica.count(),
  ])
  return { rows, total, page, limit }
}
export async function createAbreviaturaTecnica(body: AbreviaturaTecnicaBody) {
  return ejecutar(
    () => prisma.refAbreviaturaTecnica.create({ data: { sigla: body.sigla, activo: body.activo } }),
    'abreviatura técnica'
  )
}
export async function updateAbreviaturaTecnica(id: string, body: Partial<AbreviaturaTecnicaBody>) {
  return ejecutar(
    () => prisma.refAbreviaturaTecnica.update({ where: { id }, data: body }),
    'abreviatura técnica'
  )
}
export async function deleteAbreviaturaTecnica(id: string) {
  await ejecutar(() => prisma.refAbreviaturaTecnica.delete({ where: { id } }), 'abreviatura técnica')
}

// ── RefAbreviaturaTitulo ────────────────────────────────────────────────────
export async function listAbreviaturasTitulo(query: RefListQuery) {
  const { skip, take, page, limit } = paginar(query, 500)
  const [rows, total] = await Promise.all([
    prisma.refAbreviaturaTitulo.findMany({ skip, take, orderBy: { titulo: 'asc' } }),
    prisma.refAbreviaturaTitulo.count(),
  ])
  return { rows, total, page, limit }
}
export async function createAbreviaturaTitulo(body: AbreviaturaTituloBody) {
  return ejecutar(
    () => prisma.refAbreviaturaTitulo.create({ data: { titulo: body.titulo, activo: body.activo } }),
    'abreviatura de título'
  )
}
export async function updateAbreviaturaTitulo(id: string, body: Partial<AbreviaturaTituloBody>) {
  return ejecutar(
    () => prisma.refAbreviaturaTitulo.update({ where: { id }, data: body }),
    'abreviatura de título'
  )
}
export async function deleteAbreviaturaTitulo(id: string) {
  await ejecutar(() => prisma.refAbreviaturaTitulo.delete({ where: { id } }), 'abreviatura de título')
}

// ── RefCorreccionLitPuesto ──────────────────────────────────────────────────
export async function listCorreccionesLitPuesto(query: RefListQuery) {
  const { skip, take, page, limit } = paginar(query, 500)
  const [rows, total] = await Promise.all([
    prisma.refCorreccionLitPuesto.findMany({ skip, take, orderBy: { original: 'asc' } }),
    prisma.refCorreccionLitPuesto.count(),
  ])
  return { rows, total, page, limit }
}
export async function createCorreccionLitPuesto(body: CorreccionLitPuestoBody) {
  return ejecutar(
    () =>
      prisma.refCorreccionLitPuesto.create({
        data: {
          codReg: body.codReg,
          original: body.original,
          correccion: body.correccion,
          activo: body.activo,
        },
      }),
    'corrección de literal de puesto'
  )
}
export async function updateCorreccionLitPuesto(id: string, body: Partial<CorreccionLitPuestoBody>) {
  return ejecutar(
    () => prisma.refCorreccionLitPuesto.update({ where: { id }, data: body }),
    'corrección de literal de puesto'
  )
}
export async function deleteCorreccionLitPuesto(id: string) {
  await ejecutar(
    () => prisma.refCorreccionLitPuesto.delete({ where: { id } }),
    'corrección de literal de puesto'
  )
}

// ── RefCorreccionEspecialidad ───────────────────────────────────────────────
export async function listCorreccionesEspecialidad(query: RefListQuery) {
  const { skip, take, page, limit } = paginar(query, 500)
  const [rows, total] = await Promise.all([
    prisma.refCorreccionEspecialidad.findMany({ skip, take, orderBy: { original: 'asc' } }),
    prisma.refCorreccionEspecialidad.count(),
  ])
  return { rows, total, page, limit }
}
export async function createCorreccionEspecialidad(body: CorreccionEspecialidadBody) {
  return ejecutar(
    () =>
      prisma.refCorreccionEspecialidad.create({
        data: { original: body.original, correccion: body.correccion, activo: body.activo },
      }),
    'corrección de especialidad'
  )
}
export async function updateCorreccionEspecialidad(
  id: string,
  body: Partial<CorreccionEspecialidadBody>
) {
  return ejecutar(
    () => prisma.refCorreccionEspecialidad.update({ where: { id }, data: body }),
    'corrección de especialidad'
  )
}
export async function deleteCorreccionEspecialidad(id: string) {
  await ejecutar(
    () => prisma.refCorreccionEspecialidad.delete({ where: { id } }),
    'corrección de especialidad'
  )
}

// ── RefEspecialidadPorPuesto ────────────────────────────────────────────────
export async function listEspecialidadesPorPuesto(query: RefListQuery) {
  const { skip, take, page, limit } = paginar(query, 500)
  const [rows, total] = await Promise.all([
    prisma.refEspecialidadPorPuesto.findMany({ skip, take, orderBy: { agrupador: 'asc' } }),
    prisma.refEspecialidadPorPuesto.count(),
  ])
  return { rows, total, page, limit }
}
export async function createEspecialidadPorPuesto(body: EspecialidadPorPuestoBody) {
  return ejecutar(
    () =>
      prisma.refEspecialidadPorPuesto.create({
        data: {
          agrupador: body.agrupador,
          especialidad: body.especialidad,
          purezaPct: body.purezaPct,
          activo: body.activo,
        },
      }),
    'especialidad por puesto'
  )
}
export async function updateEspecialidadPorPuesto(id: string, body: Partial<EspecialidadPorPuestoBody>) {
  return ejecutar(
    () => prisma.refEspecialidadPorPuesto.update({ where: { id }, data: body }),
    'especialidad por puesto'
  )
}
export async function deleteEspecialidadPorPuesto(id: string) {
  await ejecutar(
    () => prisma.refEspecialidadPorPuesto.delete({ where: { id } }),
    'especialidad por puesto'
  )
}

// ── RefConectorMinuscula ────────────────────────────────────────────────────
export async function listConectoresMinuscula(query: RefListQuery) {
  const { skip, take, page, limit } = paginar(query, 500)
  const [rows, total] = await Promise.all([
    prisma.refConectorMinuscula.findMany({ skip, take, orderBy: { conector: 'asc' } }),
    prisma.refConectorMinuscula.count(),
  ])
  return { rows, total, page, limit }
}
export async function createConectorMinuscula(body: ConectorMinusculaBody) {
  return ejecutar(
    () => prisma.refConectorMinuscula.create({ data: { conector: body.conector, activo: body.activo } }),
    'conector en minúscula'
  )
}
export async function updateConectorMinuscula(id: string, body: Partial<ConectorMinusculaBody>) {
  return ejecutar(
    () => prisma.refConectorMinuscula.update({ where: { id }, data: body }),
    'conector en minúscula'
  )
}
export async function deleteConectorMinuscula(id: string) {
  await ejecutar(() => prisma.refConectorMinuscula.delete({ where: { id } }), 'conector en minúscula')
}

// ── RefSufijoOrdinal ────────────────────────────────────────────────────────
export async function listSufijosOrdinales(query: RefListQuery) {
  const { skip, take, page, limit } = paginar(query, 500)
  const [rows, total] = await Promise.all([
    prisma.refSufijoOrdinal.findMany({ skip, take, orderBy: { sufijo: 'asc' } }),
    prisma.refSufijoOrdinal.count(),
  ])
  return { rows, total, page, limit }
}
export async function createSufijoOrdinal(body: SufijoOrdinalBody) {
  return ejecutar(
    () => prisma.refSufijoOrdinal.create({ data: { sufijo: body.sufijo, activo: body.activo } }),
    'sufijo ordinal'
  )
}
export async function updateSufijoOrdinal(id: string, body: Partial<SufijoOrdinalBody>) {
  return ejecutar(
    () => prisma.refSufijoOrdinal.update({ where: { id }, data: body }),
    'sufijo ordinal'
  )
}
export async function deleteSufijoOrdinal(id: string) {
  await ejecutar(() => prisma.refSufijoOrdinal.delete({ where: { id } }), 'sufijo ordinal')
}
