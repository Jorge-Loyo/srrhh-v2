import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap, Panel,
  Handle, Position, useReactFlow, ReactFlowProvider,
  getViewportForBounds,
  type Node, type Edge, type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toPng } from 'html-to-image'
import { ChevronDownIcon, ChevronRightIcon, UserIcon, ArrowDownTrayIcon, BuildingOfficeIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { tipoColor, stripRedundantPrefix, agruparDept, UMBRAL_DEPT } from '../lib/organigramaHelpers'
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
const H_GAP = 16
const V_GAP = 60

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
  let lines = 1, lineWidth = 0
  const spaceWidth = measureCtx.measureText(' ').width
  for (const word of words) {
    const wordWidth = measureCtx.measureText(word).width
    if (lineWidth > 0 && lineWidth + spaceWidth + wordWidth > availableWidth) { lines++; lineWidth = wordWidth }
    else lineWidth += (lineWidth > 0 ? spaceWidth : 0) + wordWidth
  }
  return lines
}

function estimateNodeHeight(name: string | null): number {
  const lines = countWrappedLines(stripRedundantPrefix(name), NODE_W - NAME_PADDING_X)
  return Math.max(NODE_H_MIN, HEADER_FOOTER_H + lines * NAME_LINE_H)
}

interface NodoAnotado extends Omit<OrganigramaNodo, 'hijos'> {
  _id: string
  hijos: NodoAnotado[]
}

function assignIds(node: OrganigramaNodo, prefix = 'n0'): NodoAnotado {
  return { ...node, _id: prefix, hijos: node.hijos.map((c, i) => assignIds(c, `${prefix}-${i}`)) }
}

// Devuelve el nodo con ese _id buscando en todo el árbol
function findNode(root: NodoAnotado, id: string): NodoAnotado | null {
  if (root._id === id) return root
  for (const c of root.hijos) { const r = findNode(c, id); if (r) return r }
  return null
}

interface OrgNodeData {
  [key: string]: unknown
  tipo: string
  nombre: string | null
  persona: OrganigramaNodo['persona']
  codigo: string
  hasChildren: boolean
  childCount: number
  isActive: boolean
  isGroup: boolean
  height: number
  onPersonaClick: (data: PersonaSeleccionada) => void
  isHighlighted: boolean
}

// focusPath: camino de _ids de nodos reales desde raíz hasta el nodo activo
// activeGroup: si el último paso fue entrar a un grupo virtual, sus miembros
interface NavState {
  focusPath: string[]
  activeGroup?: { groupId: string; memberIds: string[]; label: string }
}

// Grupos virtuales: mapa de groupId -> lista de _ids de sus miembros
type GroupMap = Map<string, string[]>

