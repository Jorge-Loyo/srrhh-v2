import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import {
  kpisConcursosCphQuerySchema,
  kpisConcursosCeetpsQuerySchema,
  kpisDotacionQuerySchema,
  kpisConcursosQuerySchema,
  kpisAlertasQuerySchema,
  kpisDotacionHistoricaQuerySchema,
} from './kpis.schema.js'
import {
  getKpisConcursosCphService,
  getKpisConcursosCeetpsService,
  getKpisDotacionService,
  getKpisConcursosService,
  getKpisAlertasService,
  getKpisDotacionHistoricaService,
} from './kpis.service.js'

export async function kpisRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // GET /dotacion — S6-1
  app.get('/dotacion', async (request, reply) => {
    const query = kpisDotacionQuerySchema.parse(request.query)
    const data = await getKpisDotacionService(query)
    return reply.send({ data })
  })

  // GET /concursos — S6-3: vista consolidada CPH+CEETPS + tiempo promedio por etapa (CPH)
  app.get('/concursos', async (request, reply) => {
    const query = kpisConcursosQuerySchema.parse(request.query)
    const data = await getKpisConcursosService(query)
    return reply.send({ data })
  })

  // GET /concursos-cph — S4-11
  app.get('/concursos-cph', async (request, reply) => {
    const { hospitalId } = kpisConcursosCphQuerySchema.parse(request.query)
    const data = await getKpisConcursosCphService(hospitalId)
    return reply.send({ data })
  })

  // GET /alertas — S6-6: concursos vencidos + bajas sin concurso
  app.get('/alertas', async (request, reply) => {
    const query = kpisAlertasQuerySchema.parse(request.query)
    const data = await getKpisAlertasService(query)
    return reply.send({ data })
  })

  // GET /dotacion-historica — S6-5: evolución de PadronHistorico
  app.get('/dotacion-historica', async (request, reply) => {
    const query = kpisDotacionHistoricaQuerySchema.parse(request.query)
    const data = await getKpisDotacionHistoricaService(query)
    return reply.send({ data })
  })

  // GET /concursos-ceetps — S5-8
  app.get('/concursos-ceetps', async (request, reply) => {
    const query = kpisConcursosCeetpsQuerySchema.parse(request.query)
    const data = await getKpisConcursosCeetpsService(query)
    return reply.send({ data })
  })
}
