import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useKanbanSupervisor, type TarjetaKanban } from '../hooks/useTareas'

const STORAGE_KEY = 'kanban_novedades_dias'

function leerDias(): number {
  const v = localStorage.getItem(STORAGE_KEY)
  const n = v ? parseInt(v, 10) : 7
  return isNaN(n) || n < 1 ? 7 : Math.min(n, 90)
}

function BadgeDias({ dias, color }: { dias: number; color: 'verde' | 'naranja' | 'rojo' }) {
  const cls = color === 'verde' ? 'bg-green-100 text-green-700'
    : color === 'naranja' ? 'bg-orange-100 text-orange-700'
    : 'bg-red-100 text-red-700'
  return <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{dias}d</span>
}

function TarjetaConcurso({ tarjeta, novedad }: { tarjeta: TarjetaKanban; novedad?: boolean }) {
  const ruta = tarjeta.tipo === 'cph'
    ? `/concursos/cph/${tarjeta.id}/wizard`
    : `/concursos/ceetps/${tarjeta.id}`
  return (
    <div className={`rounded border bg-white p-2.5 space-y-1.5 text-xs shadow-sm ${
      novedad ? 'border-l-4 border-l-amber-400 border-gray-200' : 'border-gray-200'
    }`}>
      <div className="flex items-center justify-between gap-1">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
          tarjeta.tipo === 'cph' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'
        }`}>
          {tarjeta.tipo.toUpperCase()}
        </span>
        <BadgeDias dias={tarjeta.diasSinMovimiento} color={tarjeta.colorBadge} />
      </div>
      <div>
        <p className="font-mono font-semibold text-gray-800">{tarjeta.cargo.codigo ?? '—'}</p>
        <p className="text-gray-500">{tarjeta.hospital.sigla}</p>
      </div>
      {tarjeta.subEstado && <p className="text-gray-400 truncate">{tarjeta.subEstado}</p>}
      <Link to={ruta} className="text-blue-600 hover:underline block pt-0.5">Ver →</Link>
    </div>
  )
}

const COLUMNAS = [
  { key: 'novedades'              as const, label: 'Novedades',              esNovedad: true  },
  { key: 'no_iniciado'            as const, label: 'No iniciado',            esNovedad: false },
  { key: 'pendiente_autorizacion' as const, label: 'Pendiente autorización', esNovedad: false },
  { key: 'en_proceso'             as const, label: 'En proceso',             esNovedad: false },
  { key: 'finalizado'             as const, label: 'Finalizado',             esNovedad: false },
]

export function KanbanSupervisor() {
  const [novedadesDias, setNovedadesDias] = useState(leerDias)

  function cambiarDias(v: number) {
    const clamped = Math.max(1, Math.min(90, v))
    setNovedadesDias(clamped)
    localStorage.setItem(STORAGE_KEY, String(clamped))
  }

  const { data, isLoading, isError } = useKanbanSupervisor(novedadesDias)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold text-gray-900">Mi kanban de concursos</h1>
        <label className="flex items-center gap-2 text-sm text-gray-600 ml-auto">
          Días para novedades:
          <input
            type="number"
            min={1}
            max={90}
            value={novedadesDias}
            onChange={(e) => cambiarDias(parseInt(e.target.value, 10) || 7)}
            className="input w-16 text-sm text-center"
          />
        </label>
      </div>

      {isLoading && <p className="text-sm text-gray-400">Cargando kanban…</p>}
      {isError   && <p className="text-sm text-red-500">No se pudo cargar el kanban.</p>}

      {data && (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {COLUMNAS.map(({ key, label, esNovedad }) => {
            const tarjetas = data.columnas[key]
            return (
              <div key={key} className={`shrink-0 w-56 rounded-lg border flex flex-col ${
                esNovedad ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'
              }`}>
                <div className={`px-3 py-2 border-b ${esNovedad ? 'border-amber-200' : 'border-gray-100'}`}>
                  <p className={`text-xs font-bold uppercase tracking-wide ${esNovedad ? 'text-amber-700' : 'text-gray-500'}`}>
                    {esNovedad && '⚡ '}{label}
                  </p>
                  <p className="text-xs text-gray-400">{tarjetas.length} concursos</p>
                </div>
                <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[65vh]">
                  {tarjetas.map((t) => (
                    <TarjetaConcurso key={t.id} tarjeta={t} novedad={esNovedad} />
                  ))}
                  {tarjetas.length === 0 && (
                    <p className="text-xs text-gray-300 text-center py-4">Vacío</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