function buildGraph(
  root: NodoAnotado,
  nav: NavState,
  onPersonaClick: (data: PersonaSeleccionada) => void,
  highlightId: string | null | undefined
): { nodes: Node<OrgNodeData>[]; edges: Edge[]; groupMap: GroupMap } {
  const rfNodes: Node<OrgNodeData>[] = []
  const rfEdges: Edge[] = []
  const groupMap: GroupMap = new Map()

  // Recolectar nodos visibles: el camino activo + los hijos del último nodo del camino
  // Cada nivel del camino muestra solo el nodo seleccionado (no sus hermanos)
  const visibleIds = new Set<string>()
  const pathNodes: NodoAnotado[] = []

  for (const pid of nav.focusPath) {
    const n = findNode(root, pid)
    if (n) { visibleIds.add(pid); pathNodes.push(n) }
  }

  // Hijos del último nodo del camino (nivel actual a explorar)
  const lastNode = pathNodes[pathNodes.length - 1] ?? root
  if (!nav.focusPath.length) visibleIds.add(root._id)

  // Calcular posiciones
  const rowY: number[] = []
  let accY = 0
  const totalLevels = nav.focusPath.length + (nav.activeGroup ? 2 : 1)
  for (let d = 0; d < totalLevels; d++) {
    rowY[d] = accY
    accY += NODE_H_MIN + V_GAP
  }

  // Renderizar el camino activo (un nodo por fila, centrado)
  let prevId: string | null = null
  pathNodes.forEach((n, depth) => {
    rfNodes.push({
      id: n._id,
      type: 'orgNode',
      position: { x: 0, y: rowY[depth] ?? 0 },
      data: {
        tipo: n.tipo, nombre: n.nombre, persona: n.persona, codigo: n.id,
        hasChildren: n.hijos.length > 0, childCount: n.hijos.length,
        isActive: true, isGroup: false,
        height: estimateNodeHeight(n.nombre),
        onPersonaClick,
        isHighlighted: highlightId != null && n.id === highlightId,
      },
    })
    if (prevId) rfEdges.push({ id: `e-${prevId}-${n._id}`, source: prevId, target: n._id, type: 'smoothstep', style: { stroke: '#94a3b8', strokeWidth: 1.5 } })
    prevId = n._id
  })

  // Renderizar hijos del último nodo del camino
  const childDepth = nav.focusPath.length
  const childY = rowY[childDepth] ?? accY

  // Separar hijos DEPT en grupos si superan umbral
  const rawHijos = lastNode === root && nav.focusPath.length === 0 ? [] : lastNode.hijos
  const hijosDept = rawHijos.filter((h) => h.tipo === 'DEPT')
  const hijosNormales = hijosDept.length >= UMBRAL_DEPT ? rawHijos.filter((h) => h.tipo !== 'DEPT') : rawHijos
  const grupos = hijosDept.length >= UMBRAL_DEPT ? agruparDept(hijosDept) : []

  type EfItem =
    | { tipo: 'nodo'; nodo: NodoAnotado }
    | { tipo: 'grupo'; groupId: string; label: string; miembros: NodoAnotado[] }

  const efectivos: EfItem[] = [
    ...hijosNormales.map((h) => ({ tipo: 'nodo' as const, nodo: h })),
    ...grupos.map((g, gi) => ({
      tipo: 'grupo' as const,
      groupId: `${lastNode._id}-grp-${gi}`,
      label: g.label,
      miembros: g.nodos.map((n) => lastNode.hijos.find((h) => h.id === n.id)!).filter(Boolean),
    })),
  ]

  // Si no hay camino aún, mostrar solo la raíz
  if (nav.focusPath.length === 0 && !nav.activeGroup) {
    rfNodes.push({
      id: root._id,
      type: 'orgNode',
      position: { x: 0, y: 0 },
      data: {
        tipo: root.tipo, nombre: root.nombre, persona: root.persona, codigo: root.id,
        hasChildren: root.hijos.length > 0, childCount: root.hijos.length,
        isActive: true, isGroup: false,
        height: estimateNodeHeight(root.nombre),
        onPersonaClick,
        isHighlighted: highlightId != null && root.id === highlightId,
      },
    })
    return { nodes: rfNodes, edges: rfEdges, groupMap }
  }

  // Si hay grupo activo: renderizar el nodo grupo como activo + sus miembros abajo
  if (nav.activeGroup) {
    const grpDepth = nav.focusPath.length
    const grpY = rowY[grpDepth] ?? accY
    const membDepth = grpDepth + 1
    const membY = rowY[membDepth] ?? (grpY + NODE_H_MIN + V_GAP)

    // Nodo grupo activo (centrado)
    rfNodes.push({
      id: nav.activeGroup.groupId,
      type: 'orgNode',
      position: { x: 0, y: grpY },
      data: {
        tipo: 'AREA_PROG', nombre: nav.activeGroup.label, persona: null, codigo: '',
        hasChildren: true, childCount: nav.activeGroup.memberIds.length,
        isActive: true, isGroup: true,
        height: NODE_H_MIN, onPersonaClick, isHighlighted: false,
      },
    })
    if (prevId) rfEdges.push({ id: `e-${prevId}-${nav.activeGroup.groupId}`, source: prevId, target: nav.activeGroup.groupId, type: 'smoothstep', style: { stroke: '#93c5fd', strokeWidth: 1.5 } })

    // Miembros del grupo
    const members = nav.activeGroup.memberIds.map((mid) => findNode(root, mid)).filter((n): n is NodoAnotado => !!n)
    const totalMembW = members.reduce((s, _, i) => s + NODE_W + (i > 0 ? H_GAP : 0), 0)
    let mx = -totalMembW / 2
    for (const m of members) {
      rfNodes.push({
        id: m._id, type: 'orgNode',
        position: { x: mx, y: membY },
        data: {
          tipo: m.tipo, nombre: m.nombre, persona: m.persona, codigo: m.id,
          hasChildren: m.hijos.length > 0, childCount: m.hijos.length,
          isActive: false, isGroup: false,
          height: estimateNodeHeight(m.nombre), onPersonaClick,
          isHighlighted: highlightId != null && m.id === highlightId,
        },
      })
      rfEdges.push({ id: `e-${nav.activeGroup.groupId}-${m._id}`, source: nav.activeGroup.groupId, target: m._id, type: 'smoothstep', style: { stroke: '#93c5fd', strokeWidth: 1.5 } })
      mx += NODE_W + H_GAP
    }
    return { nodes: rfNodes, edges: rfEdges, groupMap }
  }

  const totalChildW = efectivos.reduce((s, e, i) => s + NODE_W + (i > 0 ? H_GAP : 0), 0)
  let cx = -totalChildW / 2

  for (const ef of efectivos) {
    if (ef.tipo === 'nodo') {
      const n = ef.nodo
      rfNodes.push({
        id: n._id,
        type: 'orgNode',
        position: { x: cx, y: childY },
        data: {
          tipo: n.tipo, nombre: n.nombre, persona: n.persona, codigo: n.id,
          hasChildren: n.hijos.length > 0, childCount: n.hijos.length,
          isActive: false, isGroup: false,
          height: estimateNodeHeight(n.nombre),
          onPersonaClick,
          isHighlighted: highlightId != null && n.id === highlightId,
        },
      })
      if (prevId) rfEdges.push({ id: `e-${prevId}-${n._id}`, source: prevId, target: n._id, type: 'smoothstep', style: { stroke: '#94a3b8', strokeWidth: 1.5 } })
      cx += NODE_W + H_GAP
    } else {
      const gid = ef.groupId
      groupMap.set(gid, ef.miembros.map((m) => m._id))
      rfNodes.push({
        id: gid,
        type: 'orgNode',
        position: { x: cx, y: childY },
        data: {
          tipo: 'AREA_PROG', nombre: ef.label, persona: null, codigo: '',
          hasChildren: true, childCount: ef.miembros.length,
          isActive: false, isGroup: true,
          height: NODE_H_MIN,
          onPersonaClick,
          isHighlighted: false,
        },
      })
      if (prevId) rfEdges.push({ id: `e-${prevId}-${gid}`, source: prevId, target: gid, type: 'smoothstep', style: { stroke: '#93c5fd', strokeWidth: 1.5 } })
      cx += NODE_W + H_GAP
    }
  }

  return { nodes: rfNodes, edges: rfEdges, groupMap }
}

