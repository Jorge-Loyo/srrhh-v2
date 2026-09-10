import { useEffect, useRef, useCallback, memo, useMemo, useState } from 'react'
import { ChevronRightIcon, ChevronDownIcon, UserIcon, BriefcaseIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline'
import { useNavigate } from 'react-router-dom'
import { tipoColor, stripRedundantPrefix, agruparDept, UMBRAL_DEPT } from '../lib/organigramaHelpers'
import type { OrganigramaNodo, OrganigramaPersona } from '../hooks/useOrganigrama'
import type { GrupoDept } from '../lib/organigramaHelpers'

export interface PersonaSeleccionada {
  persona: OrganigramaPersona
  nodeName: string
  nodeTitle: string
}

interface Props {
  node: OrganigramaNodo
  depth?: number
  onPersonaClick: (data: PersonaSeleccionada) => void
  forceOpenIds?: Set<string>
  highlightId?: string | null
  // Accordion: el padre controla qué hijo está abierto
  isOpen?: boolean
  onToggle?: (id: string) => void
}

// Nodo hoja de acordeón para grupos DEPT
const GrupoDeptAcordeon = memo(function GrupoDeptAcordeon({
  grupo, depth, onPersonaClick, forceOpenIds, highlightId,
  isOpen, onToggle,
}: {
  grupo: GrupoDept
  depth: number
  onPersonaClick: (data: PersonaSeleccionada) => void
  forceOpenIds?: Set<string>
  highlightId?: string | null
  isOpen: boolean
  onToggle: (id: string) => void
}) {
  const indent = depth * 20
  // openChildId: qué hijo del grupo está abierto (accordion interno)
  const [openChildId, setOpenChildId] = useState<string | null>(null)

  // Forzar apertura si algún nodo del grupo está en forceOpenIds
  useEffect(() => {
    if (forceOpenIds && grupo.nodos.some((n) => forceOpenIds.has(n.id))) {
      onToggle(grupo.label)
      const target = grupo.nodos.find((n) => forceOpenIds.has(n.id))
      if (target) setOpenChildId(target.id)
    }
  }, [forceOpenIds, grupo.nodos, grupo.label, onToggle])

  const handleChildToggle = useCallback((id: string) => {
    setOpenChildId((prev) => (prev === id ? null : id))
  }, [])

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-blue-50 cursor-pointer border border-transparent hover:border-blue-100"
        style={{ marginLeft: indent }}
        onClick={() => onToggle(grupo.label)}
      >
        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-gray-400">
          {isOpen ? <ChevronDownIcon className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />}
        </span>
        <BuildingOfficeIcon className="w-5 h-5 text-blue-500 flex-shrink-0" />
        <span className="text-sm font-semibold text-blue-700">{grupo.label}</span>
      </div>
      {isOpen && (
        <div>
          {grupo.nodos.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onPersonaClick={onPersonaClick}
              forceOpenIds={forceOpenIds}
              highlightId={highlightId}
              isOpen={openChildId === child.id}
              onToggle={handleChildToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
})

export const TreeNode = memo(function TreeNode({
  node, depth = 0, onPersonaClick, forceOpenIds, highlightId,
  isOpen: isOpenProp, onToggle,
}: Props) {
  // Nodo raíz (depth=0) maneja su propio estado; el resto es controlado por el padre
  const [rootOpen, setRootOpen] = useState(true)
  const isOpen = depth === 0 ? rootOpen : (isOpenProp ?? false)

  // openChildId: qué hijo directo está abierto (accordion)
  const [openChildId, setOpenChildId] = useState<string | null>(() => {
    // Al iniciar, abrir el primer hijo si depth < 1
    return depth < 1 && node.hijos.length > 0 ? node.hijos[0]!.id : null
  })
  // openGroupLabel: qué grupo DEPT está abierto
  const [openGroupLabel, setOpenGroupLabel] = useState<string | null>(null)

  const navigate = useNavigate()
  const hasChildren = node.hijos.length > 0
  const indent = depth * 20
  const isHighlighted = highlightId != null && node.id === highlightId
  const rowRef = useRef<HTMLDivElement>(null)

  // forceOpen: si este nodo está en forceOpenIds, abrirlo y notificar al padre
  useEffect(() => {
    if (!forceOpenIds?.has(node.id)) return
    if (depth === 0) setRootOpen(true)
    else onToggle?.(node.id)
  }, [forceOpenIds, node.id, depth, onToggle])

  // forceOpen: si un descendiente está en forceOpenIds, abrir el hijo correcto
  useEffect(() => {
    if (!forceOpenIds || !hasChildren) return
    for (const child of node.hijos) {
      if (forceOpenIds.has(child.id)) {
        setOpenChildId(child.id)
        return
      }
    }
  }, [forceOpenIds, node.hijos, hasChildren])

  useEffect(() => {
    if (isHighlighted) rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [isHighlighted])

  const handleToggleSelf = useCallback(() => {
    if (depth === 0) setRootOpen((o) => !o)
    else onToggle?.(node.id)
  }, [depth, onToggle, node.id])

  const handleChildToggle = useCallback((id: string) => {
    setOpenChildId((prev) => (prev === id ? null : id))
    setOpenGroupLabel(null)
  }, [])

  const handleGroupToggle = useCallback((label: string) => {
    setOpenGroupLabel((prev) => (prev === label ? null : label))
    setOpenChildId(null)
  }, [])

  const { hijosNormales, gruposDept } = useMemo(() => {
    const hijosDept = node.hijos.filter((h) => h.tipo === 'DEPT')
    if (hijosDept.length < UMBRAL_DEPT) return { hijosNormales: node.hijos, gruposDept: [] as GrupoDept[] }
    return { hijosNormales: node.hijos.filter((h) => h.tipo !== 'DEPT'), gruposDept: agruparDept(hijosDept) }
  }, [node.hijos])

  return (
    <div>
      <div
        ref={rowRef}
        className={`flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors duration-700 ${
          depth === 0 ? 'mb-1' : ''
        } ${isHighlighted ? 'bg-amber-100 ring-2 ring-amber-400' : ''}`}
        style={{ marginLeft: indent }}
      >
        <button
          onClick={handleToggleSelf}
          className={`flex-shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center rounded ${
            hasChildren ? 'text-gray-500 hover:text-gray-800' : 'text-transparent cursor-default'
          }`}
        >
          {hasChildren ? isOpen ? <ChevronDownIcon className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" /> : null}
        </button>

        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 mt-0.5 ${tipoColor(node.tipo)}`}>
          {node.tipo}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 leading-tight">{stripRedundantPrefix(node.nombre)}</p>
          {node.persona ? (
            <p
              className="text-xs text-secondary flex items-center gap-1 mt-0.5 cursor-pointer hover:underline"
              onClick={() => onPersonaClick({ persona: node.persona!, nodeName: stripRedundantPrefix(node.nombre), nodeTitle: node.tipo })}
            >
              <UserIcon className="w-3 h-3 flex-shrink-0" />
              {node.persona.nombre}
              {node.persona.cargo && <span className="text-gray-500 ml-1">· {node.persona.cargo}</span>}
              {node.persona.codigoCargo && (
                <span className="font-mono text-[10px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded ml-1">{node.persona.codigoCargo}</span>
              )}
            </p>
          ) : node.cargoVacante ? (
            <p className="text-xs text-amber-600 font-medium mt-0.5 flex items-center gap-1.5">
              <span className="italic">Vacante</span>
              <button
                onClick={() => navigate(`/cargos/${node.cargoVacante!.cargoId}`)}
                className="inline-flex items-center gap-1 font-mono text-[10px] bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-0.5 rounded hover:bg-amber-100 transition-colors not-italic"
              >
                <BriefcaseIcon className="w-3 h-3" />
                {node.cargoVacante.codigoCargo ?? 'Ver cargo'}
              </button>
            </p>
          ) : node.razonSinCargo === 'guardia_residencia_docente' ? (
            <p className="text-xs text-gray-400 mt-0.5 italic">Guardia / Residencia</p>
          ) : node.razonSinCargo === 'dato_incompleto' ? (
            <p className="text-xs text-gray-400 mt-0.5 italic">Dato incompleto en padrón</p>
          ) : (
            <p className="text-xs text-amber-600 font-medium mt-0.5 italic">Vacante</p>
          )}
          {node.id && node.tipo !== 'REGIMEN' && (
            <span className="inline-block text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded mt-1">{node.id}</span>
          )}
        </div>
      </div>

      {hasChildren && isOpen && (
        <div>
          {hijosNormales.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onPersonaClick={onPersonaClick}
              forceOpenIds={forceOpenIds}
              highlightId={highlightId}
              isOpen={openChildId === child.id}
              onToggle={handleChildToggle}
            />
          ))}
          {gruposDept.map((grupo) => (
            <GrupoDeptAcordeon
              key={grupo.label}
              grupo={grupo}
              depth={depth + 1}
              onPersonaClick={onPersonaClick}
              forceOpenIds={forceOpenIds}
              highlightId={highlightId}
              isOpen={openGroupLabel === grupo.label}
              onToggle={handleGroupToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
})
