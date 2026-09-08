import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChartBarSquareIcon, ArrowLeftIcon, ArrowPathIcon, ExclamationTriangleIcon,
  ChevronDownIcon, ChevronUpIcon, MagnifyingGlassIcon, XMarkIcon,
} from '@heroicons/react/24/outline'
import { useOrganigrama, type Seccion } from '../hooks/useOrganigrama'
import { getApiErrorMessage } from '@/shared/lib/utils'
import VacantesModal from '../components/VacantesModal'
import PersonaModal from '../components/PersonaModal'
import { TreeNode, type PersonaSeleccionada } from '../components/OrganigramaTreeNode'
import { collectVacantes, searchOrgTree } from '../lib/organigramaHelpers'

// Lazy: es el único punto de la app que usa @xyflow/react + html-to-image —
// separarlo de chunk principal evita que todo el mundo pague ese peso solo
// por tener el router cargado (la vista por defecto es "Árbol", no "Diagrama").
const OrganigramaFlowView = lazy(() => import('../components/OrganigramaFlowView'))

const SECCION_LABELS: Record<string, string> = {
  'nivel-central': 'Nivel Central',
  'atencion-primaria': 'Atención Primaria',
}

// Página única para ambos modos de la app vieja (antes eran dos archivos casi
// idénticos: OrganigramaDetallePage.jsx por sigla y OrganigramaSeccionPage.jsx
// por sección) — acá se unifican porque solo difieren en cómo arman los
// params y el título; el resto (buscador, vacantes, vistas árbol/diagrama) es
// exactamente el mismo código. Sin selector de período — ver el POST_SPRINT
// que documenta esta migración para el porqué.
export function OrganigramaDetallePage() {
  const { code, seccion: seccionParam } = useParams()
  const navigate = useNavigate()

  const seccion = seccionParam as Seccion | undefined
  const sigla = !seccion && code ? code.toUpperCase() : undefined
  const label = seccion ? SECCION_LABELS[seccion] ?? seccion : sigla ?? ''

  const [viewMode, setViewMode] = useState<'arbol' | 'diagrama'>('arbol')
  const [resetKey, setResetKey] = useState(0)
  const [vacantesOpen, setVacantesOpen] = useState(false)
  const [selectedPersona, setSelectedPersona] = useState<PersonaSeleccionada | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState(-1);
  const [jumpSignal, setJumpSignal] = useState<{ id: string; path: string[]; nonce: number } | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const jumpNonceRef = useRef(0)

  const params = seccion ? { seccion } : sigla ? { sigla } : null
  const { data, isLoading, error } = useOrganigrama(params)

  const vacantes = useMemo(() => (data ? collectVacantes(data) : []), [data])
  const searchMatches = useMemo(() => (data ? searchOrgTree(data, searchQuery) : []), [data, searchQuery])

  useEffect(() => {
    setSearchIndex(searchMatches.length ? 0 : -1)
  }, [searchMatches])

  useEffect(() => {
    const match = searchMatches[searchIndex]
    if (!match) {
      setJumpSignal(null)
      return
    }
    jumpNonceRef.current += 1
    setJumpSignal({ ...match, nonce: jumpNonceRef.current })
  }, [searchIndex, searchMatches])

  useEffect(() => {
    if (!jumpSignal) return
    setHighlightId(jumpSignal.id)
    const t = setTimeout(() => setHighlightId(null), 1800)
    return () => clearTimeout(t)
  }, [jumpSignal])

  useEffect(() => {
    setSearchQuery('')
  }, [sigla, seccion])

  const forceOpenIds = useMemo(() => new Set(jumpSignal?.path || []), [jumpSignal])

  const jumpToVacante = useCallback((v: { id: string; idPath: string[] }) => {
    jumpNonceRef.current += 1
    setJumpSignal({ id: v.id, path: v.idPath || [], nonce: jumpNonceRef.current })
  }, [])

  const goToMatch = useCallback(
    (delta: number) => {
      setSearchIndex((i) => {
        if (!searchMatches.length) return -1
        return (i + delta + searchMatches.length) % searchMatches.length
      })
    },
    [searchMatches.length]
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => (seccion ? navigate('/organigrama') : navigate(-1))} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeftIcon className="w-4 h-4" />
            Volver
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ChartBarSquareIcon className="w-5 h-5 text-primary-700" />
            <h1 className="text-lg font-bold text-gray-900">Organigrama – {label}</h1>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="relative">
              <MagnifyingGlassIcon className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar puesto, persona, código..."
                className="pl-7 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg w-44 focus:w-64 transition-all focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <XMarkIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {searchQuery && <span className="text-xs text-gray-500 whitespace-nowrap">{searchMatches.length ? `${searchIndex + 1}/${searchMatches.length}` : 'Sin resultados'}</span>}
            {searchMatches.length > 1 && (
              <>
                <button onClick={() => goToMatch(-1)} title="Anterior" className="p-1 rounded hover:bg-gray-100 text-gray-500">
                  <ChevronUpIcon className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => goToMatch(1)} title="Siguiente" className="p-1 rounded hover:bg-gray-100 text-gray-500">
                  <ChevronDownIcon className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setVacantesOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 transition-colors"
            >
              <ExclamationTriangleIcon className="w-3.5 h-3.5" />
              Vacantes
              {vacantes.length > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-600 text-white text-[10px] font-bold">{vacantes.length}</span>
              )}
            </button>

            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
              {(
                [
                  { key: 'arbol', label: 'Árbol' },
                  { key: 'diagrama', label: 'Diagrama' },
                ] as const
              ).map((v) => (
                <button
                  key={v.key}
                  onClick={() => setViewMode(v.key)}
                  className={`px-3 py-1 text-xs rounded-md transition-all ${viewMode === v.key ? 'bg-white shadow font-semibold text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                setResetKey((k) => k + 1)
                setSearchQuery('')
              }}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors"
              title="Reiniciar vista"
            >
              <ArrowPathIcon className="w-3.5 h-3.5" />
              Reiniciar
            </button>
          </div>
        </div>
      </div>

      <div className={`flex-1 ${viewMode === 'diagrama' ? 'overflow-hidden' : 'overflow-auto'}`}>
        {error && <div className="m-4 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">{getApiErrorMessage(error)}</div>}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
          </div>
        ) : data ? (
          viewMode === 'diagrama' ? (
            <Suspense
              fallback={
                <div className="flex justify-center py-16">
                  <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-700 rounded-full animate-spin" />
                </div>
              }
            >
              <OrganigramaFlowView data={data} resetKey={resetKey} sigla={sigla ?? seccion} onPersonaClick={setSelectedPersona} jumpSignal={jumpSignal} highlightId={highlightId} />
            </Suspense>
          ) : (
            <div className="px-4 py-4 max-w-4xl">
              <TreeNode key={resetKey} node={data} depth={0} onPersonaClick={setSelectedPersona} forceOpenIds={forceOpenIds} highlightId={highlightId} />
            </div>
          )
        ) : !error ? (
          <div className="text-center py-16 text-gray-400">
            <ChartBarSquareIcon className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            <p>
              No se encontró organigrama para <span className="font-semibold">{label}</span>
            </p>
          </div>
        ) : null}
      </div>

      <VacantesModal open={vacantesOpen} onClose={() => setVacantesOpen(false)} vacantes={vacantes} sigla={label} onSelect={jumpToVacante} />
      <PersonaModal open={!!selectedPersona} onClose={() => setSelectedPersona(null)} data={selectedPersona} />
    </div>
  )
}
