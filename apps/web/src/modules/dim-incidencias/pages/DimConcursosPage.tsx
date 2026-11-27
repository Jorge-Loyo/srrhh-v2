import { useState } from 'react'
import {
  useDimConcursos,
  useDimConcursoDetalle,
  LABEL_TIPO_CONCURSO,
  type DimConcurso,
  type TipoConcursoDim,
} from '../hooks/useDimIncidencias'

const PAGE_SIZE = 50

const COLOR_ESTADO: Record<string, string> = {
  no_iniciado: 'bg-gray-100 text-gray-600',
  activo:      'bg-blue-100 text-blue-700',
  finalizado:  'bg-green-100 text-green-700',
  suspendido:  'bg-red-100 text-red-700',
}

function badgeEstado(estado: string) {
  const cls = COLOR_ESTADO[estado] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {estado.replace('_', ' ')}
    </span>
  )
}

function DetalleConcurso({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useDimConcursoDetalle(id)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Detalle del concurso</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        {isLoading && <p className="text-sm text-gray-500">Cargando...</p>}

        {data && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Field label="Tipo" value={LABEL_TIPO_CONCURSO[data.tipo]} />
              <Field label="Estado" value={badgeEstado(data.estado)} />
              <Field label="Efector" value={`${data.efector}${data.efectorRel.nombre ? ` — ${data.efectorRel.nombre}` : ''}`} />
              <Field label="CR" value={data.codigoRegistro} />
              <Field label="Puesto" value={data.literalPuesto} />
              <Field label="Especialidad" value={data.especialidad ?? '—'} />
              <Field label="Motivo origen" value={data.motivoOrigen} />
              <Field label="Código cargo" value={data.codigoCargo ?? '—'} />
            </div>

            {data.observaciones && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Observaciones</p>
                <p className="text-gray-700">{data.observaciones}</p>
              </div>
            )}

            {data.incidencia && (
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Incidencia origen</p>
                <p className="text-gray-600 text-xs font-mono">{data.incidencia.id}</p>
                <p className="text-gray-600">{data.incidencia.tipo.replace('_', ' ')}</p>
              </div>
            )}

            {data.cph && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Datos CPH</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <Field label="Sub-estado" value={data.cph.subEstado ?? '—'} />
                  <Field label="Tipo gestión" value={data.cph.tipoGestion ?? '—'} />
                  <Field label="EE Baja" value={data.cph.eeBaja ?? '—'} />
                  <Field label="Fecha baja" value={data.cph.fechaBaja ? new Date(data.cph.fechaBaja).toLocaleDateString('es-AR') : '—'} />
                  <Field label="IF Autorización" value={data.cph.ifAutorizacion ?? '—'} />
                  <Field label="Fecha autorización" value={data.cph.fechaAutorizacion ? new Date(data.cph.fechaAutorizacion).toLocaleDateString('es-AR') : '—'} />
                </div>
              </div>
            )}

            {data.ceetps && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Datos CEETPS</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <Field label="Sub-estado" value={data.ceetps.subEstado ?? '—'} />
                  <Field label="Tipo gestión" value={data.ceetps.tipoGestion ?? '—'} />
                  <Field label="Expediente" value={data.ceetps.expedienteConcurso ?? '—'} />
                  <Field label="IF Autorización" value={data.ceetps.ifAutorizacion ?? '—'} />
                  <Field label="Fecha autorización" value={data.ceetps.fechaAutorizacion ? new Date(data.ceetps.fechaAutorizacion).toLocaleDateString('es-AR') : '—'} />
                </div>
              </div>
            )}

            <p className="text-xs text-gray-400 pt-2">
              Creado: {new Date(data.createdAt).toLocaleString('es-AR')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-gray-800">{value}</p>
    </div>
  )
}

export function DimConcursosPage() {
  const [page, setPage]                     = useState(1)
  const [tipo, setTipo]                     = useState<TipoConcursoDim | ''>('')
  const [estado, setEstado]                 = useState('')
  const [efector, setEfector]               = useState('')
  const [codigoRegistro, setCodigoRegistro] = useState('')
  const [detalle, setDetalle]               = useState<DimConcurso | null>(null)

  const { data, isLoading } = useDimConcursos({
    page,
    limit: PAGE_SIZE,
    tipo:           tipo || undefined,
    estado:         estado || undefined,
    efector:        efector || undefined,
    codigoRegistro: codigoRegistro || undefined,
  })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Concursos dim_*</h1>
        {data && <span className="text-sm text-gray-500">{data.total} concursos</span>}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <select
          value={tipo}
          onChange={(e) => { setTipo(e.target.value as TipoConcursoDim | ''); setPage(1) }}
          className="border rounded px-3 py-1.5 text-sm"
        >
          <option value="">Todos los tipos</option>
          <option value="cph">CPH</option>
          <option value="ceetps">CEETPS</option>
        </select>

        <select
          value={estado}
          onChange={(e) => { setEstado(e.target.value); setPage(1) }}
          className="border rounded px-3 py-1.5 text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="no_iniciado">No iniciado</option>
          <option value="activo">Activo</option>
          <option value="finalizado">Finalizado</option>
          <option value="suspendido">Suspendido</option>
        </select>

        <input
          placeholder="Efector (sigla)"
          value={efector}
          onChange={(e) => { setEfector(e.target.value.toUpperCase()); setPage(1) }}
          className="border rounded px-3 py-1.5 text-sm w-36"
        />

        <input
          placeholder="Cód. registro"
          value={codigoRegistro}
          onChange={(e) => { setCodigoRegistro(e.target.value); setPage(1) }}
          className="border rounded px-3 py-1.5 text-sm w-32"
        />
      </div>

      {/* Tabla */}
      {isLoading ? (
        <p className="text-sm text-gray-500">Cargando...</p>
      ) : !data?.rows.length ? (
        <p className="text-sm text-gray-500">Sin concursos para los filtros seleccionados.</p>
      ) : (
        <div className="overflow-x-auto rounded border">
          <table className="min-w-full text-sm divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Tipo', 'Estado', 'Efector', 'CR', 'Puesto', 'Especialidad', 'Origen', 'Creado', ''].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {data.rows.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap font-medium">
                    {LABEL_TIPO_CONCURSO[c.tipo]}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{badgeEstado(c.estado)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-mono">{c.efector}</span>
                    {c.efectorRel.nombre && (
                      <span className="ml-1 text-gray-400 text-xs">({c.efectorRel.nombre})</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-mono">{c.codigoRegistro}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={c.literalPuesto}>
                    {c.literalPuesto}
                  </td>
                  <td className="px-3 py-2 max-w-xs truncate text-gray-500" title={c.especialidad ?? ''}>
                    {c.especialidad ?? '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500 text-xs">
                    {c.motivoOrigen.replace('_', ' ')}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500 text-xs">
                    {new Date(c.createdAt).toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button
                      onClick={() => setDetalle(c)}
                      className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      {data && data.pages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 border rounded disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span className="text-gray-600">Página {page} de {data.pages}</span>
          <button
            disabled={page === data.pages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 border rounded disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      )}

      {detalle && (
        <DetalleConcurso id={detalle.id} onClose={() => setDetalle(null)} />
      )}
    </div>
  )
}
