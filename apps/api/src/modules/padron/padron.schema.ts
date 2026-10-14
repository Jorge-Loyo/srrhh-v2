import { z } from 'zod'

export const uploadPadronSchema = z.object({
  fechaAsignada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido'),
})

// Bool desde query string. OJO: z.coerce.boolean() usa Boolean(valor), así que
// el string "false" (no vacío) coerciona a true — bug real: mandaba
// soloCompletados=false y el backend lo leía como true, mostrando SIEMPRE los
// completados en todas las sub-pestañas de Modificados. Este helper trata
// "false"/"0"/""/"no" como false y solo "true"/"1" como true.
const queryBool = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined
    if (typeof v === 'boolean') return v
    const s = v.trim().toLowerCase()
    if (s === '' || s === 'false' || s === '0' || s === 'no') return false
    return true
  })

export const diffQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  tipo:  z.enum(['nuevo', 'modificado', 'eliminado']).optional(),
  q:          z.string().trim().optional(),
  soloPendientes: queryBool,
  campo: z.string().trim().optional(),
  soloCompletados: queryBool,
  soloBajasNuevas: queryBool,
  clasificacionEliminado: z.enum(['en_validacion', 'sin_persona']).optional(),
})

export type UploadPadronBody = z.infer<typeof uploadPadronSchema>
export type DiffQuery = z.infer<typeof diffQuerySchema>
