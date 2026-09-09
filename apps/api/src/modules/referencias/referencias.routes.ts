import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import {
  refListQuerySchema,
  agrupadorSchema,
  agrupadorUpdateSchema,
  unificadorPuestoSchema,
  unificadorPuestoUpdateSchema,
  especialidadCuilSchema,
  especialidadCuilUpdateSchema,
  abreviaturaTecnicaSchema,
  abreviaturaTecnicaUpdateSchema,
  abreviaturaTituloSchema,
  abreviaturaTituloUpdateSchema,
  correccionLitPuestoSchema,
  correccionLitPuestoUpdateSchema,
  correccionEspecialidadSchema,
  correccionEspecialidadUpdateSchema,
  especialidadPorPuestoSchema,
  especialidadPorPuestoUpdateSchema,
  conectorMinusculaSchema,
  conectorMinusculaUpdateSchema,
  sufijoOrdinalSchema,
  sufijoOrdinalUpdateSchema,
} from './referencias.schema.js'
import {
  listAgrupadores, createAgrupador, updateAgrupador, deleteAgrupador,
  listUnificadoresPuesto, createUnificadorPuesto, updateUnificadorPuesto, deleteUnificadorPuesto,
  listEspecialidadesCuil, createEspecialidadCuil, updateEspecialidadCuil, deleteEspecialidadCuil,
  listAbreviaturasTecnicas, createAbreviaturaTecnica, updateAbreviaturaTecnica, deleteAbreviaturaTecnica,
  listAbreviaturasTitulo, createAbreviaturaTitulo, updateAbreviaturaTitulo, deleteAbreviaturaTitulo,
  listCorreccionesLitPuesto, createCorreccionLitPuesto, updateCorreccionLitPuesto, deleteCorreccionLitPuesto,
  listCorreccionesEspecialidad, createCorreccionEspecialidad, updateCorreccionEspecialidad, deleteCorreccionEspecialidad,
  listEspecialidadesPorPuesto, createEspecialidadPorPuesto, updateEspecialidadPorPuesto, deleteEspecialidadPorPuesto,
  listConectoresMinuscula, createConectorMinuscula, updateConectorMinuscula, deleteConectorMinuscula,
  listSufijosOrdinales, createSufijoOrdinal, updateSufijoOrdinal, deleteSufijoOrdinal,
} from './referencias.service.js'

