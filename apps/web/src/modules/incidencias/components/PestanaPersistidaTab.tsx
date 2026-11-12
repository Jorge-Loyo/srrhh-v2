import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SearchableSelect } from '@/shared/components/ui/SearchableSelect'
import { useEscalafones } from '@/shared/hooks/useCatalogos'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import {
  usePestanaPersistida,
  type PestanaPersistidaSlug,
  type IncidenciaPersistidaItem,
} from '../hooks/useIncidencias'
import { fechaCorta } from '../lib/tabsIncidencias'

// Pestañas de monitoreo (SOLO LECTURA) que leen las incidencias persistidas por
// el paso 12 en padron_incidencias. Un único componente parametrizado por slug:
// comparten filtros (buscar + carrera), paginación y layout; sólo cambian las
// columnas de la tabla. Molde de BajaSinConcursoTab / TodoTab.

// Columna de datos genéricos (código, hospital, carrera, persona…) compartida.
interface ColumnaExtra {
  header: string
  render: (i: IncidenciaPersistidaItem) => ReactNode
}

interface Config {
  descripcion: string
  vacio: string
  columnas: ColumnaExtra[]
}

// — dato → nodo, con guión em como placeholder uniforme (igual que las otras pestañas).
const txt = (v: string | null | undefined): ReactNode => (v && v !== '' ? v : '—')

// Transición de situación de revista destacada; activo→retención es "elegible".
function situacionRevista(i: IncidenciaPersistidaItem): ReactNode {
  return (
    <div className="space-y-1">
      <div className="text-gray-700">
        <span className="font-medium">{txt(i.situacionAnterior)}</span>
        <span className="text-gray-400"> → </span>
        <span className="font-medium">{txt(i.situacionNueva)}</span>
      </div>
      {i.elegibleReemplazante && (
        <span className="inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
          Elegible para reemplazante
        </span>
      )}
    </div>
  )
}

const COLS_COMUNES: ColumnaExtra[] = [
  { header: 'ID SIAL', render: (i) => <span className="font-mono text-xs text-gray-600">{txt(i.idSial)}</span> },
  { header: 'Código', render: (i) => <span className="font-mono text-xs text-gray-600">{txt(i.codigo)}</span> },
  { header: 'Hospital', render: (i) => <span className="text-gray-600">{txt(i.hospitalSigla)}</span> },
  { header: 'Carrera', render: (i) => <span className="text-gray-600">{txt(i.carrera)}</span> },
  {
    header: 'Persona',
    render: (i) => (
      <div>
        <div className="font-medium text-gray-800">{txt(i.personaNombre)}</div>
        {i.personaCuil && <div className="text-xs text-gray-400">{i.personaCuil}</div>}
      </div>
    ),
  },
]

const CONFIG: Record<PestanaPersistidaSlug, Config> = {
  'cayo-del-padron': {
    descripcion:
      'Cargos que estaban presentes el período anterior y cayeron del padrón sin baja SIAL que lo explique. Monitoreo: no modifica datos.',
    vacio: 'No hay cargos que hayan caído del padrón en el último padrón aprobado.',
    columnas: [
      ...COLS_COMUNES,
      { header: 'Puesto', render: (i) => <span className="text-gray-600">{txt(i.puesto)}</span> },
      { header: 'Detalle', render: (i) => <span className="text-gray-600">{txt(i.detalle)}</span> },
    ],
  },
  'cambio-situacion-revista': {
    descripcion:
      'Cargos cuyo ocupante cambió de situación de revista. La transición activo → retención se marca como elegible para reemplazante. Monitoreo: no modifica datos.',
    vacio: 'No hay cambios de situación de revista en el último padrón aprobado.',
    columnas: [
      ...COLS_COMUNES,
      { header: 'Situación (ant → nueva)', render: situacionRevista },
    ],
  },
  'cambios-del-puesto': {
    descripcion:
      'Cargos cuyo puesto o especialidad cambió respecto del período anterior. Monitoreo: no modifica datos.',
    vacio: 'No hay cambios del puesto en el último padrón aprobado.',
    columnas: [
      ...COLS_COMUNES,
      {
        header: 'Puesto (ant → nuevo)',
        render: (i) => (
          <div className="text-gray-700">
            <span>{txt(i.puestoAnterior ?? i.puesto)}</span>
            {(i.puestoNuevo || i.puestoAnterior) && (
              <>
                <span className="text-gray-400"> → </span>
                <span>{txt(i.puestoNuevo ?? i.puesto)}</span>
              </>
            )}
          </div>
        ),
      },
      {
        header: 'Especialidad (ant → nueva)',
        render: (i) => (
          <div className="text-gray-700">
            <span>{txt(i.especialidadAnterior ?? i.especialidad)}</span>
            {(i.especialidadNueva || i.especialidadAnterior) && (
              <>
                <span className="text-gray-400"> → </span>
                <span>{txt(i.especialidadNueva ?? i.especialidad)}</span>
              </>
            )}
          </div>
        ),
      },
      { header: 'Qué cambió', render: (i) => <span className="text-gray-600">{txt(i.detalle)}</span> },
    ],
  },
  otras: {
    descripcion:
      'Otras incidencias del ciclo de vida del cargo: nueva baja, cambió la persona o reapareció. El sub-tipo indica cuál es. Monitoreo: no modifica datos.',
    vacio: 'No hay otras incidencias en el último padrón aprobado.',
    columnas: [
      {
        header: 'Sub-tipo',
        render: (i) => (
          <span className="inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
            {txt(i.subTipo)}
          </span>
        ),
      },
      ...COLS_COMUNES,
      { header: 'Puesto', render: (i) => <span className="text-gray-600">{txt(i.puesto)}</span> },
      { header: 'Detalle', render: (i) => <span className="text-gray-600">{txt(i.detalle)}</span> },
    ],
  },
}

