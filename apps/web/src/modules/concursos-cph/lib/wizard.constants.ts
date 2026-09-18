// Tipos y constantes del wizard de concursos CPH (extraídos de ConcursoCphWizard.tsx).

export type EstadoEtapa = 'completada' | 'activa' | 'pendiente' | 'bloqueada'

export interface Campo {
  key: string
  label: string
  tipo: 'texto' | 'fecha' | 'checkbox' | 'textarea'
  valor: string | boolean
  requerido?: boolean
  readonly?: boolean
}

export interface Etapa {
  id: string
  numero: number
  titulo: string
  descripcion: string
  estado: EstadoEtapa
  campos: Campo[]
  fechaCompletada?: string
}

export const ESTADO_ETAPA_CONFIG: Record<
  EstadoEtapa,
  { label: string; dot: string; badge: string }
> = {
  completada: {
    label: 'Completada',
    dot: 'bg-green-500',
    badge: 'badge-success',
  },
  activa: {
    label: 'En curso',
    dot: 'bg-amber-400 animate-pulse',
    badge: 'badge-warning',
  },
  pendiente: { label: 'Pendiente', dot: 'bg-gray-300', badge: 'badge-default' },
  bloqueada: { label: 'Bloqueada', dot: 'bg-gray-200', badge: 'badge-default' },
}

// Orden canónico del sub-estado — igual que calcSubEstado en el backend
export const SUB_ESTADOS: { key: string; label: string }[] = [
  { key: 'VACANTE', label: 'Vacante' },
  { key: 'A-CARATULADO', label: 'A — Caratulado' },
  { key: 'A-AUTZN', label: 'A — Autorización' },
  { key: 'B-SORTEO JUR', label: 'B — Sorteo de jurado' },
  { key: 'C-DISPO DE LLAMADO', label: 'C — Dispo de llamado' },
  { key: 'C2-INSCRIPCION EX', label: 'C — Inscripción de exámenes' },
  { key: 'D-EXAMEN PUBLICADO', label: 'D — Publicación Examen' },
  { key: 'E-ORDEN DE MERITO', label: 'E — Orden de mérito' },
  { key: 'F-IFACS', label: 'F — IFACS' },
  { key: 'G-INSAL', label: 'G — INSAL' },
  { key: 'H-TAD', label: 'H — TAD' },
  { key: 'I-CARGA DOCU', label: 'I — Carga documentación' },
  { key: 'J-APTO MED', label: 'J — Apto médico' },
  { key: 'K-ITE', label: 'K — ITE' },
  { key: 'L-PYCTO DE RESO', label: 'L — Proyecto resolución' },
  { key: 'M-RESO A LA FIRMA', label: 'M — Reso a la firma' },
  { key: 'N-DESIGNADO', label: 'N — Designado' },
  { key: 'O-ALTA SIAL', label: 'O — Alta SIAL' },
]
