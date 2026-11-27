import { z } from 'zod'

export const TIPOS_CARGA = ['cargos_salud', 'bajas_salud', 'arbol', 'ocupacion_pou', 'pou_decreto'] as const
export type TipoCarga = (typeof TIPOS_CARGA)[number]

// Tipos que pasan por flujo preview/confirmar
export const TIPOS_CON_PREVIEW = new Set<TipoCarga>(['cargos_salud', 'bajas_salud', 'arbol', 'ocupacion_pou'])

const PATRONES_TIPO: Array<{ patron: RegExp; tipo: TipoCarga }> = [
  { patron: /cargos[_\s-]*salud/i,  tipo: 'cargos_salud' },
  { patron: /bajas[_\s-]*salud/i,   tipo: 'bajas_salud' },
  { patron: /arbol[_\s-]*salud/i,   tipo: 'arbol' },
  { patron: /ocupacion[_\s-]*pou/i, tipo: 'ocupacion_pou' },
  { patron: /pou[_\s-]*decreto/i,   tipo: 'pou_decreto' },
  { patron: /decreto[_\s-]*315/i,   tipo: 'pou_decreto' },
  { patron: /historico.*pou/i,       tipo: 'pou_decreto' },
]

export function detectarTipo(filename: string): TipoCarga | null {
  for (const { patron, tipo } of PATRONES_TIPO) {
    if (patron.test(filename)) return tipo
  }
  return null
}

export const ESTADOS_CARGA = ['pendiente_confirmacion', 'procesando', 'completado', 'error'] as const
export type EstadoCarga = (typeof ESTADOS_CARGA)[number]

export const listSesionesQuerySchema = z.object({
  tipo:   z.enum(TIPOS_CARGA).optional(),
  estado: z.enum(ESTADOS_CARGA).optional(),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export const diffsQuerySchema = z.object({
  tabla:  z.string().optional(),
  tipo:   z.enum(['nuevo', 'modificado', 'eliminado']).optional(),
  limit:  z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})
