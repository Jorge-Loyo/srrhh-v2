import { z } from 'zod'

export const tareasQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  estado: z.enum(['pendiente', 'resuelta']).optional(),
  tipo: z.string().max(50).optional(),
})

export type TareasQuery = z.infer<typeof tareasQuerySchema>

// S25-3/5: query param para el kanban de supervisor
export const kanbanSupervisorQuerySchema = z.object({
  novedadesDias: z.coerce.number().int().min(1).max(90).default(7),
})
export type KanbanSupervisorQuery = z.infer<typeof kanbanSupervisorQuerySchema>

// S25-4: body para asignar un concurso
export const asignarConcursoSchema = z.object({
  referenciaId:   z.string().uuid(),
  referenciaTipo: z.enum(['concurso_cph', 'concurso_ceetps']),
  usuarioId:      z.string().uuid().nullable(),
})
export type AsignarConcursoBody = z.infer<typeof asignarConcursoSchema>
