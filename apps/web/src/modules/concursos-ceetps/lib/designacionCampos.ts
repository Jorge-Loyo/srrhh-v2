// Etapa 5 (Designación) del wizard CEETPS: las tarjetas de la designación.
// Única fuente del orden, los rótulos y los tipos de los campos. Cada campo se
// guarda solo al completarlo (sin botón "Registrar").
//
// Pedido 2026-11-24: sin "Carga de documentación", sin "Resolución de designación"
// ni su fecha; "Designación a la firma" va primero en la tarjeta de la disposición;
// "Resolución a la firma" va primero en la de la convalidación; el apto médico
// lleva número de nota y resultado (Apto / No apto).

export type TipoCampoDesignacion = 'texto' | 'fecha' | 'checkbox' | 'apto'

export interface DesigForm {
  eeDesignacion: string
  fechaAptoMedico: string
  numeroAptoMedico: string
  estadoApto: string // 'APTO' | 'NO APTO' | ''
  proyectoResolucion: boolean
  dispoDesignacion: string
  fechaDispoDesignacion: string
  resoALaFirma: boolean
  resolucionConvalidacion: string
  cargoSial: string
}

export interface CampoDesignacion {
  key: keyof DesigForm
  label: string
  tipo: TipoCampoDesignacion
}

export interface PasoDesignacion {
  id: string
  campos: CampoDesignacion[]
}

export const APTO = 'APTO'
export const NO_APTO = 'NO APTO'

export const PASOS_DESIGNACION: PasoDesignacion[] = [
  {
    id: 'ee-designacion',
    campos: [{ key: 'eeDesignacion', label: 'EE de designación (TAD)', tipo: 'texto' }],
  },
  {
    id: 'apto-medico',
    campos: [
      { key: 'fechaAptoMedico', label: 'Fecha apto médico', tipo: 'fecha' },
      { key: 'numeroAptoMedico', label: 'Número de nota', tipo: 'texto' },
      { key: 'estadoApto', label: 'Resultado', tipo: 'apto' },
    ],
  },
  {
    id: 'disposicion-designacion',
    campos: [
      { key: 'proyectoResolucion', label: 'Designación a la firma', tipo: 'checkbox' },
      { key: 'dispoDesignacion', label: 'Disposición de designación (DI / RESOL)', tipo: 'texto' },
      { key: 'fechaDispoDesignacion', label: 'Fecha de disposición', tipo: 'fecha' },
    ],
  },
  {
    id: 'resolucion-convalidacion',
    campos: [
      { key: 'resoALaFirma', label: 'Resolución a la firma', tipo: 'checkbox' },
      {
        key: 'resolucionConvalidacion',
        label: 'Resolución de convalidación (RESOL / RESFC)',
        tipo: 'texto',
      },
    ],
  },
  {
    id: 'cargo-sial',
    campos: [{ key: 'cargoSial', label: 'Cargo SIAL (alta)', tipo: 'texto' }],
  },
]

const TODOS_LOS_CAMPOS = PASOS_DESIGNACION.flatMap((p) => p.campos)

// Estado del formulario a partir del concurso (forma CPH del adaptador).
// Fechas ISO recortadas a YYYY-MM-DD para input[type=date]. Un resultado de apto
// que no sea Apto / No apto (valores viejos de la carga masiva) se muestra vacío.
export function desigFormDesde(datos: Record<string, unknown> | null | undefined): DesigForm {
  const form = {} as Record<keyof DesigForm, string | boolean>
  for (const c of TODOS_LOS_CAMPOS) {
    const val = datos?.[c.key]
    if (c.tipo === 'checkbox') form[c.key] = val === true
    else if (c.tipo === 'apto') form[c.key] = val === APTO || val === NO_APTO ? (val as string) : ''
    else if (typeof val === 'string') form[c.key] = c.tipo === 'fecha' ? val.slice(0, 10) : val
    else form[c.key] = ''
  }
  return form as unknown as DesigForm
}

// Body del PATCH al guardar un campo: cadena vacía como null.
export function bodyCampoDesignacion(
  key: keyof DesigForm,
  valor: string | boolean,
): Record<string, unknown> {
  return { [key]: valor === '' ? null : valor }
}

// ¿Están completos todos los campos de la etapa? (para marcar la etapa como completada)
export function designacionCompleta(form: DesigForm): boolean {
  return TODOS_LOS_CAMPOS.every((c) => {
    const val = form[c.key]
    if (c.tipo === 'checkbox') return val === true
    if (c.tipo === 'apto') return val === APTO
    return typeof val === 'string' && val.trim() !== ''
  })
}

// Lista de campos de la etapa 5 (el array `campos` de la etapa en el wizard).
export function camposDesignacion(
  v: (key: string) => string,
  vb: (key: string) => boolean,
): { key: string; label: string; tipo: 'texto' | 'fecha' | 'checkbox'; valor: string | boolean }[] {
  return TODOS_LOS_CAMPOS.map((c) => ({
    key: c.key,
    label: c.label,
    tipo: c.tipo === 'checkbox' ? 'checkbox' : c.tipo === 'fecha' ? 'fecha' : 'texto',
    valor: c.tipo === 'checkbox' ? vb(c.key) : v(c.key),
  }))
}
