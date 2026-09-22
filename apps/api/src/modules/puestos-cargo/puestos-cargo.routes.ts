import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { prisma } from '../../shared/prisma.js'

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
      select: { id: true, nombre: true, modalidad: true, tipoPuesto: true },
      orderBy: { nombre: 'asc' },
    })

    const filtrados = tipoPuesto === 'ejecucion'
      ? rows.filter((r) => r.modalidad !== 'ambos')
      : tipoPuesto === 'conduccion'
        ? rows.filter((r) => r.modalidad === 'ambos')
        : rows
    return reply.send({ data: filtrados.map((r) => r.nombre) })
  })

  // GET /puestos-cargo/especialidades?escalafonId=&nombre=
  // Con `nombre`: especialidades de ESE puesto puntual.
  // Sin `nombre` (solo `escalafonId`): unión de especialidades de TODOS los
  // puestos de ese escalafón — usado para ampliar la búsqueda de jurado a
  // otras especialidades además de la propia del puesto a concursar (un
  // puesto puntual suele tener 1 sola especialidad cargada, insuficiente para
  // ofrecer alternativas).
  app.get('/especialidades', async (request, reply) => {
    const { escalafonId, nombre } = request.query as {
      escalafonId?: string
      nombre?: string
    }

    if (!nombre) {
      if (!escalafonId) return reply.send({ data: [] })
      const rows = await prisma.especialidadPuesto.findMany({
        where: { activo: true, puesto: { activo: true, escalafonId } },
        select: { nombre: true },
        distinct: ['nombre'],
        orderBy: { nombre: 'asc' },
      })
      return reply.send({ data: rows.map((r) => r.nombre) })
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
          select: { nombre: true },
          orderBy: { nombre: 'asc' },
        },
      },
    })

    return reply.send({ data: puesto?.especialidades.map((e) => e.nombre) ?? [] })
  })
}
