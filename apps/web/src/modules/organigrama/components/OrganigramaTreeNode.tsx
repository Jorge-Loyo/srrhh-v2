import { useEffect, useRef, useState, memo } from 'react'
import { ChevronRightIcon, ChevronDownIcon, UserIcon } from '@heroicons/react/24/outline'
import { tipoColor, stripRedundantPrefix } from '../lib/organigramaHelpers'
import type { OrganigramaNodo, OrganigramaPersona } from '../hooks/useOrganigrama'

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
}

export const TreeNode = memo(function TreeNode({ node, depth = 0, onPersonaClick, forceOpenIds, highlightId }: Props) {
  const [open, setOpen] = useState(depth < 3)
  const hasChildren = node.hijos.length > 0
  const indent = depth * 20
  const isHighlighted = highlightId != null && node.id === highlightId
  const rowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (forceOpenIds?.has(node.id)) setOpen(true)
  }, [forceOpenIds, node.id])

  useEffect(() => {
    if (isHighlighted) rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [isHighlighted])

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
          onClick={() => setOpen((o) => !o)}
          className={`flex-shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center rounded ${
            hasChildren ? 'text-gray-500 hover:text-gray-800' : 'text-transparent cursor-default'
          }`}
        >
          {hasChildren ? open ? <ChevronDownIcon className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" /> : null}
        </button>

        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 mt-0.5 ${tipoColor(node.tipo)}`}>
          {node.tipo}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 leading-tight">{stripRedundantPrefix(node.nombre)}</p>
          {node.persona ? (
            <p
              className="text-xs text-primary-700 flex items-center gap-1 mt-0.5 cursor-pointer hover:underline"
              onClick={() => onPersonaClick({ persona: node.persona!, nodeName: stripRedundantPrefix(node.nombre), nodeTitle: node.tipo })}
              title="Ver datos de la persona"
            >
              <UserIcon className="w-3 h-3 flex-shrink-0" />
              {node.persona.nombre}
              {node.persona.cargo && <span className="text-gray-600 ml-1">· {node.persona.cargo}</span>}
            </p>
          ) : (
            <p className="text-xs text-amber-600 font-medium mt-0.5 italic">Vacante</p>
          )}
          {node.id && node.tipo !== 'REGIMEN' && (
            <span className="inline-block text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded mt-1">{node.id}</span>
          )}
        </div>
      </div>

      {hasChildren && open && (
        <div>
          {node.hijos.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} onPersonaClick={onPersonaClick} forceOpenIds={forceOpenIds} highlightId={highlightId} />
          ))}
        </div>
      )}
    </div>
  )
})
