import { z } from 'zod'

// Dimensiones categóricas habilitadas para agrupar en el reporte — mismo
// criterio de whitelist que DOTACION_SORT_COLUMNS en dotacion.schema.ts, acá
// restringido a columnas categóricas (se excluyen edad/antigüedad, que son
// numéricas continuas y no tienen sentido como GROUP BY sin bucketizar).
export const REPORTES_GROUP_BY_COLUMNS = [
  'sigla', 'universoTotalizador', 'tipoHospital', 'monovalencia',
  'escalafon', 'literalPuesto', 'especialidad',
  'sexo', 'situacionRevista', 'reparticion',
] as const

// Mismo problema/solución que en dotacion.schema.ts: z.coerce.boolean() no
// sirve para query strings.
const csv = () => z
  .string()
  .trim()
  .min(1)
  .optional()
  .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined))

export const reporteDotacionQuerySchema = z.object({
  groupBy1: z.enum(REPORTES_GROUP_BY_COLUMNS),
  groupBy2: z.enum(REPORTES_GROUP_BY_COLUMNS).optional(),

  // Filtros — mismo set de campos de catálogo que dotacionQuerySchema (ver
  // dotacion.schema.ts: S21 reemplazó los viejos multi-select de texto
  // snapshot por puestoNombre/especialidadNombre contra el catálogo curado),
  // sin page/limit/sortBy/skipDistinct/grupos/mesCorte: acá no hay listado
  // paginado ni uniones OR ni foto histórica, solo el resultado agregado.
  sigla: csv(),
  universoTotalizador: csv(),
  tipoHospital: csv(),
  monovalencia: csv(),
  puestoNombre: csv(),
  especialidadNombre: csv(),
  escalafonId: csv(),
  sexo: csv(),
  situacionRevista: csv(),
  reparticion: csv(),

  codigoCargo: z.string().trim().min(1).optional(),
  nombreApellido: z.string().trim().min(1).optional(),
  cuil: z.string().trim().min(1).optional(),
  codigoRol: z.string().trim().min(1).optional(),

  edadMin: z.coerce.number().int().min(0).max(120).optional(),
  edadMax: z.coerce.number().int().min(0).max(120).optional(),
  antiguedadMin: z.coerce.number().int().min(0).optional(),
  antiguedadMax: z.coerce.number().int().min(0).optional(),

  estado: z.string().trim().min(1).optional(),
}).refine((q) => q.groupBy1 !== q.groupBy2, {
  message: 'groupBy1 y groupBy2 no pueden ser la misma dimensión',
  path: ['groupBy2'],
})

export type ReporteDotacionQuery = z.infer<typeof reporteDotacionQuerySchema>

// ─────────────────────────────────────────────────────────────────────────
// Evolutivo por Especialidad — reporte fijo (sin filtros de usuario), calca
// la solapa homónima de "presupuesto 2026 evolución dotación": Cuerpo de
// Profesionales Hospitalarios (código de registro 37), sin jefes, cruzado
// Universo × Especialidad, restringido a un listado curado de especialidades
// (el Excel no muestra todas las que hay bajo ese código — solo estas 7).
export const EVOLUTIVO_ESPECIALIDAD_UNIVERSOS = ['Hospitales', 'APS'] as const

export const EVOLUTIVO_ESPECIALIDADES = [
  'Diagnóstico por Imágenes',
  'Oftalmología',
  'Cardiología',
  'Psiquiatría',
  'Psicología Clínica',
  'Odontología General',
  'Fonoaudiología',
] as const

// Columnas históricas (diciembre 2023 / enero 2025 / junio 2025 / enero
// 2026) y "Concurso a Septiembre 2026": no hay snapshots guardados de esas
// fechas en el sistema (el Padrón Semanal recién arranca en agosto 2026) ni
// conteo de concursos en proceso conectado a Dotación — son los valores
// copiados tal cual del Excel "presupuesto 2026 evolución dotación
// 1-09-26.xlsx", solapa "Evolutivo por Especialidad" (quedan fijos hasta que
// alguien actualice este archivo a mano con datos más nuevos). La columna
// "Actual" sí se calcula en vivo — ver getEvolutivoEspecialidadService.
export const EVOLUTIVO_ESPECIALIDAD_HISTORICO: Record<string, Record<string, {
  dic2023: number; ene2025: number; jun2025: number; ene2026: number; concurso: number
}>> = {
  Hospitales: {
    'Diagnóstico por Imágenes': { dic2023: 255, ene2025: 306, jun2025: 311, ene2026: 326, concurso: 28 },
    'Oftalmología':              { dic2023: 227, ene2025: 234, jun2025: 233, ene2026: 234, concurso: 15 },
    'Cardiología':                { dic2023: 409, ene2025: 442, jun2025: 440, ene2026: 461, concurso: 41 },
    'Psiquiatría':                { dic2023: 466, ene2025: 499, jun2025: 504, ene2026: 505, concurso: 73 },
    'Psicología Clínica':         { dic2023: 794, ene2025: 650, jun2025: 657, ene2026: 666, concurso: 56 },
    'Odontología General':        { dic2023: 361, ene2025: 316, jun2025: 313, ene2026: 317, concurso: 23 },
    'Fonoaudiología':             { dic2023: 176, ene2025: 141, jun2025: 141, ene2026: 148, concurso: 6 },
  },
  APS: {
    'Diagnóstico por Imágenes': { dic2023: 0,  ene2025: 4,   jun2025: 6,   ene2026: 7,   concurso: 10 },
    'Oftalmología':              { dic2023: 1,  ene2025: 2,   jun2025: 2,   ene2026: 2,   concurso: 3 },
    'Cardiología':                { dic2023: 1,  ene2025: 8,   jun2025: 8,   ene2026: 10,  concurso: 2 },
    'Psiquiatría':                { dic2023: 13, ene2025: 34,  jun2025: 36,  ene2026: 36,  concurso: 15 },
    'Psicología Clínica':         { dic2023: 16, ene2025: 199, jun2025: 205, ene2026: 222, concurso: 17 },
    'Odontología General':        { dic2023: 19, ene2025: 110, jun2025: 113, ene2026: 112, concurso: 18 },
    'Fonoaudiología':             { dic2023: 13, ene2025: 63,  jun2025: 69,  ene2026: 74,  concurso: 4 },
  },
}

export const EVOLUTIVO_ESPECIALIDAD_UNIVERSO_LABEL: Record<string, string> = {
  Hospitales: 'HOSPITALES',
  APS: 'APS (SSAPAC)',
}
