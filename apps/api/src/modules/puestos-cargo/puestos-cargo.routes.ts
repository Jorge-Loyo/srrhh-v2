import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { prisma } from '../../shared/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'

const crearPuestoSchema = z.object({
  escalafonId: z.string().uuid(),
  nombre: z.string().trim().min(1).max(200),
  modalidad: z.enum(['pof', 'pou', 'ambos']),
  tipoPuesto: z.enum(['ejecucion', 'conduccion']).default('ejecucion'),
})

const editarPuestoSchema = z.object({
  nombre: z.string().trim().min(1).max(200).optional(),
  activo: z.boolean().optional(),
  tipoPuesto: z.enum(['ejecucion', 'conduccion']).optional(),
  pendienteCurar: z.boolean().optional(),
})

const crearEspecialidadSchema = z.object({
  puestoCargId: z.string().uuid(),
  nombre: z.string().trim().min(1).max(200),
})

const editarEspecialidadSchema = z.object({
  nombre: z.string().trim().min(1).max(200).optional(),
  activo: z.boolean().optional(),
})

export async function puestosCargoRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /puestos-cargo?escalafonId=&modalidad=pof|pou|ambos&tipoPuesto=ejecucion|conduccion
  app.get('/', async (request, reply) => {
    const { escalafonId, modalidad, tipoPuesto } = request.query as {
      escalafonId?: string
      modalidad?: 'pof' | 'pou' | 'ambos'
      tipoPuesto?: 'ejecucion' | 'conduccion'
    }

    // Para pof/pou: primero intentar puestos propios de esa modalidad.
    // Si no hay (ej: CEETPS que usa 'ambos'), incluir también 'ambos'.
    // Para estructura: solo 'ambos'.
    let modalidadFilter: object = {}
    if (modalidad === 'ambos') {
      modalidadFilter = { modalidad: 'ambos' }
    } else if (modalidad) {
      // Verificar si hay puestos propios de esta modalidad para este escalafón
      const tienePropios = escalafonId
        ? await prisma.puestoCargo.count({ where: { activo: true, escalafonId, modalidad } })
        : 1 // sin filtro de escalafón, incluir ambos
      modalidadFilter = tienePropios > 0
        ? { modalidad }
        : { modalidad: { in: [modalidad, 'ambos'] } }
    }

    const rows = await prisma.puestoCargo.findMany({
      where: {
        activo: true,
        ...(escalafonId && { escalafonId }),
        ...modalidadFilter,
      },
      select: {
        id: true, nombre: true, modalidad: true, tipoPuesto: true, escalafonId: true,
        escalafon: { select: { nombre: true } },
      },
      orderBy: { nombre: 'asc' },
    })

    const filtrados = tipoPuesto === 'ejecucion'
      ? rows.filter((r) => r.modalidad !== 'ambos')
      : tipoPuesto === 'conduccion'
        ? rows.filter((r) => r.modalidad === 'ambos')
        : rows
    // S20-11: el combobox necesita el id real para mandar puestoCargoId al
    // backend — antes solo devolvía el nombre.
    // S21: se agregan escalafonId/escalafonNombre/modalidad para el buscador
    // libre de /dotacion (elegir puesto sin cascada, distinguir homónimos).
    return reply.send({
      data: filtrados.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        escalafonId: r.escalafonId,
        escalafonNombre: r.escalafon?.nombre ?? null,
        modalidad: r.modalidad,
      })),
    })
  })

  // POST /puestos-cargo — S20-12: alta manual de puesto en el catálogo
  app.post('/', { preHandler: requirePermiso({ modulo: 'cargos', accion: 'crear' }) }, async (request, reply) => {
    const body = crearPuestoSchema.parse(request.body)
    const creado = await prisma.puestoCargo.create({
      data: {
        escalafonId: body.escalafonId,
        nombre: body.nombre,
        modalidad: body.modalidad,
        tipoPuesto: body.tipoPuesto,
      },
    })
    return reply.status(201).send({ data: creado })
  })

  // PUT /puestos-cargo/:id — S20-12: editar nombre/activo/tipoPuesto, o
  // marcar pendienteCurar=false una vez revisado un puesto auto-creado por
  // el import del padrón (S20-6).
  app.put('/:id', { preHandler: requirePermiso({ modulo: 'cargos', accion: 'editar' }) }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = editarPuestoSchema.parse(request.body)
    const existente = await prisma.puestoCargo.findUnique({ where: { id } })
    if (!existente) throw AppError.notFound('Puesto no encontrado')
    const actualizado = await prisma.puestoCargo.update({ where: { id }, data: body })
    return reply.send({ data: actualizado })
  })

  // GET /puestos-cargo/especialidades?escalafonId=&nombre=
  // Con `nombre`: especialidades de ESE puesto puntual.
  // Sin `nombre` (solo `escalafonId`): unión de especialidades de TODOS los
  // puestos de ese escalafón — usado para ampliar la búsqueda de jurado a
  // otras especialidades además de la propia del puesto a concursar (un
  // puesto puntual suele tener 1 sola especialidad cargada, insuficiente para
  // ofrecer alternativas).
  app.get('/especialidades', async (request, reply) => {
    const { escalafonId, nombre, puestoCargoId } = request.query as {
      escalafonId?: string
      nombre?: string
      puestoCargoId?: string
    }

    // Camino preferido para FILTROS: especialidades del puesto EXACTO por su
    // id. Con `nombre` (abajo) hay puestos homónimos entre escalafones/modalidades
    // y `findFirst` devolvía las especialidades de OTRO puesto → el filtro por
    // especialidad no coincidía con la FK real del cargo (bug S21).
    if (puestoCargoId) {
      const especialidades = await prisma.especialidadPuesto.findMany({
        where: { activo: true, puestoCargId: puestoCargoId },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      })
      return reply.send({ data: especialidades.map((e) => ({ id: e.id, nombre: e.nombre })) })
    }

    if (!nombre) {
      if (!escalafonId) return reply.send({ data: [] })
      const rows = await prisma.especialidadPuesto.findMany({
        where: { activo: true, puesto: { activo: true, escalafonId } },
        select: { id: true, nombre: true },
        distinct: ['nombre'],
        orderBy: { nombre: 'asc' },
      })
      return reply.send({ data: rows.map((r) => ({ id: r.id, nombre: r.nombre })) })
    }

    const puesto = await prisma.puestoCargo.findFirst({
      where: {
        activo: true,
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(escalafonId && { escalafonId }),
      },
      include: {
        especialidades: {
          where: { activo: true },
          select: { id: true, nombre: true },
          orderBy: { nombre: 'asc' },
        },
      },
    })

    return reply.send({ data: puesto?.especialidades.map((e) => ({ id: e.id, nombre: e.nombre })) ?? [] })
  })

  // POST /puestos-cargo/especialidades — S20-12: alta manual de especialidad
  app.post('/especialidades', { preHandler: requirePermiso({ modulo: 'cargos', accion: 'crear' }) }, async (request, reply) => {
    const body = crearEspecialidadSchema.parse(request.body)
    const puesto = await prisma.puestoCargo.findUnique({ where: { id: body.puestoCargId } })
    if (!puesto) throw AppError.notFound('Puesto no encontrado')
    const creada = await prisma.especialidadPuesto.create({
      data: { puestoCargId: body.puestoCargId, nombre: body.nombre },
    })
    return reply.status(201).send({ data: creada })
  })

  // PUT /puestos-cargo/especialidades/:id — S20-12: editar nombre/activo
  app.put('/especialidades/:id', { preHandler: requirePermiso({ modulo: 'cargos', accion: 'editar' }) }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = editarEspecialidadSchema.parse(request.body)
    const existente = await prisma.especialidadPuesto.findUnique({ where: { id } })
    if (!existente) throw AppError.notFound('Especialidad no encontrada')
    const actualizada = await prisma.especialidadPuesto.update({ where: { id }, data: body })
    return reply.send({ data: actualizada })
  })
}
