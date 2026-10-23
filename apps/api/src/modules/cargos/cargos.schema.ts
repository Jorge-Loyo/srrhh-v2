import { z } from 'zod'
import { EstadoCargo } from '@srrhh/types'

// S21: un grupo de la cascada de catálogo. Varios grupos se combinan con OR
// (uniones), ver `grupos` abajo y cargos.service.
export const grupoCatalogoSchema = z.object({
  hospitalId: z.string().uuid().optional(),
  escalafonId: z.string().uuid().optional(),
  // S25: código de registro puntual del escalafón (ej. CPH → 22 ó 37). Acota
  // dentro del escalafón ya elegido.
  codigoRegistroId: z.string().uuid().optional(),
  modalidad: z.enum(['pof', 'pou', 'ambos']).optional(),
  puestoCargoId: z.string().uuid().optional(),
  especialidadPuestoId: z.string().uuid().optional(),
})

export type GrupoCatalogo = z.infer<typeof grupoCatalogoSchema>

// S3-4/S3-3: filtros de GET /api/v1/cargos — ver CargoFilters en packages/types.
export const cargosQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().trim().min(1).optional(),
  hospitalId: z.string().uuid().optional(),
  escalafonId: z.string().uuid().optional(),
  // S25: código de registro puntual del escalafón (cascada escalafón→cod. registro).
  codigoRegistroId: z.string().uuid().optional(),
  // S21: modalidad del cargo (POF/POU) — cascada escalafón→modalidad→puesto.
  modalidad: z.enum(['pof', 'pou', 'ambos']).optional(),
  // S20-7: filtro por FK real al catálogo — reemplaza los viejos `puesto`/
  // `especialidad` de texto libre normalizado.
  puestoCargoId: z.string().uuid().optional(),
  especialidadPuestoId: z.string().uuid().optional(),
  // S21: uniones (OR) de la cascada de catálogo. JSON string en el query param
  // `grupos`. Cada grupo es un AND de sus campos; los grupos se combinan con OR.
  grupos: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined
      try {
        const parsed = JSON.parse(v)
        const arr = z.array(grupoCatalogoSchema).max(20).parse(parsed)
        const noVacios = arr.filter((g) => Object.values(g).some((x) => x != null && x !== ''))
        return noVacios.length ? noVacios : undefined
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'grupos: JSON inválido' })
        return z.NEVER
      }
    }),
  estado: z.nativeEnum(EstadoCargo).optional(),
  ocupado: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  // Solo jefes: cargos cuya ocupación vigente es de jefatura.
  soloJefes: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  personaSearch: z.string().trim().min(1).optional(),
})

export type CargosQuery = z.infer<typeof cargosQuerySchema>

// Export de /cargos (GET /api/v1/cargos/export): trae la totalidad de los
// cargos (excluyendo solo borrados lógicos), SIN filtros de pantalla. Solo
// acepta paginado para que `fetchAllPages` (pageSize 1000) pueda recorrer todo.
export const cargosExportQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(1000),
})

export type CargosExportQuery = z.infer<typeof cargosExportQuerySchema>

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido')

// S5-10: Alta de Cargo manual.
// `idSial` no se genera acá — es un identificador del sistema SIAL del GCBA
// que solo existe para cargos que vienen del padrón. Los cargos creados
// manualmente usan un idSial sintético generado por el backend.
export const createCargoSchema = z.object({
  hospitalId:       z.string().uuid(),
  escalafonId:      z.string().uuid(),
  codigoRegistroId: z.string().uuid().optional(),
  // S20-11: el combobox de puesto/especialidad manda el id del catálogo, no
  // el string mostrado. literalPuesto/especialidadLegacy en Cargo se
  // completan en el backend a partir del nombre canónico de estos ids.
  puestoCargoId:       z.string().uuid(),
  especialidadPuestoId: z.string().uuid().optional(),
  agrupador:        z.string().trim().max(150).optional(),
  unificadorPuesto: z.string().trim().max(200).optional(),
  regimen:          z.string().trim().max(50).optional(),
  // Expediente o decreto que autoriza el alta — se persiste en BD (S7-2)
  expediente:       z.string().trim().max(150).optional(),
  // Fecha desde la que rige el cargo — se persiste en BD (S7-2)
  desde:            fecha.optional(),
  // Cantidad de cargos a crear (1..50)
  cantidad: z.coerce.number().int().min(1).max(50).default(1),
  // S7-5: forzar creación aunque exista duplicado estructural
  forzar:   z.boolean().optional().default(false),
})

export type CreateCargoBody = z.infer<typeof createCargoSchema>

// S7-4: filtros para GET /api/v1/cargos/altas
export const altasQuerySchema = z.object({
  expediente: z.string().trim().min(1).optional(),
  desde:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(200).default(50),
})

export type AltasQuery = z.infer<typeof altasQuerySchema>
