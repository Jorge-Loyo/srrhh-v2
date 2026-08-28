import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Cargo, CreateCargoRequest } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'
import { useHospitales, useEscalafones, usePuestosCargos } from '@/shared/hooks/useCatalogos'

type TipoAlta = 'pof' | 'pou' | 'estructura'

const TIPO_LABEL: Record<TipoAlta, string> = {
  pof:        'Ejecución POF',
  pou:        'Ejecución POU',
  estructura: 'Estructura',
}

const TIPO_BADGE: Record<TipoAlta, string> = {
  pof:        'badge-info',
  pou:        'badge-default',
  estructura: 'badge-warning',
}

// Mapeo tipo de alta → unificadorPuesto para que prefijoDeCargo() en el
// backend derive el prefijo correcto (CPH-POF / CPH-POU / etc.)
const TIPO_UNIFICADOR: Record<TipoAlta, string> = {
  pof:        'POF',
  pou:        'POU Guardia',
  estructura: 'Estructura',
}

interface AltaRegistrada {
  id: string
  fecha: string
  tipo: TipoAlta
  hospitalSigla: string
  escalafon: string
  puesto: string
  especialidad: string
  expediente: string
  cantidad: number
  codigos: string[]
}

// ── Formulario inline ──────────────────────────────────────────────────────────
interface FormAltaProps {
  tipo: TipoAlta
  onRegistrar: (alta: AltaRegistrada) => void
  onCancelar: () => void
}

