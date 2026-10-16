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
  { key: 'vacante', label: 'Vacante' },
  { key: 'a-caratulado', label: 'A — Caratulado' },
  { key: 'a-autzn', label: 'A — Autorización' },
  { key: 'b-sorteo jur', label: 'B — Sorteo de jurado' },
  { key: 'c-dispo de llamado', label: 'C — Dispo de llamado' },
  { key: 'c2-inscripcion ex', label: 'C — Inscripción de exámenes' },
  { key: 'd-examen publicado', label: 'D — Publicación Examen' },
  { key: 'e-orden de merito', label: 'E — Orden de mérito' },
  { key: 'f-ifacs', label: 'F — IFACS' },
  { key: 'g-insal', label: 'G — INSAL' },
  { key: 'h-tad', label: 'H — TAD' },
  { key: 'i-carga docu', label: 'I — Carga documentación' },
  { key: 'j-apto med', label: 'J — Apto médico' },
  { key: 'k-ite', label: 'K — ITE' },
  { key: 'l-pycto de reso', label: 'L — Proyecto resolución' },
  { key: 'm-reso a la firma', label: 'M — Reso a la firma' },
  { key: 'n-designado', label: 'N — Designado' },
  { key: 'o-alta sial', label: 'O — Alta SIAL' },
]
