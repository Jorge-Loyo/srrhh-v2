import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'

interface UltimaOcupacion {
  id: string
  hasta: string | null
  persona: { id: string; apellidoNombre: string; cuil: string } | null
}

interface CargoValidacion {
  id: string
  codigo: string | null
  literalPuesto: string | null
  estadoDesde: string | null
  diasEnValidacion: number | null
  hospital: { sigla: string; nombre: string }
  escalafon: { nombre: string }
  ultimaOcupacion: UltimaOcupacion | null
}

function diasLabel(n: number | null) {
  if (n === null) return '—'
  if (n === 0) return 'Hoy'
  return `${n}d`
}

function diasColor(n: number | null) {
  if (n === null) return 'text-gray-400'
  if (n >= 30) return 'text-red-600 font-semibold'
  if (n >= 14) return 'text-orange-500 font-semibold'
  return 'text-gray-600'
}

export function ValidacionBajasPage() {
  const queryClient = useQueryClient()
  const [confirmando, setConfirmando] = useState<CargoValidacion | null>(null)
  const [acta, setActa] = useState('')
  const [rechazando, setRechazando] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['validacion-bajas'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CargoValidacion[] }>('/api/v1/bajas/validacion')
      return res.data.data
    },
  })

  const confirmar = useMutation({
    mutationFn: async ({ cargoId, actaAdministrativa }: { cargoId: string; actaAdministrativa?: string }) =>
      apiClient.post(`/api/v1/bajas/validacion/${cargoId}/confirmar`, { actaAdministrativa }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['validacion-bajas'] })
      queryClient.invalidateQueries({ queryKey: ['cargos'] })
      setConfirmando(null)
      setActa('')
    },
  })

  const rechazar = useMutation({
    mutationFn: async (cargoId: string) =>
      apiClient.post(`/api/v1/bajas/validacion/${cargoId}/rechazar`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['validacion-bajas'] })
      queryClient.invalidateQueries({ queryKey: ['cargos'] })
      setRechazando(null)
    },
  })

  return (
    <div className="space-y-6">

      {/* Modal confirmar baja */}
      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4 space-y-4">
            <h3 className="font-bold text-gray-900">Confirmar baja</h3>
            <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
              <p><span className="text-gray-500">Cargo:</span> <span className="font-mono font-bold">{confirmando.codigo ?? '—'}</span></p>
              <p><span className="text-gray-500">Puesto:</span> {confirmando.literalPuesto ?? '—'}</p>
              <p><span className="text-gray-500">Hospital:</span> {confirmando.hospital.sigla}</p>
              {confirmando.ultimaOcupacion?.persona && (
                <p><span className="text-gray-500">Persona:</span> {confirmando.ultimaOcupacion.persona.apellidoNombre}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                Acto administrativo <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                value={acta}
                onChange={(e) => setActa(e.target.value)}
                placeholder="Ej: DI-2026-1234-GCABA-DGAYDRH"
                className="h-10 input w-full"
              />
            </div>
            <div className="flex gap-3">
              <button className="btn-outline flex-1" onClick={() => { setConfirmando(null); setActa('') }}>
                Cancelar
              </button>
              <button
                className="btn-primary flex-1"
                disabled={confirmar.isPending}
                onClick={() => confirmar.mutate({ cargoId: confirmando.id, actaAdministrativa: acta || undefined })}
              >
                {confirmar.isPending ? 'Confirmando...' : 'Confirmar baja'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal rechazar */}
      {rechazando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="font-bold text-gray-900">¿Rechazar validación?</h3>
            <p className="text-sm text-gray-600">
              El cargo volverá a <span className="font-semibold">vigente</span> y se reabrirá la ocupación de la persona.
            </p>
            <div className="flex gap-3">
              <button className="btn-outline flex-1" onClick={() => setRechazando(null)}>Cancelar</button>
              <button
                className="btn-danger flex-1"
                disabled={rechazar.isPending}
                onClick={() => rechazar.mutate(rechazando)}
              >
                {rechazar.isPending ? 'Rechazando...' : 'Rechazar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-primary text-xl font-bold text-gray-900">Validación de Bajas</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Cargos detectados como vacantes por el padrón semanal, pendientes de confirmación
            </p>
          </div>
          {data && (
            <span className="text-xs text-gray-400 self-center">
              {data.length} cargo{data.length !== 1 ? 's' : ''} pendiente{data.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando...</p>}
        {isError && <p className="p-6 text-sm text-danger">No se pudo cargar el listado.</p>}

        {!isLoading && !isError && data?.length === 0 && (
          <p className="p-8 text-center text-sm text-gray-400">
            No hay cargos pendientes de validación. ✓
          </p>
        )}

        {!isLoading && !isError && data && data.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-navy text-white text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Código Cargo</th>
                <th className="px-4 py-3 font-semibold">Hospital</th>
                <th className="px-4 py-3 font-semibold">Escalafón</th>
                <th className="px-4 py-3 font-semibold">Puesto</th>
                <th className="px-4 py-3 font-semibold">Última persona</th>
                <th className="px-4 py-3 font-semibold">Detectado</th>
                <th className="px-4 py-3 font-semibold">Días</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-gray-800">{c.codigo ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.hospital.sigla}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{c.escalafon.nombre}</td>
                  <td className="px-4 py-3 text-gray-600">{c.literalPuesto ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.ultimaOcupacion?.persona
                      ? <span>{c.ultimaOcupacion.persona.apellidoNombre} <span className="text-gray-400 text-xs">({c.ultimaOcupacion.persona.cuil})</span></span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {c.estadoDesde ? new Date(c.estadoDesde).toLocaleDateString('es-AR') : '—'}
                  </td>
                  <td className={`px-4 py-3 text-xs ${diasColor(c.diasEnValidacion)}`}>
                    {diasLabel(c.diasEnValidacion)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        className="btn-outline text-xs px-3 py-1"
                        onClick={() => setRechazando(c.id)}
                      >
                        Rechazar
                      </button>
                      <button
                        className="btn-primary text-xs px-3 py-1"
                        onClick={() => { setConfirmando(c); setActa('') }}
                      >
                        Confirmar baja
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
