import { z } from 'zod'

// CRUD admin (solo rol admin, ver referencias.routes.ts) sobre las 10 tablas de
// referencia que alimentan el cruce de Dotaneitor (Doc/Dotaneitor_Analisis.md).
// Antes de este módulo, la única forma de tocar estos datos era correr a mano
// services/dotaneitor/scripts/seed_referencias.py contra el Excel de origen.

export const refListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  search: z.string().trim().min(1).optional(),
})
export type RefListQuery = z.infer<typeof refListQuerySchema>

export const agrupadorSchema = z.object({
  cruce: z.string().trim().min(1).max(300),
  escalafon: z.string().trim().min(1).max(150),
  litPuesto: z.string().trim().min(1).max(200),
  agrupador: z.string().trim().min(1).max(150),
  activo: z.boolean().optional(),
})
export const agrupadorUpdateSchema = agrupadorSchema.partial()
export type AgrupadorBody = z.infer<typeof agrupadorSchema>

export const unificadorPuestoSchema = z.object({
  cruce: z.string().trim().min(1).max(400),
  litCodReg: z.string().trim().min(1).max(150),
  litPuesto: z.string().trim().min(1).max(200),
  unificador: z.string().trim().min(1).max(200),
  activo: z.boolean().optional(),
})
export const unificadorPuestoUpdateSchema = unificadorPuestoSchema.partial()
export type UnificadorPuestoBody = z.infer<typeof unificadorPuestoSchema>

export const especialidadCuilSchema = z.object({
  tipo: z.string().trim().min(1).max(20),
  cuil: z.string().trim().min(1).max(11),
  cuilYRol: z.string().trim().max(50).optional(),
  especialidad: z.string().trim().min(1).max(200),
  activo: z.boolean().optional(),
})
export const especialidadCuilUpdateSchema = especialidadCuilSchema.partial()
export type EspecialidadCuilBody = z.infer<typeof especialidadCuilSchema>

export const abreviaturaTecnicaSchema = z.object({
  sigla: z.string().trim().min(1).max(50),
  activo: z.boolean().optional(),
})
export const abreviaturaTecnicaUpdateSchema = abreviaturaTecnicaSchema.partial()
export type AbreviaturaTecnicaBody = z.infer<typeof abreviaturaTecnicaSchema>

export const abreviaturaTituloSchema = z.object({
  titulo: z.string().trim().min(1).max(50),
  activo: z.boolean().optional(),
})
export const abreviaturaTituloUpdateSchema = abreviaturaTituloSchema.partial()
export type AbreviaturaTituloBody = z.infer<typeof abreviaturaTituloSchema>

export const correccionLitPuestoSchema = z.object({
  codReg: z.string().trim().max(10).optional(),
  original: z.string().trim().min(1).max(200),
  correccion: z.string().trim().min(1).max(200),
  activo: z.boolean().optional(),
})
export const correccionLitPuestoUpdateSchema = correccionLitPuestoSchema.partial()
export type CorreccionLitPuestoBody = z.infer<typeof correccionLitPuestoSchema>

export const correccionEspecialidadSchema = z.object({
  original: z.string().trim().min(1).max(200),
  correccion: z.string().trim().min(1).max(200),
  activo: z.boolean().optional(),
})
export const correccionEspecialidadUpdateSchema = correccionEspecialidadSchema.partial()
export type CorreccionEspecialidadBody = z.infer<typeof correccionEspecialidadSchema>

export const especialidadPorPuestoSchema = z.object({
  agrupador: z.string().trim().min(1).max(150),
  especialidad: z.string().trim().min(1).max(200),
  purezaPct: z.coerce.number().int().min(0).max(100).optional(),
  activo: z.boolean().optional(),
})
export const especialidadPorPuestoUpdateSchema = especialidadPorPuestoSchema.partial()
export type EspecialidadPorPuestoBody = z.infer<typeof especialidadPorPuestoSchema>

export const conectorMinusculaSchema = z.object({
  conector: z.string().trim().min(1).max(30),
  activo: z.boolean().optional(),
})
export const conectorMinusculaUpdateSchema = conectorMinusculaSchema.partial()
export type ConectorMinusculaBody = z.infer<typeof conectorMinusculaSchema>

export const sufijoOrdinalSchema = z.object({
  sufijo: z.string().trim().min(1).max(10),
  activo: z.boolean().optional(),
})
export const sufijoOrdinalUpdateSchema = sufijoOrdinalSchema.partial()
export type SufijoOrdinalBody = z.infer<typeof sufijoOrdinalSchema>
