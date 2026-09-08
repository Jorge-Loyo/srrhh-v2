/**
 * Vista "Diagrama" del organigrama — árbol colapsable de cajas conectadas.
 * Puerto de la app vieja (OrganigramaFlowView.jsx) al shape de nodo de v2
 * (id/nombre/tipo/persona/hijos en vez de id/name/title/persona/children).
 * - Solo el root está expandido al iniciar.
 * - Nodos con hijos: borde primary + ícono de expand/collapse.
 * - Nodos hoja: borde gris, sin ícono.
 * - Al cambiar de árbol (data cambia), se resetea la expansión.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap, Panel,
  Handle, Position, useReactFlow, ReactFlowProvider,
  getViewportForBounds,
  type Node, type Edge, type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toPng } from 'html-to-image'
import { ChevronDownIcon, ChevronRightIcon, UserIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { tipoColor, stripRedundantPrefix } from '../lib/organigramaHelpers'
import type { OrganigramaNodo } from '../hooks/useOrganigrama'
import type { PersonaSeleccionada } from './OrganigramaTreeNode'
import type { SearchMatch } from '../lib/organigramaHelpers'

const EXPORT_SCALE = 2
const EXPORT_MAX_DIM = 8000

const NODE_W = 190
const NODE_H_MIN = 90
const NAME_LINE_H = 17
const NAME_PADDING_X = 24
const HEADER_FOOTER_H = 70
const H_GAP = 12
const V_GAP = 52

const NAME_FONT = '600 12px Inter, system-ui, sans-serif'
let measureCtx: CanvasRenderingContext2D | null = null
function countWrappedLines(text: string, availableWidth: number): number {
  if (!text) return 1
  if (!measureCtx) {
    measureCtx = document.createElement('canvas').getContext('2d')
    if (measureCtx) measureCtx.font = NAME_FONT
  }
  if (!measureCtx) return 1
  const words = text.split(' ')
  let lines = 1
  let lineWidth = 0
  const spaceWidth = measureCtx.measureText(' ').width
  for (const word of words) {
    const wordWidth = measureCtx.measureText(word).width
    if (lineWidth > 0 && lineWidth + spaceWidth + wordWidth > availableWidth) {
      lines++
      lineWidth = wordWidth
    } else {
      lineWidth += (lineWidth > 0 ? spaceWidth : 0) + wordWidth
    }
  }
  return lines
}

function estimateNodeHeight(name: string | null): number {
  const lines = countWrappedLines(stripRedundantPrefix(name), NODE_W - NAME_PADDING_X)
  return Math.max(NODE_H_MIN, HEADER_FOOTER_H + lines * NAME_LINE_H)
}

// ── Nodo anotado con un id sintético estable, para expand/collapse ──────────
interface NodoAnotado extends Omit<OrganigramaNodo, 'hijos'> {
  _id: string
  hijos: NodoAnotado[]
}

function assignIds(node: OrganigramaNodo, prefix = 'n0'): NodoAnotado {
  return {
    ...node,
    _id: prefix,
    hijos: node.hijos.map((c, i) => assignIds(c, `${prefix}-${i}`)),
  }
}

function getDirectChildIds(root: NodoAnotado, targetId: string): string[] | null {
  function find(node: NodoAnotado): string[] | null {
    if (node._id === targetId) return [node._id, ...node.hijos.map((c) => c._id)]
    for (const c of node.hijos) {
      const r = find(c)
      if (r) return r
    }
    return null
  }
  return find(root)
}

function visibleWidth(node: NodoAnotado, expanded: Set<string>): number {
  if (!expanded.has(node._id) || !node.hijos.length) return NODE_W
  const total = node.hijos.reduce((s, c, i) => s + visibleWidth(c, expanded) + (i > 0 ? H_GAP : 0), 0)
  return Math.max(total, NODE_W)
}

function computeRowHeights(root: NodoAnotado, expanded: Set<string>): number[] {
  const heights: number[] = []
  function visit(node: NodoAnotado, depth: number) {
    heights[depth] = Math.max(heights[depth] || 0, estimateNodeHeight(node.nombre))
    if (node.hijos.length && expanded.has(node._id)) node.hijos.forEach((c) => visit(c, depth + 1))
  }
  visit(root, 0)
  return heights
}

interface OrgNodeData {
  [key: string]: unknown
  tipo: string
  nombre: string | null
  persona: OrganigramaNodo['persona']
  codigo: string
  hasChildren: boolean
  isExpanded: boolean
  height: number
  onPersonaClick: (data: PersonaSeleccionada) => void
  isHighlighted: boolean
}

function buildGraph(
  root: NodoAnotado,
  expanded: Set<string>,
  onPersonaClick: (data: PersonaSeleccionada) => void,
  highlightId: string | null | undefined
): { nodes: Node<OrgNodeData>[]; edges: Edge[] } {
  const rfNodes: Node<OrgNodeData>[] = []
  const rfEdges: Edge[] = []

  const rowHeights = computeRowHeights(root, expanded)
  const rowY: number[] = []
  let accY = 0
  for (let d = 0; d < rowHeights.length; d++) {
    rowY[d] = accY
    accY += rowHeights[d] + V_GAP
  }

  function walk(node: NodoAnotado, x: number, depth: number, parentId: string | null) {
    const id = node._id
    const hasChildren = node.hijos.length > 0
    const isExpanded = expanded.has(id)

    rfNodes.push({
      id,
      type: 'orgNode',
      position: { x: x - NODE_W / 2, y: rowY[depth] ?? 0 },
      data: {
        tipo: node.tipo, nombre: node.nombre, persona: node.persona, codigo: node.id, hasChildren, isExpanded,
        height: estimateNodeHeight(node.nombre),
        onPersonaClick,
        isHighlighted: highlightId != null && node.id === highlightId,
      },
    })

    if (parentId != null) {
      rfEdges.push({ id: `e-${parentId}-${id}`, source: parentId, target: id, type: 'smoothstep', style: { stroke: '#94a3b8', strokeWidth: 1.5 } })
    }

    if (hasChildren && isExpanded) {
      const totalW = node.hijos.reduce((s, c, i) => s + visibleWidth(c, expanded) + (i > 0 ? H_GAP : 0), 0)
      let cx = x - totalW / 2
      for (const child of node.hijos) {
        const cw = visibleWidth(child, expanded)
        walk(child, cx + cw / 2, depth + 1, id)
        cx += cw + H_GAP
      }
    }
  }

  walk(root, visibleWidth(root, expanded) / 2, 0, null)
  return { nodes: rfNodes, edges: rfEdges }
}

function OrgNode({ data }: NodeProps<Node<OrgNodeData>>) {
  const { hasChildren, isExpanded, tipo, nombre, persona, codigo, height, onPersonaClick, isHighlighted } = data
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        style={{ width: NODE_W, minHeight: height }}
        className={[
          'bg-white rounded-xl px-3 py-2.5 shadow-sm transition-all select-none duration-700',
          isHighlighted ? 'ring-4 ring-amber-400 bg-amber-50' : '',
          hasChildren
            ? isExpanded
              ? 'border-2 border-primary-500 cursor-pointer hover:shadow-md hover:border-primary-600'
              : 'border-2 border-primary-300 cursor-pointer hover:border-primary-500 hover:shadow-md'
            : 'border border-gray-300 bg-gray-50 cursor-default',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-1.5 mb-1.5">
          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${tipoColor(tipo)}`}>{tipo}</span>
          {hasChildren && (
            <span className={`flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-white transition-colors ${isExpanded ? 'bg-primary-600' : 'bg-primary-400'}`}>
              {isExpanded ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
            </span>
          )}
        </div>
        <p className="text-xs font-semibold text-gray-900 leading-snug">{stripRedundantPrefix(nombre)}</p>
        {persona ? (
          <p
            className="text-[10px] text-primary-700 mt-0.5 truncate flex items-center gap-0.5 hover:underline"
            onClick={(e) => {
              e.stopPropagation()
              onPersonaClick({ persona, nodeName: stripRedundantPrefix(nombre), nodeTitle: tipo })
            }}
            title="Ver datos de la persona"
          >
            <UserIcon className="w-2.5 h-2.5 flex-shrink-0" />
            {persona.nombre}
          </p>
        ) : (
          <p className="text-[10px] text-amber-600 font-medium italic mt-0.5">Vacante</p>
        )}
        {codigo && tipo !== 'REGIMEN' && <p className="text-[9px] font-mono text-gray-400 mt-1 truncate">{codigo}</p>}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  )
}

const nodeTypes = { orgNode: OrgNode }

interface JumpSignal extends SearchMatch {
  nonce: number
}

interface FlowInnerProps {
  data: OrganigramaNodo
  sigla?: string
  onPersonaClick: (data: PersonaSeleccionada) => void
  jumpSignal: JumpSignal | null
  highlightId: string | null
}

function FlowInner({ data, sigla, onPersonaClick, jumpSignal, highlightId }: FlowInnerProps) {
  const { fitView } = useReactFlow()
  const lastActionRef = useRef<{ type: 'expand' | 'collapse' | null; id: string | null }>({ type: null, id: null })
  const [exporting, setExporting] = useState(false)

  const annotated = useMemo(() => assignIds(data), [data])

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([annotated._id]))
  useEffect(() => {
    lastActionRef.current = { type: null, id: null }
    setExpanded(new Set([annotated._id]))
  }, [annotated])

  const idMap = useMemo(() => {
    const map = new Map<string, string>()
    function visit(n: NodoAnotado) {
      map.set(n.id, n._id)
      n.hijos.forEach(visit)
    }
    visit(annotated)
    return map
  }, [annotated])

  useEffect(() => {
    if (!jumpSignal) return
    const idsToExpand = jumpSignal.path.map((rawId) => idMap.get(rawId)).filter((v): v is string => !!v)
    if (!idsToExpand.length) return
    setExpanded((prev) => {
      let changed = false
      const next = new Set(prev)
      idsToExpand.forEach((id) => {
        if (!next.has(id)) {
          next.add(id)
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [jumpSignal, idMap])

  useEffect(() => {
    const { type, id } = lastActionRef.current
    const t = setTimeout(() => {
      if (type === 'expand' && id) {
        const ids = getDirectChildIds(annotated, id)
        if (ids?.length) {
          fitView({ nodes: ids.map((i) => ({ id: i })), padding: 0.25, duration: 450 })
          return
        }
      }
      fitView({ padding: 0.12, duration: 450 })
    }, 120)
    return () => clearTimeout(t)
  }, [expanded, fitView, annotated])

  const { nodes, edges } = useMemo(() => buildGraph(annotated, expanded, onPersonaClick, highlightId), [annotated, expanded, onPersonaClick, highlightId])

  useEffect(() => {
    if (!jumpSignal) return
    const targetRfId = idMap.get(jumpSignal.id)
    if (!targetRfId || !nodes.some((n) => n.id === targetRfId)) return
    const t = setTimeout(() => {
      fitView({ nodes: [{ id: targetRfId }], padding: 0.5, duration: 450, maxZoom: 1.2 })
    }, 250)
    return () => clearTimeout(t)
  }, [jumpSignal, idMap, fitView, nodes])

  const onNodeClick = useCallback((_: unknown, node: Node<OrgNodeData>) => {
    if (!node.data.hasChildren) return
    const id = node.id
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        lastActionRef.current = { type: 'collapse', id }
      } else {
        next.add(id)
        lastActionRef.current = { type: 'expand', id }
      }
      return next
    })
  }, [])

  const exportAsImage = useCallback(async () => {
    const viewportEl = document.querySelector('.react-flow__viewport') as HTMLElement | null
    if (!viewportEl || nodes.length === 0) return
    setExporting(true)
    try {
      const bounds = nodes.reduce(
        (acc, n) => ({
          x: Math.min(acc.x, n.position.x),
          y: Math.min(acc.y, n.position.y),
          right: Math.max(acc.right, n.position.x + NODE_W),
          bottom: Math.max(acc.bottom, n.position.y + n.data.height + 12),
        }),
        { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity }
      )
      const boundsWH = { ...bounds, width: bounds.right - bounds.x, height: bounds.bottom - bounds.y }
      let width = Math.max(boundsWH.width * EXPORT_SCALE, 400)
      let height = Math.max(boundsWH.height * EXPORT_SCALE, 300)
      if (width > EXPORT_MAX_DIM || height > EXPORT_MAX_DIM) {
        const factor = EXPORT_MAX_DIM / Math.max(width, height)
        width *= factor
        height *= factor
      }
      width = Math.round(width)
      height = Math.round(height)
      const { x, y, zoom } = getViewportForBounds(boundsWH, width, height, 0.1, 4, 0.08)

      const dataUrl = await toPng(viewportEl, {
        backgroundColor: '#fafafa',
        width,
        height,
        pixelRatio: 1,
        style: { width: `${width}px`, height: `${height}px`, transform: `translate(${x}px, ${y}px) scale(${zoom})` },
      })

      const date = new Date().toISOString().slice(0, 10)
      const link = document.createElement('a')
      link.download = `organigrama-${sigla || 'hospital'}-${date}.png`
      link.href = dataUrl
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('[exportAsImage] Error:', err)
      alert('Error al exportar el organigrama. Por favor intentá nuevamente.')
    } finally {
      setExporting(false)
    }
  }, [nodes, sigla])

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.1}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background color="#e2e8f0" gap={20} />
        <Controls showInteractive={false} />
        <Panel position="top-right">
          <button
            type="button"
            onClick={exportAsImage}
            disabled={exporting}
            title="Descargar diagrama como imagen PNG"
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white shadow-sm hover:bg-primary-50 hover:border-primary-200 hover:text-primary-700 text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowDownTrayIcon className="w-3.5 h-3.5" />
            {exporting ? 'Generando...' : 'Descargar imagen'}
          </button>
        </Panel>
        <MiniMap className="hidden sm:block" nodeColor={(n) => (n.data.hasChildren ? '#0f766e' : '#cbd5e1')} style={{ height: 100 }} pannable zoomable />
      </ReactFlow>
    </div>
  )
}

interface Props {
  data: OrganigramaNodo
  resetKey: number
  sigla?: string
  onPersonaClick: (data: PersonaSeleccionada) => void
  jumpSignal: JumpSignal | null
  highlightId: string | null
}

// key=resetKey remonta FlowInner al reiniciar (reset de estado garantizado)
export default function OrganigramaFlowView({ data, resetKey, sigla, onPersonaClick, jumpSignal, highlightId }: Props) {
  return (
    <ReactFlowProvider>
      <FlowInner key={resetKey} data={data} sigla={sigla} onPersonaClick={onPersonaClick} jumpSignal={jumpSignal} highlightId={highlightId} />
    </ReactFlowProvider>
  )
}