function OrgNode({ data }: NodeProps<Node<OrgNodeData>>) {
  const { hasChildren, childCount, isActive, isGroup, tipo, nombre, persona, codigo, height, onPersonaClick, isHighlighted } = data

  if (isGroup) {
    return (
      <>
        <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        <div
          style={{ width: NODE_W, minHeight: NODE_H_MIN }}
          className="bg-blue-50 border-2 border-blue-200 hover:border-blue-400 rounded-xl px-3 py-2.5 shadow-sm cursor-pointer select-none transition-all"
        >
          <div className="flex items-center gap-2">
            <BuildingOfficeIcon className="w-5 h-5 text-blue-500 flex-shrink-0" />
            <p className="text-xs font-semibold text-blue-700 leading-snug flex-1">{nombre}</p>
            <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-blue-300 text-white text-[10px] font-bold">
              <ChevronRightIcon className="w-3 h-3" />
            </span>
          </div>
        </div>
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      </>
    )
  }

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        style={{ width: NODE_W, minHeight: height }}
        className={[
          'bg-white rounded-xl px-3 py-2.5 shadow-sm transition-all select-none',
          isHighlighted ? 'ring-4 ring-amber-400 bg-amber-50' : '',
          isActive
            ? 'border-2 border-primary-600 shadow-md'
            : hasChildren
              ? 'border-2 border-primary-300 cursor-pointer hover:border-primary-500 hover:shadow-md'
              : 'border border-gray-300 bg-gray-50 cursor-default',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-1.5 mb-1.5">
          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${tipoColor(tipo)}`}>{tipo}</span>
          {hasChildren && (
            <span className={`flex-shrink-0 flex items-center justify-center gap-0.5 px-1.5 h-5 rounded-full text-white text-[10px] font-bold transition-colors ${isActive ? 'bg-primary-600' : 'bg-primary-400'}`}>
              {isActive ? <ChevronDownIcon className="w-3 h-3" /> : childCount > 9 ? childCount : <ChevronRightIcon className="w-3 h-3" />}
            </span>
          )}
        </div>
        <p className="text-xs font-semibold text-gray-900 leading-snug">{stripRedundantPrefix(nombre)}</p>
        {persona ? (
          <p
            className="text-[10px] text-primary-700 mt-0.5 truncate flex items-center gap-0.5 hover:underline cursor-pointer"
            onClick={(e) => { e.stopPropagation(); onPersonaClick({ persona, nodeName: stripRedundantPrefix(nombre), nodeTitle: tipo }) }}
          >
            <UserIcon className="w-2.5 h-2.5 flex-shrink-0" />
            {persona.nombre}
            {persona.codigoCargo && <span className="font-mono text-[9px] bg-gray-100 text-gray-400 px-1 rounded ml-0.5">{persona.codigoCargo}</span>}
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

interface JumpSignal extends SearchMatch { nonce: number }

interface FlowInnerProps {
  data: OrganigramaNodo
  sigla?: string
  onPersonaClick: (data: PersonaSeleccionada) => void
  jumpSignal: JumpSignal | null
  highlightId: string | null
}

function FlowInner({ data, sigla, onPersonaClick, jumpSignal, highlightId }: FlowInnerProps) {
  const { fitView } = useReactFlow()
  const [exporting, setExporting] = useState(false)
  const annotated = useMemo(() => assignIds(data), [data])

  // Historial de estados de navegación para el botón "Volver"
  const [history, setHistory] = useState<NavState[]>([{ focusPath: [] }])
  const nav = history[history.length - 1]!

  useEffect(() => {
    setHistory([{ focusPath: [] }])
  }, [annotated])

  const idMap = useMemo(() => {
    const map = new Map<string, string>()
    function visit(n: NodoAnotado) { map.set(n.id, n._id); n.hijos.forEach(visit) }
    visit(annotated)
    return map
  }, [annotated])

  // jumpSignal: expandir el camino hasta el nodo buscado
  useEffect(() => {
    if (!jumpSignal) return
    const pathIds = jumpSignal.path.map((rawId) => idMap.get(rawId)).filter((v): v is string => !!v)
    const targetId = idMap.get(jumpSignal.id)
    if (!targetId) return
    const fullPath = targetId ? [...pathIds, targetId] : pathIds
    setHistory((prev) => [...prev, { focusPath: fullPath }])
  }, [jumpSignal, idMap])

  const { nodes, edges, groupMap } = useMemo(
    () => buildGraph(annotated, nav, onPersonaClick, highlightId),
    [annotated, nav, onPersonaClick, highlightId]
  )

  // groupMap ref para acceder en onNodeClick sin re-crear el callback
  const groupMapRef = useRef<GroupMap>(groupMap)
  useEffect(() => { groupMapRef.current = groupMap }, [groupMap])

  // fitView cada vez que cambia la navegación
  const prevNavRef = useRef(nav)
  useEffect(() => {
    if (prevNavRef.current === nav) return
    prevNavRef.current = nav
    const t = setTimeout(() => fitView({ padding: 0.2, duration: 450 }), 120)
    return () => clearTimeout(t)
  }, [nav, fitView])

  // highlight: scroll al nodo
  useEffect(() => {
    if (!jumpSignal) return
    const targetRfId = idMap.get(jumpSignal.id)
    if (!targetRfId || !nodes.some((n) => n.id === targetRfId)) return
    const t = setTimeout(() => fitView({ nodes: [{ id: targetRfId }], padding: 0.5, duration: 450, maxZoom: 1.2 }), 250)
    return () => clearTimeout(t)
  }, [jumpSignal, idMap, fitView, nodes])

  const onNodeClick = useCallback((_: unknown, node: Node<OrgNodeData>) => {
    if (!node.data.hasChildren) return
    const clickedId = node.id
    const currentGroupMap = groupMapRef.current

    // Si es el nodo activo (último del camino o grupo activo), no hacer nada
    if (nav.focusPath[nav.focusPath.length - 1] === clickedId) return
    if (nav.activeGroup?.groupId === clickedId) return

    // Si es un nodo del camino anterior, retroceder hasta ese punto
    const idxInPath = nav.focusPath.indexOf(clickedId)
    if (idxInPath >= 0) {
      setHistory((prev) => [...prev, { focusPath: nav.focusPath.slice(0, idxInPath + 1) }])
      return
    }

    // Si es un grupo virtual: entrar al grupo
    const memberIds = currentGroupMap.get(clickedId)
    if (memberIds) {
      const label = (node.data.nombre as string) ?? clickedId
      setHistory((prev) => [...prev, { focusPath: nav.focusPath, activeGroup: { groupId: clickedId, memberIds, label } }])
      return
    }

    // Si es un miembro de un grupo activo: navegar a ese nodo
    setHistory((prev) => [...prev, { focusPath: [...nav.focusPath, clickedId] }])
  }, [nav])

  const goBack = useCallback(() => {
    setHistory((prev) => prev.length > 1 ? prev.slice(0, -1) : prev)
  }, [])

  const exportAsImage = useCallback(async () => {
    const viewportEl = document.querySelector('.react-flow__viewport') as HTMLElement | null
    if (!viewportEl || nodes.length === 0) return
    setExporting(true)
    try {
      const bounds = nodes.reduce(
        (acc, n) => ({
          x: Math.min(acc.x, n.position.x), y: Math.min(acc.y, n.position.y),
          right: Math.max(acc.right, n.position.x + NODE_W),
          bottom: Math.max(acc.bottom, n.position.y + (n.data.height as number) + 12),
        }),
        { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity }
      )
      const boundsWH = { ...bounds, width: bounds.right - bounds.x, height: bounds.bottom - bounds.y }
      let width = Math.max(boundsWH.width * EXPORT_SCALE, 400)
      let height = Math.max(boundsWH.height * EXPORT_SCALE, 300)
      if (width > EXPORT_MAX_DIM || height > EXPORT_MAX_DIM) {
        const factor = EXPORT_MAX_DIM / Math.max(width, height)
        width *= factor; height *= factor
      }
      width = Math.round(width); height = Math.round(height)
      const { x, y, zoom } = getViewportForBounds(boundsWH, width, height, 0.1, 4, 0.08)
      const dataUrl = await toPng(viewportEl, {
        backgroundColor: '#fafafa', width, height, pixelRatio: 1,
        style: { width: `${width}px`, height: `${height}px`, transform: `translate(${x}px, ${y}px) scale(${zoom})` },
      })
      const date = new Date().toISOString().slice(0, 10)
      const link = document.createElement('a')
      link.download = `organigrama-${sigla || 'hospital'}-${date}.png`
      link.href = dataUrl
      document.body.appendChild(link); link.click(); document.body.removeChild(link)
    } catch (err) {
      console.error('[exportAsImage] Error:', err)
      alert('Error al exportar el organigrama.')
    } finally {
      setExporting(false)
    }
  }, [nodes, sigla])

  const canGoBack = history.length > 1

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1} maxZoom={2}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
      >
        <Background color="#e2e8f0" gap={20} />
        <Controls showInteractive={false} />
        <Panel position="top-left">
          {canGoBack && (
            <button
              onClick={goBack}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white shadow-sm hover:bg-gray-50 text-gray-600 transition-colors"
            >
              <ArrowLeftIcon className="w-3.5 h-3.5" />
              Volver
            </button>
          )}
        </Panel>
        <Panel position="top-right">
          <button
            type="button" onClick={exportAsImage} disabled={exporting}
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white shadow-sm hover:bg-primary-50 hover:border-primary-200 hover:text-primary-700 text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowDownTrayIcon className="w-3.5 h-3.5" />
            {exporting ? 'Generando...' : 'Descargar imagen'}
          </button>
        </Panel>
        <MiniMap className="hidden sm:block" nodeColor={(n) => (n.data.isGroup ? '#93c5fd' : n.data.isActive ? '#0f766e' : '#cbd5e1')} style={{ height: 100 }} pannable zoomable />
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

export default function OrganigramaFlowView({ data, resetKey, sigla, onPersonaClick, jumpSignal, highlightId }: Props) {
  return (
    <ReactFlowProvider>
      <FlowInner key={resetKey} data={data} sigla={sigla} onPersonaClick={onPersonaClick} jumpSignal={jumpSignal} highlightId={highlightId} />
    </ReactFlowProvider>
  )
}