export function PestanaPersistidaTab({ slug }: { slug: PestanaPersistidaSlug }) {
  const cfg = CONFIG[slug]
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [carrera, setCarrera] = useState('')
  const [page, setPage] = useState(1)
  const { data: escalafones } = useEscalafones()

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [qInput])

  const { data, isLoading, isError, refetch } = usePestanaPersistida(slug, {
    page,
    pageSize: 50,
    q: q.trim().length >= 2 ? q.trim() : undefined,
    carrera: carrera || undefined,
  })

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{cfg.descripcion}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block text-sm flex-1">
          <span className="text-gray-700 font-medium">Buscar</span>
          <input
            type="search"
            placeholder="Persona, CUIL, id_sial o código (mín. 2 caracteres)"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <div className="block text-sm sm:w-64">
          <span className="text-gray-700 font-medium">Carrera</span>
          <SearchableSelect
            value={carrera}
            onChange={(v) => {
              setCarrera(v)
              setPage(1)
            }}
            options={(escalafones ?? []).map((e) => escalafonLabel(e.nombre))}
            placeholder="Todas las carreras"
            className="mt-1"
          />
        </div>
      </div>
      {isLoading && <p className="text-sm text-gray-400">Cargando…</p>}
      {isError && (
        <div className="text-sm text-danger flex items-center gap-2">
          No se pudo cargar la pestaña.
          <button className="btn-outline text-xs px-2 py-1" onClick={() => refetch()}>
            Reintentar
          </button>
        </div>
      )}
      {!isLoading && !isError && data && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {data.items.length === 0 ? (
            <p className="p-6 text-sm text-gray-400 text-center">
              {q || carrera ? 'No hay incidencias que coincidan con los filtros.' : cfg.vacio}
            </p>
          ) : (
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead className="bg-navy text-white text-left sticky top-0 z-10">
                <tr>
                  {cfg.columnas.map((c, idx) => (
                    <th
                      key={c.header}
                      scope="col"
                      className={`px-4 py-3 font-semibold ${idx === 0 ? 'rounded-tl-lg' : ''}`}
                    >
                      {c.header}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-3 font-semibold">Fecha</th>
                  <th scope="col" className="px-4 py-3 rounded-tr-lg" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((i) => (
                  <tr key={i.clave} className="hover:bg-gray-50 align-top">
                    {cfg.columnas.map((c) => (
                      <td key={c.header} className="px-4 py-3">
                        {c.render(i)}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-gray-600">{fechaCorta(i.fecha)}</td>
                    <td className="px-4 py-3 text-right">
                      {i.cargoId && (
                        <Link to={`/cargos/${i.cargoId}`} className="text-xs text-primary hover:underline">
                          Ver cargo
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.meta.total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 text-sm text-gray-500 border-t border-gray-100">
              <span>
                Página {data.meta.page} de {data.meta.pages} — total {data.meta.total}
              </span>
              <div className="flex gap-2">
                <button className="btn-outline text-xs px-2 py-1" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Anterior
                </button>
                <button
                  className="btn-outline text-xs px-2 py-1"
                  disabled={page >= data.meta.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
