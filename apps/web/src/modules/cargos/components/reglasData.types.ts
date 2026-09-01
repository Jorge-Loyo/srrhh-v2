export type Color = 'blue' | 'yellow' | 'green' | 'red' | 'gray' | 'purple' | 'orange'

export interface FlowNode {
  id: string
  title: string
  subtitle: string
  color: Color
  icon: string
  items: string[]
}

export interface FlowEdge {
  from: string
  to: string
  label?: string
  dashed?: boolean
}

export interface TipoCargoFlow {
  id: string
  nombre: string
  codigo: string
  ejemplo: string
  modalidad?: string
  puestos?: string[]
  reglas: string[]
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export interface EscalafonFlow {
  id: string
  nombre: string
  color: Color
  descripcion: string
  norma: string
  tipos: TipoCargoFlow[]
}
