import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Cargo, CreateCargoRequest } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'
import { useHospitales, useEscalafones, usePuestosCargoNormalizados, useEspecialidadesPuesto } from '@/shared/hooks/useCatalogos'

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

interface OpcionModalidad {
  label: string
  unificadorPuesto: string
  agrupador?: string
}

function opcionesModalidad(escNombre: string, tipo: TipoAlta): OpcionModalidad[] {
  const esc = escNombre.toUpperCase()
  if (tipo === 'estructura') return [{ label: 'Estructura', unificadorPuesto: 'Estructura' }]
  if (esc.includes('MÉDICO') || esc.includes('MEDICO') || esc.includes('CPH') || esc.includes('PROFESIONAL HOSPITALARIA')) {
    if (tipo === 'pof') return [{ label: 'Planta (POF)',  unificadorPuesto: 'POF' }]
    if (tipo === 'pou') return [{ label: 'Guardia (POU)', unificadorPuesto: 'POU Guardia' }]
  }
  if (esc.includes('ENFERMER') || esc.includes('ENF'))
    return [{ label: 'Enfermería', unificadorPuesto: tipo === 'pou' ? 'POU Guardia' : 'POF' }]
  if (esc.includes('CEETPS') || esc.includes('TEC')) {
    if (tipo === 'pof') return [{ label: 'Técnico Planta (POF)',  unificadorPuesto: 'POF' }]
    if (tipo === 'pou') return [{ label: 'Técnico Guardia (POU)', unificadorPuesto: 'POU Guardia' }]
  }
  if (esc.includes('GENERAL') || esc === 'EG') return [
    { label: 'General',   unificadorPuesto: 'EG' },
    { label: 'Jefe',      unificadorPuesto: 'EG', agrupador: 'Jefe' },
    { label: 'Director',  unificadorPuesto: 'EG', agrupador: 'Director' },
    { label: 'Gerencial', unificadorPuesto: 'Gerencial' },
  ]
  if (esc.includes('AUTORIDAD') || esc === 'AS') return [
    { label: 'Dir. General',         unificadorPuesto: 'Dir. General' },
    { label: 'Dir. General Adjunta', unificadorPuesto: 'Dir. General Adjunta', agrupador: 'Adjunta' },
    { label: 'Subsecretaría',        unificadorPuesto: 'Subsecretaría' },
    { label: 'Ministro',             unificadorPuesto: 'Ministro' },
  ]
  return [{ label: tipo === 'pou' ? 'Guardia (POU)' : 'Planta (POF)', unificadorPuesto: tipo === 'pou' ? 'POU Guardia' : 'POF' }]
}

function modalidadParaTipo(tipo: TipoAlta): 'pof' | 'pou' | 'ambos' {
  if (tipo === 'pof') return 'pof'
  if (tipo === 'pou') return 'pou'
  return 'ambos'
}

