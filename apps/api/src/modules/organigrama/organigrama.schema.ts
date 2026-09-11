import { z } from 'zod'

// Igual que la app vieja: se pide por sigla de hospital (2-10 alfanumérico) o
// por sección administrativa (un enum chico, no por hospital). Nunca los dos
// a la vez ni ninguno.
export const SECCIONES = ['nivel-central', 'atencion-primaria'] as const
export type Seccion = (typeof SECCIONES)[number]

export const SECCION_UNIVERSOS: Record<Seccion, string> = {
  'nivel-central': 'NIVEL CENTRAL',
  // Antes decía 'APS' — no matcheaba ningún valor real de
  // organigramas.universo_totalizador (que es "ATENCION PRIMARIA", 103
  // filas en el Excel), así que esta sección siempre tiraba 404.
  'atencion-primaria': 'ATENCION PRIMARIA',
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
