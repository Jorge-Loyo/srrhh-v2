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

// jcat_cargo_jefatura: mapeo JCAT → cargo de jefatura que consume el pipeline v2
// del Dotaneitor (catalogo.py). PK natural `jcat` (no uuid) y sin columna `activo`.
export const jcatCargoJefaturaSchema = z.object({
  jcat: z.string().trim().min(1).max(10),
  cargoJefatura: z.string().trim().min(1).max(100),
  codPuesto: z.string().trim().max(5).optional(),
  familia: z.enum(['P', 'G', 'Z']),
})
export const jcatCargoJefaturaUpdateSchema = jcatCargoJefaturaSchema.partial()
export type JcatCargoJefaturaBody = z.infer<typeof jcatCargoJefaturaSchema>
