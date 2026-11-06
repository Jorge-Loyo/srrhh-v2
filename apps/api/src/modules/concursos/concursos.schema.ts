import { z } from 'zod'
import { TipoConcurso } from '@srrhh/types'
// MotivoConcurso viene del cliente Prisma (nuevo_cargo/alta_por_baja, S14-1)
// — no confundir con el MotivoConcurso de @srrhh/types (concepto legacy
// distinto y sin uso: baja/ampliacion/cobertura_pou/jefatura/otro).
import { MotivoConcurso } from '@prisma/client'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido')

export const createConcursoSchema = z
  .object({
    cargoId: z.string().uuid(),
    hospitalId: z.string().uuid(),
    personaId: z.string().uuid().optional(),
    origen: z.string().trim().min(1).max(50),
    fechaVacante: fecha,
    motivo: z.string().trim().max(200).optional(),
    expediente: z.string().trim().max(150).optional(),
    tipoConcurso: z.nativeEnum(TipoConcurso),
    motivoConcurso: z.nativeEnum(MotivoConcurso).optional(),
    especialidadSolicitada: z.string().trim().max(200).optional(),
    eeBaja: z.string().trim().max(150).optional(),
    fechaBaja: fecha.optional(),
    escalafonId: z.string().uuid().optional(),
    puestoSolicitado: z.string().trim().max(200).optional(),
  })
  .refine((data) => data.tipoConcurso !== TipoConcurso.CEETPS || !!data.escalafonId, {
    message: 'escalafonId es requerido cuando tipoConcurso es ceetps',
    path: ['escalafonId'],
  })

export type CreateConcursoBody = z.infer<typeof createConcursoSchema>

// ─── Bandeja mixta de concursos (CPH + CEETPS) — GET /concursos/bandeja ──────
// Filtros COMUNES a ambos tipos. Se lee del Concurso base, así que el filtro de
// estado va contra el campo string de la extensión (ver bandeja.service.ts).
export const bandejaConcursosQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  hospitalId: z.string().uuid().optional(),
  // tipo: discriminador de la bandeja. Omitido = ambos.
  tipo: z.nativeEnum(TipoConcurso).optional(),
  // estado: valor textual de la extensión (EstadoConcursoCph o EstadoConcursoCeetps).
  estado: z.string().trim().min(1).optional(),
  motivo: z.nativeEnum(MotivoConcurso).optional(),
  search: z.string().trim().min(1).optional(),
})

export type BandejaConcursosQuery = z.infer<typeof bandejaConcursosQuerySchema>