interface ItemPendiente {
  id: string
  tipo: TipoAlta
  hospitalId: string
  hospitalSigla: string
  escalafonId: string
  escalafon: string
  puesto: string
  especialidad: string
  unificadorPuesto: string
  agrupador?: string
  expediente: string
  desde: string
  cantidad: number
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

// ── Combobox con búsqueda ─────────────────────────────────────────────────────
function PuestoCombobox({ puestos, value, onChange, placeholder = 'Buscar...' }: {
  puestos: string[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [query,   setQuery]   = useState('')
  const [abierto, setAbierto] = useState(false)
  const filtrados = query.trim()
    ? puestos.filter((p) => p.toLowerCase().includes(query.toLowerCase()))
    : puestos
  return (
    <div className="relative">
      <input
        type="text"
        value={abierto ? query : value}
        placeholder={value || placeholder}
        className="h-10 input w-full"
        onFocus={() => { setAbierto(true); setQuery('') }}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onChange={(e) => setQuery(e.target.value)}
      />
      {abierto && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {filtrados.length === 0
            ? <li className="px-3 py-2 text-sm text-gray-400">Sin resultados</li>
            : filtrados.map((p) => (
                <li key={p} onMouseDown={() => { onChange(p); setQuery(''); setAbierto(false) }}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-secondary/10 ${p === value ? 'bg-secondary/10 font-medium text-secondary' : 'text-gray-700'}`}>
                  {p}
                </li>
              ))
          }
        </ul>
      )}
    </div>
  )
}

// ── Formulario (expediente + campos, agrega al panel) ────────────────────────
function FormAlta({ tipo, onAgregar, onCancelar }: {
  tipo: TipoAlta
  onAgregar: (item: ItemPendiente) => void
  onCancelar: () => void
}) {
  const [expInput,      setExpInput]      = useState('')
  const [expConfirmado, setExpConfirmado] = useState(false)
  const [expediente,    setExpediente]    = useState('')
  const [hospitalId,    setHospitalId]    = useState('')
  const [escalafonId,   setEscalafonId]   = useState('')
  const [modalidadIdx,  setModalidadIdx]  = useState<number | null>(null)
  const [puesto,        setPuesto]        = useState('')
  const [especialidad,  setEspecialidad]  = useState('')
  const [desde,         setDesde]         = useState('')
  const [cantidad,      setCantidad]      = useState(1)

  const { data: hospitales  = [] } = useHospitales()
  const { data: escalafones = [] } = useEscalafones(true)

  const escNombre         = escalafones.find((e) => e.id === escalafonId)?.nombre ?? ''
  const opciones          = escalafonId ? opcionesModalidad(escNombre, tipo) : []
  const modalidadEfectiva = opciones.length === 1 ? opciones[0]! : (modalidadIdx !== null ? opciones[modalidadIdx] ?? null : null)

  const { data: puestos        = [] } = usePuestosCargoNormalizados(escalafonId || undefined, modalidadParaTipo(tipo))
  const { data: especialidades = [] } = useEspecialidadesPuesto(escalafonId || undefined, puesto || undefined)

  const formCompleto = expConfirmado && !!hospitalId && !!escalafonId && !!modalidadEfectiva && !!puesto
    && (especialidades.length === 0 || !!especialidad) && !!desde

  const expLabel       = tipo === 'estructura' ? 'Decreto' : 'Expediente'
  const expPlaceholder = tipo === 'estructura' ? 'Ej: DEC-541/MSGC/26' : 'Ej: EX-2026-32260736-GCABA-DGAYDRH'

  function confirmarExp() {
    const v = expInput.trim()
    if (!v) return
    setExpediente(v)
    setExpConfirmado(true)
  }

  function handleAgregar() {
    if (!formCompleto || !modalidadEfectiva) return
    const hospital = hospitales.find((h) => h.id === hospitalId)
    const esc      = escalafones.find((e) => e.id === escalafonId)
    onAgregar({
      id:               crypto.randomUUID(),
      tipo,
      hospitalId,
      hospitalSigla:    hospital?.sigla ?? hospitalId,
      escalafonId,
      escalafon:        esc?.nombre ?? escalafonId,
      puesto,
      especialidad:     especialidad || '',
      unificadorPuesto: modalidadEfectiva.unificadorPuesto,
      agrupador:        modalidadEfectiva.agrupador,
      expediente,
      desde,
      cantidad,
    })
    setPuesto(''); setEspecialidad(''); setCantidad(1)
  }

  return (
    <div className="border-t border-gray-100 pt-5 space-y-4">

      {/* Expediente */}
      {!expConfirmado ? (
        <div className="flex items-end gap-3 p-4 rounded-lg border-2 border-secondary/30 bg-secondary/5">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-secondary mb-1.5 uppercase tracking-wider">
              {expLabel} <span className="text-danger">*</span>
            </label>
            <input type="text" value={expInput} onChange={(e) => setExpInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmarExp()}
              placeholder={expPlaceholder} className="h-10 input w-full" autoFocus />
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
          <button type="button" onClick={() => { setExpConfirmado(false); setExpInput(expediente) }}
            className="text-xs text-gray-400 hover:text-gray-600 underline">Cambiar</button>
        </div>
      )}

      {/* Campos — se habilitan tras confirmar expediente */}
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
            <select value={escalafonId} onChange={(e) => { setEscalafonId(e.target.value); setModalidadIdx(null); setPuesto(''); setEspecialidad('') }} className="h-10 input w-full">
              <option value="">Seleccionar...</option>
              {escalafones.map((e) => <option key={e.id} value={e.id}>{e.nombre === 'Médicos' ? 'CPH' : e.nombre}</option>)}
            </select>
          </div>
        </div>

        {/* Modalidad — solo si hay más de una opción */}
        {escalafonId && opciones.length > 1 && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Modalidad / Categoría <span className="text-danger">*</span></label>
            <div className="flex flex-wrap gap-2">
              {opciones.map((op, i) => (
                <button key={i} type="button" onClick={() => { setModalidadIdx(i); setPuesto(''); setEspecialidad('') }}
                  className={`px-3 py-1.5 rounded border text-sm font-medium transition-colors ${
                    modalidadIdx === i
                      ? 'border-secondary bg-secondary text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-secondary hover:text-secondary'
                  }`}>
                  {op.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Puesto + Especialidad */}
        {escalafonId && (
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Puesto <span className="text-danger">*</span></label>
              <PuestoCombobox puestos={puestos} value={puesto} onChange={(v) => { setPuesto(v); setEspecialidad('') }} />
            </div>
            {puesto && especialidades.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Especialidad <span className="text-danger">*</span></label>
                <PuestoCombobox puestos={especialidades} value={especialidad} onChange={setEspecialidad} placeholder="Buscar especialidad..." />
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
            <button type="button" onClick={handleAgregar} disabled={!formCompleto}
              className="btn-primary flex-1 disabled:opacity-40">
              + Agregar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────
export function AltaCargosPage() {
  const [tipoActivo, setTipoActivo] = useState<TipoAlta | null>(null)
  const [pendientes, setPendientes] = useState<ItemPendiente[]>([])
  const [historial,  setHistorial]  = useState<AltaRegistrada[]>([])
  const [guardando,  setGuardando]  = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [search,     setSearch]     = useState('')

  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (body: CreateCargoRequest) => {
      const res = await apiClient.post<{ data: Cargo[] }>('/api/v1/cargos', body)
      return res.data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cargos'] }),
  })

  function handleAgregar(item: ItemPendiente) {
    setPendientes((prev) => [...prev, item])
  }

  async function handleRegistrarTodos() {
    if (pendientes.length === 0) return
    setGuardando(true); setError(null)
    const nuevos: AltaRegistrada[] = []
    try {
      for (const item of pendientes) {
        const creados = await mutation.mutateAsync({
          hospitalId:       item.hospitalId,
          escalafonId:      item.escalafonId,
          literalPuesto:    item.puesto,
          especialidad:     item.especialidad || undefined,
          unificadorPuesto: item.unificadorPuesto,
          agrupador:        item.agrupador,
          expediente:       item.expediente || undefined,
          desde:            item.desde,
          cantidad:         item.cantidad,
        })
        nuevos.push({
          id:            item.id,
          fecha:         new Date().toISOString().slice(0, 10),
          tipo:          item.tipo,
          hospitalSigla: item.hospitalSigla,
          escalafon:     item.escalafon,
          puesto:        item.puesto,
          especialidad:  item.especialidad || '—',
          expediente:    item.expediente,
          cantidad:      item.cantidad,
          codigos:       creados.map((c) => c.codigo ?? '').filter(Boolean),
        })
      }
      setHistorial((prev) => [...nuevos, ...prev])
      setPendientes([])
    } catch {
      setError('Error al registrar. Verificá los datos e intentá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  const totalPendientes = pendientes.reduce((acc, p) => acc + p.cantidad, 0)

  const filtrados = historial.filter((a) => {
    const q = search.toLowerCase()
    return !q || a.hospitalSigla.toLowerCase().includes(q) || a.escalafon.toLowerCase().includes(q)
      || a.puesto.toLowerCase().includes(q) || a.expediente.toLowerCase().includes(q)
      || a.codigos.some((c) => c.toLowerCase().includes(q)) || TIPO_LABEL[a.tipo].toLowerCase().includes(q)
  })

  const BOTONES: { tipo: TipoAlta; label: string; cls: string }[] = [
    { tipo: 'pof',        label: 'Ejecución POF', cls: 'btn-secondary' },
    { tipo: 'pou',        label: 'Ejecución POU', cls: 'btn-outline'   },
    { tipo: 'estructura', label: 'Estructura',    cls: 'btn-outline'   },
  ]

  return (
    <div className="space-y-6">

      <div className="bg-white rounded-lg shadow-sm p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="font-primary text-xl font-bold text-gray-900">Alta de Cargos</h1>
          <div className="flex gap-2">
            {BOTONES.map(({ tipo, label, cls }) => (
              <button key={tipo} type="button"
                onClick={() => setTipoActivo((prev) => (prev === tipo ? null : tipo))}
                className={`${cls} ${tipoActivo === tipo ? 'ring-2 ring-offset-1 ring-secondary' : ''}`}>
                {tipoActivo === tipo ? `▲ ${label}` : `+ ${label}`}
              </button>
            ))}
          </div>
        </div>

        {/* Sin formulario activo y sin pendientes: mensaje simple */}
        {!tipoActivo && pendientes.length === 0 && (
          <p className="text-sm text-gray-400">Seleccioná un tipo de cargo para agregar.</p>
        )}

        {/* Layout 2 columnas — solo cuando hay formulario activo o pendientes */}
        {(tipoActivo || pendientes.length > 0) && (
        <div className="flex gap-6 items-start">

          {/* Izquierda: formulario */}
          <div className="flex-1 min-w-0">
            {tipoActivo && (
              <FormAlta
                key={tipoActivo}
                tipo={tipoActivo}
                onAgregar={handleAgregar}
                onCancelar={() => setTipoActivo(null)}
              />
            )}
          </div>

          {/* Derecha: panel de pendientes */}
          <div className="w-72 flex-shrink-0">
            <div className="rounded-xl border border-gray-200 bg-white sticky top-4">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Cargos pendientes</span>
                {totalPendientes > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-secondary text-white text-xs font-bold">
                    {totalPendientes}
                  </span>
                )}
              </div>
              <div className="p-3 min-h-[100px]">
                {pendientes.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6">Aún no hay cargos agregados</p>
                ) : (
                  <div className="space-y-2">
                    {pendientes.map((item, i) => (
                      <div key={item.id} className="flex items-start justify-between gap-2 p-3 rounded-lg bg-gray-50 border border-gray-100">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-secondary uppercase">{TIPO_LABEL[item.tipo]}</span>
                            <span className="text-xs text-gray-400">·</span>
                            <span className="text-xs font-medium text-gray-700">{item.hospitalSigla}</span>
                            {item.cantidad > 1 && (
                              <span className="text-xs bg-secondary/10 text-secondary px-1.5 py-0.5 rounded font-medium">x{item.cantidad}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 font-medium mt-0.5 truncate">{item.puesto}</p>
                          {item.especialidad && <p className="text-xs text-gray-400 truncate">{item.especialidad}</p>}
                          <p className="text-xs text-gray-400 mt-0.5">Desde: {item.desde}</p>
                        </div>
                        <button type="button" onClick={() => setPendientes((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5 text-lg leading-none">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {error && <p className="px-3 pb-2 text-xs text-red-500">{error}</p>}
              <div className="px-3 pb-3">
                <button type="button" onClick={handleRegistrarTodos}
                  disabled={pendientes.length === 0 || guardando}
                  className="w-full btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
                  {guardando ? 'Registrando...' : `Registrar${totalPendientes > 0 ? ` (${totalPendientes})` : ' todos'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Historial */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <h2 className="font-primary text-base font-bold text-gray-700">Altas registradas en esta sesión</h2>
        <input type="text" placeholder="Buscar por hospital, escalafón, puesto, código, expediente..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="h-10 px-3 border border-gray-300 rounded w-full focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
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
                  <td className="px-4 py-3"><span className={TIPO_BADGE[a.tipo]}>{TIPO_LABEL[a.tipo]}</span></td>
                  <td className="px-4 py-3 text-gray-600">{a.hospitalSigla}</td>
                  <td className="px-4 py-3 text-gray-600">{a.escalafon}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{a.puesto}</td>
                  <td className="px-4 py-3 text-gray-600">{a.especialidad}</td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-700">{a.codigos.join(', ')}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono">{a.expediente}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {historial.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-sm text-gray-400">
          No hay altas registradas en esta sesión. Usá los botones de arriba para agregar cargos.
        </div>
      )}
    </div>
  )
}
