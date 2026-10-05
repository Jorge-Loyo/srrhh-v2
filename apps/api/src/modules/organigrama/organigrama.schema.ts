import { z } from 'zod'

// Igual que la app vieja: se pide por sigla de hospital (2-10 alfanumérico) o
// por sección administrativa (un enum chico, no por hospital). Nunca los dos
// a la vez ni ninguno.
export const SECCIONES = ['nivel-central', 'atencion-primaria'] as const
export type Seccion = (typeof SECCIONES)[number]

// Variantes de universo_totalizador aceptadas por cada sección. Se usa `in`
// (case-insensitive) en organigrama.service.ts, así que una sección puede
// matchear más de una etiqueta equivalente. Atención Primaria convive hoy como
// 'APS' (110 nodos históricos) y 'ATENCION PRIMARIA' (nodos nuevos inferidos);
// se aceptan ambas para no dejar afuera ninguna rama.
export const SECCION_UNIVERSOS: Record<Seccion, string[]> = {
  'nivel-central': ['Nivel Central'],
  'atencion-primaria': ['APS', 'ATENCION PRIMARIA'],
}

export const organigramaQuerySchema = z
  .object({
    sigla: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{2,10}$/, 'Formato de sigla inválido (esperado: 2-10 caracteres alfanuméricos)')
      .transform((s) => s.toUpperCase())
      .optional(),
    seccion: z.enum(SECCIONES).optional(),
  })
  .refine((v) => !!v.sigla !== !!v.seccion, {
    message: 'Se requiere sigla o seccion (uno solo de los dos)',
  })

export type OrganigramaQuery = z.infer<typeof organigramaQuerySchema>