function FormAlta({ tipo, onRegistrar, onCancelar }: FormAltaProps) {
  const [expInput,      setExpInput]      = useState('')
  const [expConfirmado, setExpConfirmado] = useState(false)
  const [expediente,    setExpediente]    = useState('')
  const [hospitalId,    setHospitalId]    = useState('')
  const [escalafonId,   setEscalafonId]   = useState('')
  const [puesto,        setPuesto]        = useState('')
  const [especialidad,  setEspecialidad]  = useState('')
  const [desde,         setDesde]         = useState('')
  const [cantidad,      setCantidad]      = useState(1)
  const [error,         setError]         = useState<string | null>(null)

  const { data: hospitales = [] } = useHospitales()
  const { data: escalafones = [] } = useEscalafones()
  const { data: puestos = [] }    = usePuestosCargos(escalafonId, hospitalId)

  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (body: CreateCargoRequest) => {
      const res = await apiClient.post<{ data: Cargo[] }>('/api/v1/cargos', body)
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cargos'] }),
  })

  function confirmarExp() {
    const v = expInput.trim()
    if (!v) return
    setExpediente(v)
    setExpConfirmado(true)
  }

  async function handleRegistrar() {
    if (!hospitalId || !escalafonId || !puesto || !desde) return
    setError(null)

    const hospital = hospitales.find((h) => h.id === hospitalId)
    const esc      = escalafones.find((e) => e.id === escalafonId)

    try {
      const creados = await mutation.mutateAsync({
        hospitalId,
        escalafonId,
        literalPuesto:    puesto,
        especialidad:     especialidad || undefined,
        unificadorPuesto: TIPO_UNIFICADOR[tipo],
        expediente:       expediente || undefined,
        desde,
        cantidad,
      })

      onRegistrar({
        id:            creados[0]?.id ?? crypto.randomUUID(),
        fecha:       new Date().toISOString().slice(0, 10),
        tipo,
        hospitalSigla: hospital?.sigla ?? hospitalId,
        escalafon:   esc?.nombre ?? escalafonId,
        puesto,
        especialidad: especialidad || '—',
        expediente:  expediente || '—',
        cantidad,
        codigos:     creados.map((c) => c.codigo ?? '').filter(Boolean),
      })
    } catch {
      setError('Error al registrar el cargo. Verificá los datos e intentá de nuevo.')
    }
  }

  const formCompleto = expConfirmado && !!hospitalId && !!escalafonId && !!puesto && !!desde
  const expLabel     = tipo === 'estructura' ? 'Decreto' : 'Expediente'
  const expPlaceholder = tipo === 'estructura'
    ? 'Ej: DEC-541/MSGC/26'
    : 'Ej: EX-2026-32260736-GCABA-DGAYDRH'

  return (
    <div className="border-t border-gray-100 pt-5 space-y-5">

      {/* Expediente / Decreto */}
      {!expConfirmado ? (
        <div className="flex items-end gap-3 p-4 rounded-lg border-2 border-secondary/30 bg-secondary/5">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-secondary mb-1.5 uppercase tracking-wider">
              {expLabel} <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={expInput}
              onChange={(e) => setExpInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmarExp()}
              placeholder={expPlaceholder}
              className="h-10 input w-full"
              autoFocus
            />
          </div>
          <button type="button" onClick={confirmarExp} disabled={!expInput.trim()} className="btn-primary disabled:opacity-40">
            Confirmar
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between p-4 rounded-lg border border-green-200 bg-green-50">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-sm">✓</span>
            <div>
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">{expLabel} confirmado</p>
              <p className="text-sm font-bold text-gray-800 mt-0.5">{expediente}</p>
            </div>
          </div>
          <button type="button" onClick={() => { setExpConfirmado(false); setExpInput(expediente) }} className="text-xs text-gray-400 hover:text-gray-600 underline">
            Cambiar
          </button>
        </div>
      )}

      {/* Campos del cargo */}
      <div className={`space-y-4 transition-opacity ${expConfirmado ? '' : 'opacity-40 pointer-events-none select-none'}`}>

        {/* Hospital + Escalafón */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Hospital <span className="text-danger">*</span></label>
            <select value={hospitalId} onChange={(e) => { setHospitalId(e.target.value); setPuesto(''); setEspecialidad('') }} className="h-10 input w-full">
              <option value="">Seleccionar...</option>
              {hospitales.map((h) => <option key={h.id} value={h.id}>{h.sigla} — {h.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Escalafón <span className="text-danger">*</span></label>
            <select value={escalafonId} onChange={(e) => { setEscalafonId(e.target.value); setPuesto(''); setEspecialidad('') }} className="h-10 input w-full">
              <option value="">Seleccionar...</option>
              {escalafones.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
        </div>

        {/* Puesto + Especialidad */}
        {escalafonId && (
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Puesto <span className="text-danger">*</span></label>
              {puestos.length > 0 ? (
                <select value={puesto} onChange={(e) => { setPuesto(e.target.value); setEspecialidad('') }} className="h-10 input w-full">
                  <option value="">Seleccionar...</option>
                  {puestos.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={puesto}
                  onChange={(e) => setPuesto(e.target.value)}
                  placeholder="Ingresar puesto manualmente"
                  className="h-10 input w-full"
                />
              )}
            </div>
            {puesto && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Especialidad</label>
                <input
                  type="text"
                  value={especialidad}
                  onChange={(e) => setEspecialidad(e.target.value)}
                  placeholder="Ej: Cardiología (opcional)"
                  className="h-10 input w-full"
                />
              </div>
            )}
          </div>
        )}

        {/* Desde + Cantidad + botones */}
        <div className="grid grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Desde <span className="text-danger">*</span></label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-10 input w-full" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Cantidad</label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setCantidad((v) => Math.max(1, v - 1))} className="w-8 h-8 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 font-bold text-lg leading-none">−</button>
              <span className="w-8 text-center text-sm font-bold text-gray-800">{cantidad}</span>
              <button type="button" onClick={() => setCantidad((v) => Math.min(50, v + 1))} className="w-8 h-8 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 font-bold text-lg leading-none">+</button>
            </div>
          </div>
          <div className="col-span-2 flex gap-2">
            <button type="button" onClick={onCancelar} className="btn-outline flex-1">Cancelar</button>
            <button
              type="button"
              onClick={handleRegistrar}
              disabled={!formCompleto || mutation.isPending}
              className="btn-primary flex-1 disabled:opacity-40"
            >
              {mutation.isPending ? 'Registrando...' : 'Registrar'}
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────
export function AltaCargosPage() {
  const [tipoActivo, setTipoActivo] = useState<TipoAlta | null>(null)
  const [search,     setSearch]     = useState('')
  const [historial,  setHistorial]  = useState<AltaRegistrada[]>([])

  function handleRegistrar(alta: AltaRegistrada) {
    setHistorial((prev) => [alta, ...prev])
    setTipoActivo(null)
  }

  const filtrados = historial.filter((a) => {
    const q = search.toLowerCase()
    return (
      !q ||
      a.hospitalSigla.toLowerCase().includes(q) ||
      a.escalafon.toLowerCase().includes(q) ||
      a.puesto.toLowerCase().includes(q) ||
      a.expediente.toLowerCase().includes(q) ||
      a.codigos.some((c) => c.toLowerCase().includes(q)) ||
      TIPO_LABEL[a.tipo].toLowerCase().includes(q)
    )
  })

  const BOTONES: { tipo: TipoAlta; label: string; cls: string }[] = [
    { tipo: 'pof',        label: 'Cargo de Ejecución POF', cls: 'btn-secondary' },
    { tipo: 'pou',        label: 'Cargo de Ejecución POU', cls: 'btn-outline'   },
    { tipo: 'estructura', label: 'Cargo por Estructura',   cls: 'btn-outline'   },
  ]

  return (
    <div className="space-y-6">

      {/* Header + formulario inline */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-primary text-xl font-bold text-gray-900">Alta de Cargos</h1>
          <div className="flex gap-2">
            {BOTONES.map(({ tipo, label, cls }) => (
              <button
                key={tipo}
                type="button"
                onClick={() => setTipoActivo((prev) => (prev === tipo ? null : tipo))}
                className={`${cls} ${tipoActivo === tipo ? 'ring-2 ring-offset-1 ring-secondary' : ''}`}
              >
                {tipoActivo === tipo ? `▲ ${label}` : `+ ${label}`}
              </button>
            ))}
          </div>
        </div>

        {tipoActivo && (
          <FormAlta
            key={tipoActivo}
            tipo={tipoActivo}
            onRegistrar={handleRegistrar}
            onCancelar={() => setTipoActivo(null)}
          />
        )}
      </div>

      {/* Historial de la sesión */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <h2 className="font-primary text-base font-bold text-gray-700">Altas registradas en esta sesión</h2>
        <input
          type="text"
          placeholder="Buscar por hospital, escalafón, puesto, código, expediente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 px-3 border border-gray-300 rounded w-full focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
        />
      </div>

      {filtrados.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-navy text-white text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Hospital</th>
                <th className="px-4 py-3 font-semibold">Escalafón</th>
                <th className="px-4 py-3 font-semibold">Puesto</th>
                <th className="px-4 py-3 font-semibold">Especialidad</th>
                <th className="px-4 py-3 font-semibold">Códigos generados</th>
                <th className="px-4 py-3 font-semibold">Expediente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{a.fecha}</td>
                  <td className="px-4 py-3">
                    <span className={TIPO_BADGE[a.tipo]}>{TIPO_LABEL[a.tipo]}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{a.hospitalSigla}</td>
                  <td className="px-4 py-3 text-gray-600">{a.escalafon}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{a.puesto}</td>
                  <td className="px-4 py-3 text-gray-600">{a.especialidad}</td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-700">
                    {a.codigos.join(', ')}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono">{a.expediente}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {historial.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-sm text-gray-400">
          No hay altas registradas en esta sesión. Usá los botones de arriba para registrar un cargo nuevo.
        </div>
      )}
    </div>
  )
}
