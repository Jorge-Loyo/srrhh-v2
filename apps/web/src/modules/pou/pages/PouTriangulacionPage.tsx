import { useMemo, useState } from 'react'
import { ChevronDownIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useComparacionPou, useHospitalesPou, useDetalleCargosComparacion, type ComparacionPouRow } from '../hooks/usePou'
import { useHospitales } from '@/shared/hooks/useCatalogos'

// Orden canónico de perfiles POU (valores normalizados en BD)
const ORDEN_PERFIL = [
  'especialista en la guardia medico',
  'profesional de la guardia medico',
  'jefe de seccion',
  'jefe de unidad',
]

// Etiquetas legibles para la UI
const LABEL_PERFIL: Record<string, string> = {
  'especialista en la guardia medico': 'Especialista en la Guardia Médico',
  'profesional de la guardia medico':  'Profesional de la Guardia Médico',
  'jefe de seccion':                   'Jefe de Sección',
  'jefe de unidad':                    'Jefe de Unidad',
}

function badgeDif(dif: number) {
  if (dif === 0) return <span className="text-green-700 font-bold">0</span>
  if (dif > 0)   return <span className="text-red-700 font-bold">-{dif}</span>   // faltan cargos
  return           <span className="text-orange-700 font-bold">+{Math.abs(dif)}</span> // exceso
}

