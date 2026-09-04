import { z } from 'zod'

export const createRoleSchema = z.object({
  nombre: z.string().min(2).max(100),
  descripcion: z.string().max(255).optional(),
})

export const updateRoleSchema = z.object({
  nombre: z.string().min(2).max(100).optional(),
  descripcion: z.string().max(255).nullable().optional(),
  activo: z.boolean().optional(),
})

export const setRolePermisosSchema = z.object({
  permisoIds: z.array(z.string().uuid()),
})

// S13-E — jerarquía de roles: setea (o limpia, con null) el padre de un rol hijo.
export const setJerarquiaSchema = z.object({
  rolHijoSlug: z.string().min(1).max(40),
  rolPadreSlug: z.string().min(1).max(40).nullable(),
})

export type CreateRoleBody = z.infer<typeof createRoleSchema>
export type UpdateRoleBody = z.infer<typeof updateRoleSchema>
export type SetRolePermisosBody = z.infer<typeof setRolePermisosSchema>
export type SetJerarquiaBody = z.infer<typeof setJerarquiaSchema>
