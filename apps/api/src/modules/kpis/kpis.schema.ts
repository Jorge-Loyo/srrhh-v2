import { z } from 'zod'

export const kpisConcursosCphQuerySchema = z.object({
  hospitalId: z.string().uuid().optional(),
})

export type KpisConcursosCphQuery = z.infer<typeof kpisConcursosCphQuerySchema>

export const kpisConcursosCeetpsQuerySchema = z.object({
  hospitalId: z.string().uuid().optional(),
  escalafonId: z.string().uuid().optional(),
})

export type KpisConcursosCeetpsQuery = z.infer<typeof kpisConcursosCeetpsQuerySchema>

export const kpisDotacionQuerySchema = z.object({
  hospitalId: z.string().uuid().optional(),
})

export type KpisDotacionQuery = z.infer<typeof kpisDotacionQuerySchema>

export const kpisConcursosQuerySchema = z.object({
  hospitalId: z.string().uuid().optional(),
})

export type KpisConcursosQuery = z.infer<typeof kpisConcursosQuerySchema>

export const kpisAlertasQuerySchema = z.object({
  hospitalId: z.string().uuid().optional(),
})

export type KpisAlertasQuery = z.infer<typeof kpisAlertasQuerySchema>

export const kpisDotacionHistoricaQuerySchema = z.object({
  hospitalId: z.string().uuid().optional(),
})

export type KpisDotacionHistoricaQuery = z.infer<typeof kpisDotacionHistoricaQuerySchema>

export const kpisBajasQuerySchema = z.object({
  hospitalId: z.string().uuid().optional(),
})

export type KpisBajasQuery = z.infer<typeof kpisBajasQuerySchema>

// Filtros multivaluados del gráfico de evolución. Desde el querystring un
// filtro puede llegar como string único (?siglas=A), array (?siglas=A&siglas=B)
// o CSV (?siglas=A,B). Se normaliza siempre a string[]. OR dentro de cada
// dimensión, AND entre dimensiones. jefatura: 'todos'|'solo'|'sin'.
const multiFiltro = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v): string[] => {
    if (v == null) return []
    const arr = Array.isArray(v) ? v : v.split(',')
    return arr.map((s) => s.trim()).filter((s) => s.length > 0)
  })

const filtrosEvolucionBase = {
  siglas: multiFiltro,
  carreras: multiFiltro,
  puestos: multiFiltro,
  especialidades: multiFiltro,
}

// Opciones facetadas: mismos filtros, sin jefatura obligatoria pero admitida.
export const dotacionEvolucionOpcionesQuerySchema = z.object({
  ...filtrosEvolucionBase,
  jefatura: z.enum(['todos', 'solo', 'sin']).default('todos'),
})

export type DotacionEvolucionOpcionesQuery = z.infer<typeof dotacionEvolucionOpcionesQuerySchema>

// mesDesde / mesHasta acotan el rango del eje temporal (formato 'YYYY-MM').
const mesFiltro = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Formato de mes inválido (YYYY-MM)')
  .optional()

export const dotacionEvolucionQuerySchema = z.object({
  ...filtrosEvolucionBase,
  jefatura: z.enum(['todos', 'solo', 'sin']).default('todos'),
  mesDesde: mesFiltro,
  mesHasta: mesFiltro,
})

export type DotacionEvolucionQuery = z.infer<typeof dotacionEvolucionQuerySchema>