// ── Modal detalle de cargos ──────────────────────────────────────────────────
function ModalDetalleCargos({
  sigla, perfil, especialidad, columna, onClose,
}: {
  sigla: string; perfil: string; especialidad: string
  columna: string; onClose: () => void
}) {
  const { data = [], isLoading } = useDetalleCargosComparacion({ sigla, perfil, especialidad })

  const filtrados = useMemo(() => {
    if (columna === 'sistemaTotal')    return data
    if (columna === 'sistemaOcupado')  return data.filter((c) => c.subEstado === 'ocupado')
    if (columna === 'sistemaVacante')  return data.filter((c) => c.subEstado === 'vacante' && c.estado === 'vigente')
    if (columna === 'sistemaConcurso') return data.filter((c) => c.subEstado === 'concurso')
    if (columna === 'sistemaValidacion') return data.filter((c) => c.estado === 'validacion_vacante')
    return data
  }, [data, columna])

  const LABEL_COL: Record<string, string> = {
    sistemaTotal: 'Total sistema', sistemaOcupado: 'Ocupados',
    sistemaVacante: 'Vacantes', sistemaConcurso: 'En concurso', sistemaValidacion: 'En validación',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div>
            <span className="font-bold text-gray-900">{sigla}</span>
            <span className="mx-2 text-gray-400">·</span>
            <span className="text-sm text-gray-600">{LABEL_PERFIL[perfil] ?? perfil}</span>
            <span className="mx-2 text-gray-400">·</span>
            <span className="text-sm text-gray-600">{especialidad}</span>
            <span className="ml-3 text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-700">{LABEL_COL[columna]}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-auto flex-1">
          {isLoading ? (
            <p className="text-center py-8 text-gray-400">Cargando...</p>
          ) : filtrados.length === 0 ? (
            <p className="text-center py-8 text-gray-400">Sin cargos</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">Código</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">Estado</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">Sub-estado</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">Ocupante</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">CUIL</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">ID SIAL</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr key={c.codigo} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-1.5 font-mono text-gray-700">{c.codigo}</td>
                    <td className="px-3 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                        c.estado === 'vigente' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>{c.estado}</span>
                    </td>
                    <td className="px-3 py-1.5">
                      {c.subEstado && (
                        <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                          c.subEstado === 'ocupado' ? 'bg-blue-100 text-blue-700'
                          : c.subEstado === 'vacante' ? 'bg-orange-100 text-orange-700'
                          : 'bg-purple-100 text-purple-700'
                        }`}>{c.subEstado}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-gray-800">{c.ocupanteNombre ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-500">{c.ocupanteCuil ?? '—'}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-500">{c.ocupanteIdSial ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 text-right">
          {filtrados.length} cargo{filtrados.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}

// ── Fila de especialidad ──────────────────────────────────────────────────────
type ModalState = { sigla: string; perfil: string; especialidad: string; columna: string } | null

function NumCell({ value, onClick }: { value: number; onClick?: () => void }) {
  if (value === 0) return <span className="text-gray-300">0</span>
  return (
    <button
      onClick={onClick}
      className="font-semibold text-blue-600 hover:underline hover:text-blue-800 cursor-pointer"
    >
      {value}
    </button>
  )
}

function FilaEspecialidad({ row, sigla, onOpenModal }: {
  row: ComparacionPouRow; sigla: string
  onOpenModal: (columna: string) => void
}) {
  const difColor = row.diferencia === 0
    ? 'bg-white'
    : row.diferencia > 0
      ? 'bg-red-50'
      : 'bg-orange-50'

  return (
    <tr className={`border-b border-gray-100 text-xs ${difColor}`}>
      <td className="pl-8 pr-3 py-2 text-gray-800">{row.especialidad}</td>
      {/* POU documento */}
      <td className="px-3 py-2 text-center font-semibold text-gray-700">{row.pouDotacion}</td>
      <td className="px-3 py-2 text-center text-green-700">{row.pouActivos}</td>
      <td className="px-3 py-2 text-center text-orange-700">{row.pouVacantes}</td>
      {/* Sistema */}
      <td className="px-3 py-2 text-center font-semibold text-gray-700">
        <NumCell value={row.sistemaTotal} onClick={() => onOpenModal('sistemaTotal')} />
      </td>
      <td className="px-3 py-2 text-center text-green-700">
        <NumCell value={row.sistemaOcupado} onClick={() => onOpenModal('sistemaOcupado')} />
      </td>
      <td className="px-3 py-2 text-center text-orange-700">
        <NumCell value={row.sistemaVacante} onClick={() => onOpenModal('sistemaVacante')} />
      </td>
      <td className="px-3 py-2 text-center">
        {row.sistemaConcurso > 0
          ? <button onClick={() => onOpenModal('sistemaConcurso')} className="badge-indigo hover:opacity-80">{row.sistemaConcurso}</button>
          : <span className="text-gray-300">0</span>}
      </td>
      <td className="px-3 py-2 text-center">
        {row.sistemaValidacion > 0
          ? <button onClick={() => onOpenModal('sistemaValidacion')} className="bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded text-xs font-semibold hover:opacity-80">{row.sistemaValidacion}</button>
          : <span className="text-gray-300">0</span>}
      </td>
      {/* Diferencia */}
      <td className="px-3 py-2 text-center">{badgeDif(row.diferencia)}</td>
    </tr>
  )
}

// ── Bloque de perfil (acordeón) ───────────────────────────────────────────────
function BloquePerfilSigla({
  sigla, perfil, filas,
}: { sigla: string; perfil: string; filas: ComparacionPouRow[] }) {
  const [abierto, setAbierto] = useState(true)
  const [modal, setModal] = useState<ModalState>(null)

  const totales = useMemo(() => filas.reduce(
    (acc, r) => ({
      pouDotacion:       acc.pouDotacion + r.pouDotacion,
      pouActivos:        acc.pouActivos + r.pouActivos,
      pouVacantes:       acc.pouVacantes + r.pouVacantes,
      sistemaTotal:      acc.sistemaTotal + r.sistemaTotal,
      sistemaOcupado:    acc.sistemaOcupado + r.sistemaOcupado,
      sistemaVacante:    acc.sistemaVacante + r.sistemaVacante,
      sistemaConcurso:   acc.sistemaConcurso + r.sistemaConcurso,
      sistemaValidacion: acc.sistemaValidacion + r.sistemaValidacion,
      diferencia:        acc.diferencia + r.diferencia,
    }),
    { pouDotacion:0, pouActivos:0, pouVacantes:0, sistemaTotal:0, sistemaOcupado:0, sistemaVacante:0, sistemaConcurso:0, sistemaValidacion:0, diferencia:0 }
  ), [filas])

  const hayDif = totales.diferencia !== 0

  return (
    <>
      {/* Cabecera del perfil */}
      <tr
        className={`cursor-pointer select-none border-b border-gray-300 ${hayDif ? 'bg-red-50' : 'bg-gray-100'} hover:bg-gray-200`}
        onClick={() => setAbierto((v) => !v)}
      >
        <td className="px-3 py-2 font-semibold text-sm text-gray-800" colSpan={1}>
          <div className="flex items-center gap-1.5">
            {abierto
              ? <ChevronDownIcon className="w-3.5 h-3.5 text-gray-500" />
              : <ChevronRightIcon className="w-3.5 h-3.5 text-gray-500" />}
            {LABEL_PERFIL[perfil] ?? perfil}
            <span className="ml-1 text-xs text-gray-400 font-normal">({filas.length} esp.)</span>
          </div>
        </td>
        <td className="px-3 py-2 text-center text-xs font-bold text-gray-700">{totales.pouDotacion}</td>
        <td className="px-3 py-2 text-center text-xs text-green-700">{totales.pouActivos}</td>
        <td className="px-3 py-2 text-center text-xs text-orange-700">{totales.pouVacantes}</td>
        <td className="px-3 py-2 text-center text-xs font-bold text-gray-700">{totales.sistemaTotal}</td>
        <td className="px-3 py-2 text-center text-xs text-green-700">{totales.sistemaOcupado}</td>
        <td className="px-3 py-2 text-center text-xs text-orange-700">{totales.sistemaVacante}</td>
        <td className="px-3 py-2 text-center text-xs">{totales.sistemaConcurso || '—'}</td>
        <td className="px-3 py-2 text-center text-xs">{totales.sistemaValidacion || '—'}</td>
        <td className="px-3 py-2 text-center text-xs">{badgeDif(totales.diferencia)}</td>
      </tr>
      {abierto && filas.map((r) => (
        <FilaEspecialidad
          key={`${sigla}-${perfil}-${r.especialidad}`}
          row={r}
          sigla={sigla}
          onOpenModal={(columna) => setModal({ sigla, perfil, especialidad: r.especialidad, columna })}
        />
      ))}
      {modal && <ModalDetalleCargos {...modal} onClose={() => setModal(null)} />}
    </>
  )
}

// ── Bloque por sigla ──────────────────────────────────────────────────────────
function BloqueSigla({ sigla, filas }: { sigla: string; filas: ComparacionPouRow[] }) {
  const [abierto, setAbierto] = useState(true)

  const porPerfil = useMemo(() => {
    const map = new Map<string, ComparacionPouRow[]>()
    for (const r of filas) {
      const arr = map.get(r.perfil) ?? []
      arr.push(r)
      map.set(r.perfil, arr)
    }
    return ORDEN_PERFIL.filter((p) => map.has(p)).map((p) => ({ perfil: p, filas: map.get(p)! }))
  }, [filas])

  const totalDif = filas.reduce((s, r) => s + r.diferencia, 0)

  return (
    <>
      {/* Cabecera de sigla */}
      <tr
        className="cursor-pointer select-none bg-primary-50 border-b-2 border-primary-200 hover:bg-primary-100"
        onClick={() => setAbierto((v) => !v)}
      >
        <td className="px-3 py-2.5 font-bold text-primary-800" colSpan={10}>
          <div className="flex items-center gap-2">
            {abierto
              ? <ChevronDownIcon className="w-4 h-4" />
              : <ChevronRightIcon className="w-4 h-4" />}
            <span className="font-mono text-sm">{sigla}</span>
            {totalDif !== 0 && (
              <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded ${totalDif > 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                {totalDif > 0 ? `Faltan ${totalDif} cargos` : `Exceso de ${Math.abs(totalDif)} cargos`}
              </span>
            )}
            {totalDif === 0 && (
              <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded bg-green-100 text-green-700">OK</span>
            )}
          </div>
        </td>
      </tr>
      {abierto && porPerfil.map(({ perfil, filas: pf }) => (
        <BloquePerfilSigla key={`${sigla}-${perfil}`} sigla={sigla} perfil={perfil} filas={pf} />
      ))}
    </>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export function PouTriangulacionPage() {
  const [siglasFiltro, setSiglasFiltro] = useState<string[]>([])
  const { data: siglasDisponibles = [] } = useHospitalesPou()
  const { data: hospitales = [] } = useHospitales()
  const { data = [], isLoading } = useComparacionPou(siglasFiltro.length > 0 ? siglasFiltro : undefined)

  const nombreHospital = useMemo(() => {
    const m = new Map(hospitales.map((h) => [h.sigla, h.nombre]))
    return (s: string) => m.get(s) ?? s
  }, [hospitales])

  const porSigla = useMemo(() => {
    const map = new Map<string, ComparacionPouRow[]>()
    for (const r of data) {
      const arr = map.get(r.sigla) ?? []
      arr.push(r)
      map.set(r.sigla, arr)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'))
  }, [data])

  const totalDif = data.reduce((s, r) => s + r.diferencia, 0)

  function toggleSigla(s: string) {
    setSiglasFiltro((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Cabecera ── */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-gray-200 bg-white space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-lg">🔗</span>
          <h1 className="text-lg font-bold text-gray-900">Triangulación POU vs Sistema</h1>
          {!isLoading && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
              totalDif === 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {totalDif === 0 ? 'Sin diferencias' : `Diferencia total: ${totalDif > 0 ? '-' : '+'}${Math.abs(totalDif)} cargos`}
            </span>
          )}
        </div>

        {/* Selector de siglas */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-gray-500 mr-1">Hospitales:</span>
          <button
            onClick={() => setSiglasFiltro([])}
            className={`px-2.5 py-1 text-xs font-semibold rounded border transition-colors ${
              siglasFiltro.length === 0
                ? 'bg-primary border-primary text-black'
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Todos ({siglasDisponibles.length})
          </button>
          {siglasDisponibles.map((s) => (
            <button
              key={s}
              onClick={() => toggleSigla(s)}
              title={nombreHospital(s)}
              className={`px-2.5 py-1 text-xs font-semibold rounded border transition-colors ${
                siglasFiltro.includes(s)
                  ? 'bg-primary border-primary text-black'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tabla ── */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <p className="text-center py-10 text-gray-400">Cargando...</p>
        ) : data.length === 0 ? (
          <p className="text-center py-10 text-gray-400">Sin datos POU para los hospitales seleccionados</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-gray-200 w-64">Puesto / Especialidad</th>
                {/* POU documento */}
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 border-b border-gray-200 bg-blue-50" colSpan={3}>
                  📄 Documento POU
                </th>
                {/* Sistema */}
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 border-b border-gray-200 bg-green-50" colSpan={5}>
                  💻 Sistema
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 border-b border-gray-200">Dif.</th>
              </tr>
              <tr className="bg-gray-50">
                <th className="px-3 py-1.5 border-b border-gray-200" />
                <th className="px-3 py-1.5 text-center text-xs text-gray-500 border-b border-gray-200 bg-blue-50">Dotación</th>
                <th className="px-3 py-1.5 text-center text-xs text-gray-500 border-b border-gray-200 bg-blue-50">Activos</th>
                <th className="px-3 py-1.5 text-center text-xs text-gray-500 border-b border-gray-200 bg-blue-50">Vacantes</th>
                <th className="px-3 py-1.5 text-center text-xs text-gray-500 border-b border-gray-200 bg-green-50">Total</th>
                <th className="px-3 py-1.5 text-center text-xs text-gray-500 border-b border-gray-200 bg-green-50">Ocupado</th>
                <th className="px-3 py-1.5 text-center text-xs text-gray-500 border-b border-gray-200 bg-green-50">Vacante</th>
                <th className="px-3 py-1.5 text-center text-xs text-gray-500 border-b border-gray-200 bg-green-50">Concurso</th>
                <th className="px-3 py-1.5 text-center text-xs text-gray-500 border-b border-gray-200 bg-green-50">Validación</th>
                <th className="px-3 py-1.5 border-b border-gray-200" />
              </tr>
            </thead>
            <tbody>
              {porSigla.map(([sigla, filas]) => (
                <BloqueSigla key={sigla} sigla={sigla} filas={filas} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