// Admin CRUD sobre las 10 tablas de referencia de Dotaneitor (ver
// Doc/Dotaneitor_Analisis.md). Solo rol admin: `requirePermiso` deja pasar a
// admin siempre, y a propósito no se le asigna este permiso a ningún otro rol
// en scripts/seed_referencias_permisos.sql — son tablas técnicas que alimentan
// el pipeline de cruce del padrón semanal, no datos de uso diario por las áreas.
export async function referenciasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.addHook(
    'preHandler',
    requirePermiso({ modulo: 'configuracion', accion: 'gestionar_referencias' })
  )

  // ── /agrupadores ────────────────────────────────────────────────────────
  app.get('/agrupadores', async (request, reply) => {
    const query = refListQuerySchema.parse(request.query)
    return reply.send({ data: await listAgrupadores(query) })
  })
  app.post('/agrupadores', async (request, reply) => {
    const body = agrupadorSchema.parse(request.body)
    return reply.status(201).send({ data: await createAgrupador(body) })
  })
  app.patch<{ Params: { id: string } }>('/agrupadores/:id', async (request, reply) => {
    const body = agrupadorUpdateSchema.parse(request.body)
    return reply.send({ data: await updateAgrupador(request.params.id, body) })
  })
  app.delete<{ Params: { id: string } }>('/agrupadores/:id', async (request, reply) => {
    await deleteAgrupador(request.params.id)
    return reply.send({ ok: true })
  })

  // ── /unificadores-puesto ────────────────────────────────────────────────
  app.get('/unificadores-puesto', async (request, reply) => {
    const query = refListQuerySchema.parse(request.query)
    return reply.send({ data: await listUnificadoresPuesto(query) })
  })
  app.post('/unificadores-puesto', async (request, reply) => {
    const body = unificadorPuestoSchema.parse(request.body)
    return reply.status(201).send({ data: await createUnificadorPuesto(body) })
  })
  app.patch<{ Params: { id: string } }>('/unificadores-puesto/:id', async (request, reply) => {
    const body = unificadorPuestoUpdateSchema.parse(request.body)
    return reply.send({ data: await updateUnificadorPuesto(request.params.id, body) })
  })
  app.delete<{ Params: { id: string } }>('/unificadores-puesto/:id', async (request, reply) => {
    await deleteUnificadorPuesto(request.params.id)
    return reply.send({ ok: true })
  })

  // ── /especialidades-cuil ────────────────────────────────────────────────
  app.get('/especialidades-cuil', async (request, reply) => {
    const query = refListQuerySchema.parse(request.query)
    return reply.send({ data: await listEspecialidadesCuil(query) })
  })
  app.post('/especialidades-cuil', async (request, reply) => {
    const body = especialidadCuilSchema.parse(request.body)
    return reply.status(201).send({ data: await createEspecialidadCuil(body) })
  })
  app.patch<{ Params: { id: string } }>('/especialidades-cuil/:id', async (request, reply) => {
    const body = especialidadCuilUpdateSchema.parse(request.body)
    return reply.send({ data: await updateEspecialidadCuil(request.params.id, body) })
  })
  app.delete<{ Params: { id: string } }>('/especialidades-cuil/:id', async (request, reply) => {
    await deleteEspecialidadCuil(request.params.id)
    return reply.send({ ok: true })
  })

  // ── /abreviaturas-tecnicas ──────────────────────────────────────────────
  app.get('/abreviaturas-tecnicas', async (request, reply) => {
    const query = refListQuerySchema.parse(request.query)
    return reply.send({ data: await listAbreviaturasTecnicas(query) })
  })
  app.post('/abreviaturas-tecnicas', async (request, reply) => {
    const body = abreviaturaTecnicaSchema.parse(request.body)
    return reply.status(201).send({ data: await createAbreviaturaTecnica(body) })
  })
  app.patch<{ Params: { id: string } }>('/abreviaturas-tecnicas/:id', async (request, reply) => {
    const body = abreviaturaTecnicaUpdateSchema.parse(request.body)
    return reply.send({ data: await updateAbreviaturaTecnica(request.params.id, body) })
  })
  app.delete<{ Params: { id: string } }>('/abreviaturas-tecnicas/:id', async (request, reply) => {
    await deleteAbreviaturaTecnica(request.params.id)
    return reply.send({ ok: true })
  })

  // ── /abreviaturas-titulo ────────────────────────────────────────────────
  app.get('/abreviaturas-titulo', async (request, reply) => {
    const query = refListQuerySchema.parse(request.query)
    return reply.send({ data: await listAbreviaturasTitulo(query) })
  })
  app.post('/abreviaturas-titulo', async (request, reply) => {
    const body = abreviaturaTituloSchema.parse(request.body)
    return reply.status(201).send({ data: await createAbreviaturaTitulo(body) })
  })
  app.patch<{ Params: { id: string } }>('/abreviaturas-titulo/:id', async (request, reply) => {
    const body = abreviaturaTituloUpdateSchema.parse(request.body)
    return reply.send({ data: await updateAbreviaturaTitulo(request.params.id, body) })
  })
  app.delete<{ Params: { id: string } }>('/abreviaturas-titulo/:id', async (request, reply) => {
    await deleteAbreviaturaTitulo(request.params.id)
    return reply.send({ ok: true })
  })

  // ── /correcciones-lit-puesto ────────────────────────────────────────────
  app.get('/correcciones-lit-puesto', async (request, reply) => {
    const query = refListQuerySchema.parse(request.query)
    return reply.send({ data: await listCorreccionesLitPuesto(query) })
  })
  app.post('/correcciones-lit-puesto', async (request, reply) => {
    const body = correccionLitPuestoSchema.parse(request.body)
    return reply.status(201).send({ data: await createCorreccionLitPuesto(body) })
  })
  app.patch<{ Params: { id: string } }>('/correcciones-lit-puesto/:id', async (request, reply) => {
    const body = correccionLitPuestoUpdateSchema.parse(request.body)
    return reply.send({ data: await updateCorreccionLitPuesto(request.params.id, body) })
  })
  app.delete<{ Params: { id: string } }>('/correcciones-lit-puesto/:id', async (request, reply) => {
    await deleteCorreccionLitPuesto(request.params.id)
    return reply.send({ ok: true })
  })

  // ── /correcciones-especialidad ──────────────────────────────────────────
  app.get('/correcciones-especialidad', async (request, reply) => {
    const query = refListQuerySchema.parse(request.query)
    return reply.send({ data: await listCorreccionesEspecialidad(query) })
  })
  app.post('/correcciones-especialidad', async (request, reply) => {
    const body = correccionEspecialidadSchema.parse(request.body)
    return reply.status(201).send({ data: await createCorreccionEspecialidad(body) })
  })
  app.patch<{ Params: { id: string } }>('/correcciones-especialidad/:id', async (request, reply) => {
    const body = correccionEspecialidadUpdateSchema.parse(request.body)
    return reply.send({ data: await updateCorreccionEspecialidad(request.params.id, body) })
  })
  app.delete<{ Params: { id: string } }>('/correcciones-especialidad/:id', async (request, reply) => {
    await deleteCorreccionEspecialidad(request.params.id)
    return reply.send({ ok: true })
  })

  // ── /especialidad-por-puesto ────────────────────────────────────────────
  app.get('/especialidad-por-puesto', async (request, reply) => {
    const query = refListQuerySchema.parse(request.query)
    return reply.send({ data: await listEspecialidadesPorPuesto(query) })
  })
  app.post('/especialidad-por-puesto', async (request, reply) => {
    const body = especialidadPorPuestoSchema.parse(request.body)
    return reply.status(201).send({ data: await createEspecialidadPorPuesto(body) })
  })
  app.patch<{ Params: { id: string } }>('/especialidad-por-puesto/:id', async (request, reply) => {
    const body = especialidadPorPuestoUpdateSchema.parse(request.body)
    return reply.send({ data: await updateEspecialidadPorPuesto(request.params.id, body) })
  })
  app.delete<{ Params: { id: string } }>('/especialidad-por-puesto/:id', async (request, reply) => {
    await deleteEspecialidadPorPuesto(request.params.id)
    return reply.send({ ok: true })
  })

  // ── /conectores-minuscula ───────────────────────────────────────────────
  app.get('/conectores-minuscula', async (request, reply) => {
    const query = refListQuerySchema.parse(request.query)
    return reply.send({ data: await listConectoresMinuscula(query) })
  })
  app.post('/conectores-minuscula', async (request, reply) => {
    const body = conectorMinusculaSchema.parse(request.body)
    return reply.status(201).send({ data: await createConectorMinuscula(body) })
  })
  app.patch<{ Params: { id: string } }>('/conectores-minuscula/:id', async (request, reply) => {
    const body = conectorMinusculaUpdateSchema.parse(request.body)
    return reply.send({ data: await updateConectorMinuscula(request.params.id, body) })
  })
  app.delete<{ Params: { id: string } }>('/conectores-minuscula/:id', async (request, reply) => {
    await deleteConectorMinuscula(request.params.id)
    return reply.send({ ok: true })
  })

  // ── /sufijos-ordinales ──────────────────────────────────────────────────
  app.get('/sufijos-ordinales', async (request, reply) => {
    const query = refListQuerySchema.parse(request.query)
    return reply.send({ data: await listSufijosOrdinales(query) })
  })
  app.post('/sufijos-ordinales', async (request, reply) => {
    const body = sufijoOrdinalSchema.parse(request.body)
    return reply.status(201).send({ data: await createSufijoOrdinal(body) })
  })
  app.patch<{ Params: { id: string } }>('/sufijos-ordinales/:id', async (request, reply) => {
    const body = sufijoOrdinalUpdateSchema.parse(request.body)
    return reply.send({ data: await updateSufijoOrdinal(request.params.id, body) })
  })
  app.delete<{ Params: { id: string } }>('/sufijos-ordinales/:id', async (request, reply) => {
    await deleteSufijoOrdinal(request.params.id)
    return reply.send({ ok: true })
  })
}
