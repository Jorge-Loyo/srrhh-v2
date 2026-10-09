import { z } from 'zod'

// Columnas habilitadas para ordenar la tabla — primer uso de sort dinámico en
// el proyecto (no hay convención previa que copiar), se valida contra esta
// whitelist fija para no exponer nombres de columna SQL arbitrarios en la query.
export const DOTACION_SORT_COLUMNS = [
  'nombreApellido', 'cuil', 'sexo', 'literalPuesto', 'especialidad',
  'escalafon', 'situacionRevista',
  'reparticion', 'sigla', 'codigoCargo', 'codigoRol', 'edad', 'antiguedad',
] as const

// z.coerce.boolean() no sirve para query strings ("false" es string no-vacío
// y coerciona a `true`): mismo problema y misma solución que en
// personas.schema.ts (parsear como enum de string y transformar a mano).
const csv = () => z
  .string()
  .trim()
  .min(1)
  .optional()
  .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined))

// Un grupo de la UNIÓN (OR) de /dotacion: un subconjunto de las mismas
// dimensiones del filtro, combinadas con AND dentro del grupo (cada dimensión
// sigue siendo multi-valor = OR interno). Varios grupos se combinan con OR
// (ver `grupos` abajo y buildConditions en el servicio). A diferencia de
// /personas (cascada de catálogo por IDs), acá cada grupo replica las
// dimensiones por nombre/sigla propias de /dotacion. Los arrays llegan ya
// parseados (JSON), no como CSV.
export const grupoDotacionSchema = z.object({
  sigla: z.array(z.string()).optional(),
  escalafonId: z.array(z.string().uuid()).optional(),
  modalidad: z.enum(['pof', 'pou', 'ambos']).optional(),
  puestoNombre: z.array(z.string()).optional(),
  especialidadNombre: z.array(z.string()).optional(),
  grupoEspecialidad: z.array(z.string()).optional(),
  codigoRegistroId: z.array(z.string().uuid()).optional(),
  regimen: z.array(z.string()).optional(),
  tipoOrigen: z.array(z.string()).optional(),
  sexo: z.array(z.string()).optional(),
  situacionRevista: z.array(z.string()).optional(),
  reparticion: z.array(z.string()).optional(),
  especialidadCph: z.array(z.string()).optional(),
  provincia: z.array(z.string()).optional(),
  localidad: z.array(z.string()).optional(),
  // S23-6: Área Programática / CeSAC / unidad fija (catálogo de S23-2/S23-3).
  areaProgramaticaId: z.array(z.string().uuid()).optional(),
  cesacId: z.array(z.string().uuid()).optional(),
  unidadFijaId: z.array(z.string().uuid()).optional(),
})

export type GrupoDotacion = z.infer<typeof grupoDotacionSchema>

const esGrupoNoVacio = (g: GrupoDotacion) =>
  Object.values(g).some((x) => (Array.isArray(x) ? x.length > 0 : x != null))

export const dotacionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sortBy: z.enum(DOTACION_SORT_COLUMNS).optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  skipDistinct: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),

  // UNIONES (OR): llega como JSON string en `grupos`. Cada grupo es un AND de
  // sus dimensiones; los grupos se combinan con OR. Los filtros sueltos de
  // abajo siguen aplicándose con AND sobre toda la unión (igual que /personas).
  grupos: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined
      try {
        const parsed = JSON.parse(v)
        const arr = z.array(grupoDotacionSchema).max(20).parse(parsed)
        const noVacios = arr.filter(esGrupoNoVacio)
        return noVacios.length ? noVacios : undefined
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'grupos: JSON inválido' })
        return z.NEVER
      }
    }),

  // Segmentación de hospitales (multi-select, CSV)
  sigla: csv(),
  universoTotalizador: csv(),
  tipoHospital: csv(),
  monovalencia: csv(),

  // S21: /dotacion combina persona + cargo. Filtros de CATÁLOGO del cargo, NO
  // en cascada forzada: se pueden combinar libremente (buscar por especialidad
  // sin puesto, etc.). Puesto/especialidad filtran por NOMBRE (normalizado, vía
  // join a puestos_cargo/especialidades_puesto) para poder buscar sobre todo el
  // catálogo sin fijar el nivel superior. Reemplazan los viejos multi-select
  // de texto snapshot (unificadorPuesto/agrupador/literalPuesto/especialidad).
  escalafonId: csv(),
  modalidad: z.enum(['pof', 'pou', 'ambos']).optional(),
  puestoNombre: csv(),
  especialidadNombre: csv(),
  grupoEspecialidad: csv(),
  codigoRegistroId: csv(),
  regimen: csv(),
  tipoOrigen: csv(), // 'R' | 'TTR' | 'normal'
  // Especialidad CPH propia de la persona (personas.especialidad_cph)
  especialidadCph: csv(),
  provincia: csv(),
  localidad: csv(),
  // S23-6: Área Programática / CeSAC / unidad fija (CEMAR/COI/Red de
  // Odontología) — mismo patrón que escalafonId/codigoRegistroId, el
  // catálogo lo alimentan GET /areas-programaticas, /cesacs, /unidades-fijas
  // (S23-5), no un facet de getDistinctValues acá.
  areaProgramaticaId: csv(),
  cesacId: csv(),
  unidadFijaId: csv(),
  // Solo personas con ocupación vigente de jefatura
  soloJefes: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),

  // Filtros de personal / dotación que se mantienen (multi-select, CSV)
  sexo: csv(),
  situacionRevista: csv(),
  reparticion: csv(),

  // Búsqueda rápida (campo único)
  codigoCargo: z.string().trim().min(1).optional(),
  nombreApellido: z.string().trim().min(1).optional(),
  cuil: z.string().trim().min(1).optional(),
  codigoRol: z.string().trim().min(1).optional(),

  edadMin: z.coerce.number().int().min(0).max(120).optional(),
  edadMax: z.coerce.number().int().min(0).max(120).optional(),
  antiguedadMin: z.coerce.number().int().min(0).optional(),
  antiguedadMax: z.coerce.number().int().min(0).optional(),

  // Filtro de estado disparado desde el click en las KPI cards del panel
  estado: z.string().trim().min(1).optional(),

  // Fecha de corte (foto histórica): 'YYYY-MM'. Si viene, el listado/export se
  // reconstruye al cierre de ese mes (padrón aprobado más tardío del mes) en vez
  // de la foto actual (ocupaciones vigentes). Vacío = estado actual.
  mesCorte: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, 'mesCorte debe tener formato YYYY-MM')
    .optional(),
})

export type DotacionQuery = z.infer<typeof dotacionQuerySchema>

export const dotacionKpisQuerySchema = z.object({
  hospitalId: z.string().uuid().optional(),
})

export type DotacionKpisQuery = z.infer<typeof dotacionKpisQuerySchema>
