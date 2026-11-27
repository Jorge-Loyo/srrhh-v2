import type { FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'
import { authenticate } from '../../shared/middleware/auth.middleware.js'
import { requirePermiso } from '../../shared/middleware/permisos.middleware.js'
import { AppError } from '../../shared/errors/AppError.js'
import {
  detectarTipo,
  listSesionesQuerySchema,
  diffsQuerySchema,
  TIPOS_CON_PREVIEW,
  type TipoCarga,
} from './carga-semanal.schema.js'
import {
  calcularSha256,
  verificarDuplicado,
  crearSesionMultiService,
  marcarSesionError,
  descartarSesionService,
  listSesionesService,
  getSesionService,
  listDiffsService,
} from './carga-semanal.service.js'
import type { ResolucionesConfirmar } from './carga-semanal.service.js'
import { despacharPreview, despacharConfirmar } from './procesadores/index.js'
import { prisma } from '../../shared/prisma.js'

// Buffer store: sesionId → Map<tipo, buffer>
// Se limpia al confirmar o descartar.
// Si el proceso reinicia, las sesiones pendiente_confirmacion quedan huérfanas → 410.
const bufferStore = new Map<string, Map<TipoCarga, Buffer>>()

function extraerFechaDeNombre(filename: string): Date | null {
  const m = filename.match(/(\d{4})(\d{2})(\d{2})/)
  if (!m) return null
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}`)
  return isNaN(d.getTime()) ? null : d
}

export async function cargaSemanalRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 10 } })

  /**
   * POST /upload
   * Acepta 1 o más archivos Excel. Detecta el tipo de cada uno por nombre.
   * Crea una sola sesión, lanza todos los previews en paralelo.
   * Para tipos sin preview (arbol, ocupacion_pou, pou_decreto) procesa directo.
   */
  app.post(
    '/upload',
    { preHandler: requirePermiso({ modulo: 'carga_semanal', accion: 'subir' }) },
    async (request, reply) => {
      const archivosRecibidos: Array<{ buffer: Buffer; filename: string }> = []

      for await (const part of request.parts()) {
        if (part.type === 'file') {
          archivosRecibidos.push({ buffer: await part.toBuffer(), filename: part.filename })
        }
      }

      if (!archivosRecibidos.length) throw AppError.badRequest('Se requiere al menos un archivo')

      // Detectar tipo y validar cada archivo
      const archivosConTipo: Array<{ buffer: Buffer; filename: string; tipo: TipoCarga; sha256: string; fechaArchivo: Date | null }> = []
      const sinTipo: string[] = []

      for (const a of archivosRecibidos) {
        const tipo = detectarTipo(a.filename)
        if (!tipo) { sinTipo.push(a.filename); continue }
        archivosConTipo.push({
          ...a,
          tipo,
          sha256: calcularSha256(a.buffer),
          fechaArchivo: extraerFechaDeNombre(a.filename),
        })
      }

      if (sinTipo.length) {
        throw AppError.badRequest(
          `No se pudo detectar el tipo de: ${sinTipo.join(', ')}. ` +
          'El nombre debe contener: Cargos_salud, Bajas_salud, Arbol_Salud, Ocupacion_POU o POU_Decreto.',
        )
      }

      // Verificar duplicados
      await Promise.all(archivosConTipo.map((a) => verificarDuplicado(a.sha256)))

      const usuarioId = (request as any).user?.id as string | undefined
      const tiposEnSesion = archivosConTipo.map((a) => a.tipo)

      const sesion = await crearSesionMultiService({
        archivos: archivosConTipo,
        usuarioId,
      })

      // Guardar buffers de tipos con preview
      const buffersMapa = new Map<TipoCarga, Buffer>()
      for (const a of archivosConTipo) {
        if (TIPOS_CON_PREVIEW.has(a.tipo)) buffersMapa.set(a.tipo, a.buffer)
      }
      if (buffersMapa.size > 0) bufferStore.set(sesion.id, buffersMapa)

      const ORDEN: TipoCarga[] = ['bajas_salud', 'cargos_salud', 'ocupacion_pou', 'arbol', 'pou_decreto']
      const archivosOrdenados = [...archivosConTipo].sort(
        (a, b) => ORDEN.indexOf(a.tipo) - ORDEN.indexOf(b.tipo),
      )

      // Lanzar todos los previews en SERIE (evita saturar el pool de conexiones de Neon)
      setImmediate(async () => {
        for (const a of archivosOrdenados) {
          console.log(`[carga-semanal] iniciando preview ${a.tipo} para sesión ${sesion.id}`)
          try {
            await despacharPreview(sesion.id, a.tipo, a.buffer, tiposEnSesion)
            console.log(`[carga-semanal] preview ${a.tipo} OK`)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            const stack = err instanceof Error ? err.stack : ''
            console.error(`[carga-semanal] preview ${a.tipo} falló para sesión ${sesion.id}:`, msg)
            console.error(stack)
          }
        }
      })

      return reply.status(202).send({
        data: {
          sesionId: sesion.id,
          tipos: tiposEnSesion,
          archivos: sesion.archivos.map((a) => a.filename),
          estado: sesion.estado,
          mensaje: `${archivosConTipo.length} archivo(s) recibido(s). Analizando cambios...`,
        },
      })
    },
  )

  /**
   * POST /sesiones/:id/confirmar
   * Aplica los cambios de todos los tipos con preview en la sesión.
   */
  app.post(
    '/sesiones/:id/confirmar',
    { preHandler: requirePermiso({ modulo: 'carga_semanal', accion: 'subir' }) },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = request.body as { resoluciones?: ResolucionesConfirmar } | null

      const sesion = await prisma.dimCargaSesion.findUnique({
        where: { id },
        select: { id: true, tipo: true, estado: true, archivos: { select: { filename: true } } },
      })
      if (!sesion) throw AppError.notFound(`Sesión ${id} no encontrada`)
      if (sesion.estado !== 'pendiente_confirmacion') {
        throw AppError.badRequest(
          `La sesión está en estado "${sesion.estado}", solo se pueden confirmar sesiones en pendiente_confirmacion`,
        )
      }

      const buffersMapa = bufferStore.get(id)
      if (!buffersMapa || buffersMapa.size === 0) {
        await prisma.dimCargaSesion.update({
          where: { id },
          data: { estado: 'error', errorMsg: 'El servidor fue reiniciado y el archivo ya no está disponible. Volvé a subir los archivos.' },
        })
        throw new AppError("NOT_FOUND", "El buffer del archivo ya no esta disponible (el servidor fue reiniciado). Por favor vuelva a subir el archivo.", 410)
      }

      // Reconstruir tiposEnSesion desde los archivos guardados en BD
      const tiposEnSesion = sesion.archivos
        .map((a) => detectarTipo(a.filename))
        .filter((t): t is TipoCarga => t !== null)

      const resoluciones: ResolucionesConfirmar = body?.resoluciones ?? {}

      await prisma.dimCargaSesion.update({
        where: { id },
        data: { estado: 'procesando' },
      })

      setImmediate(() => {
        despacharConfirmar(id, tiposEnSesion, buffersMapa, resoluciones)
          .then(() => bufferStore.delete(id))
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err)
            console.error(`[carga-semanal] confirmar falló para sesión ${id}:`, msg)
            bufferStore.delete(id)
          })
      })

      return reply.status(202).send({
        data: { sesionId: id, mensaje: 'Confirmación en proceso. El estado se actualizará en breve.' },
      })
    },
  )

  /**
   * DELETE /sesiones/:id
   */
  app.delete(
    '/sesiones/:id',
    { preHandler: requirePermiso({ modulo: 'carga_semanal', accion: 'subir' }) },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await descartarSesionService(id)
      bufferStore.delete(id)
      return reply.send({ data: { ok: true } })
    },
  )

  /**
   * GET /sesiones
   */
  app.get(
    '/sesiones',
    { preHandler: requirePermiso({ modulo: 'carga_semanal', accion: 'ver' }) },
    async (request, reply) => {
      const query = listSesionesQuerySchema.parse(request.query)
      const result = await listSesionesService(query)
      return reply.send(result)
    },
  )

  /**
   * GET /sesiones/:id
   */
  app.get(
    '/sesiones/:id',
    { preHandler: requirePermiso({ modulo: 'carga_semanal', accion: 'ver' }) },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const sesion = await getSesionService(id)
      return reply.send({ data: sesion })
    },
  )

  /**
   * GET /sesiones/:id/diffs
   */
  app.get(
    '/sesiones/:id/diffs',
    { preHandler: requirePermiso({ modulo: 'carga_semanal', accion: 'ver' }) },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const query = diffsQuerySchema.parse(request.query)
      const result = await listDiffsService(id, query)
      return reply.send(result)
    },
  )
}
