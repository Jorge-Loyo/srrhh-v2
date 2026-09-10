import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { Baja, SolicitudAlta, SolicitudAltaEstado } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'
import { useHospitales, useEscalafonesPorTipoAlta, usePuestosCargoNormalizados, useEspecialidadesPuesto } from '@/shared/hooks/useCatalogos'
import { hospitalLabel } from '@/shared/lib/hospitalLabel'
import { useSolicitudesAlta, useCreateSolicitudAlta } from '../hooks/useSolicitudesAlta'
import { getApiErrorMessage } from '@/shared/lib/utils'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type TipoAlta = 'pof' | 'pou' | 'estructura'

const TIPO_LABEL: Record<TipoAlta, string> = {
  pof:        'Ejecución POF',
  pou:        'Ejecución POU',
  estructura: 'Estructura',
}

const ESTADO_LABEL: Record<SolicitudAltaEstado, string> = {
  pendiente: 'Pendiente de aprobación',
  aprobada:  'Aprobada',
  rechazada: 'Rechazada',
}

const ESTADO_BADGE: Record<SolicitudAltaEstado, string> = {
  pendiente: 'badge-warning',
  aprobada:  'badge-success',
  rechazada: 'badge-danger',
}

interface OpcionModalidad {
  label: string
  unificadorPuesto: string
  agrupador?: string
}

function opcionesModalidad(escNombre: string, tipo: TipoAlta): OpcionModalidad[] {
  const esc = escNombre.toUpperCase()
  if (esc.includes('GENERAL') || esc === 'EG') {
    if (tipo === 'estructura') return [
      { label: 'General',   unificadorPuesto: 'EG' },
      { label: 'Jefe',      unificadorPuesto: 'EG', agrupador: 'Jefe' },
      { label: 'Director',  unificadorPuesto: 'EG', agrupador: 'Director' },
      { label: 'Gerencial', unificadorPuesto: 'Gerencial' },
    ]
    // POF / POU: solo puestos Anexo 2
    return [{ label: 'Anexo 2', unificadorPuesto: 'ambos' }]
  }
  if (tipo === 'estructura') return [{ label: 'Estructura', unificadorPuesto: 'Estructura' }]
  if (esc.includes('MÉDICO') || esc.includes('MEDICO') || esc.includes('PROFESIONAL HOSPITALARIA')) {
    if (tipo === 'pof') return [{ label: 'Planta (POF)',  unificadorPuesto: 'POF' }]
    if (tipo === 'pou') return [{ label: 'Guardia (POU)', unificadorPuesto: 'POU Guardia' }]
  }
  if (esc.includes('ENFERMER') || esc.includes('ENF'))
    return [{ label: 'Enfermería', unificadorPuesto: tipo === 'pou' ? 'POU Guardia' : 'POF' }]
  if (esc.includes('CEETPS') || esc.includes('TEC')) {
    if (tipo === 'pof') return [{ label: 'Técnico Planta (POF)',  unificadorPuesto: 'POF' }]
    if (tipo === 'pou') return [{ label: 'Técnico Guardia (POU)', unificadorPuesto: 'POU Guardia' }]
  }
  if (esc.includes('GENERAL') || esc === 'EG') {
    // POF / POU: solo puestos Anexo 2
    return [{ label: 'Anexo 2', unificadorPuesto: 'ambos' }]
  }
  if (esc.includes('AUTORIDAD') || esc === 'AS') return [
    { label: 'Dir. General',         unificadorPuesto: 'Dir. General' },
    { label: 'Dir. General Adjunta', unificadorPuesto: 'Dir. General Adjunta', agrupador: 'Adjunta' },
    { label: 'Subsecretaría',        unificadorPuesto: 'Subsecretaría' },
    { label: 'Ministro',             unificadorPuesto: 'Ministro' },
  ]
  // Escalafones sin distinción POF/POU (Residentes, Docentes, Gerencial, etc.)
  return [{ label: escNombre || 'Planta', unificadorPuesto: 'ambos' }]
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
  etiqueta: string
  bajaOrigenId?: string
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
  const [etiqueta,      setEtiqueta]      = useState('')
  const [bajaOrigenId,  setBajaOrigenId]  = useState<string | undefined>(undefined)

  const { data: hospitales        = [] } = useHospitales()
  const { data: escalafonesFiltrados = [] } = useEscalafonesPorTipoAlta(tipo)

  // S16-8: bajas confirmadas con concurso para vincular como origen
  const { data: bajasConfirmadas = [] } = useQuery({
    queryKey: ['bajas', { estado: 'confirmada', generaConcurso: true }],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Baja[] }>('/api/v1/bajas', { params: { estado: 'confirmada', limit: 200 } })
      return res.data.data ?? []
    },
  })

  const escNombre         = escalafonesFiltrados.find((e) => e.id === escalafonId)?.nombre ?? ''
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
    const esc      = escalafonesFiltrados.find((e) => e.id === escalafonId)
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
      etiqueta:         etiqueta || '',
      bajaOrigenId,
    })
    setPuesto(''); setEspecialidad(''); setCantidad(1); setEtiqueta(''); setBajaOrigenId(undefined)
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
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Sigla <span className="text-danger">*</span></label>
            <select value={hospitalId} onChange={(e) => { setHospitalId(e.target.value); setPuesto(''); setEspecialidad('') }} className="h-10 input w-full">
              <option value="">Seleccionar...</option>
              {hospitales.map((h) => <option key={h.id} value={h.id}>{hospitalLabel(h)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Escalafón <span className="text-danger">*</span></label>
            <select value={escalafonId} onChange={(e) => { setEscalafonId(e.target.value); setModalidadIdx(null); setPuesto(''); setEspecialidad('') }} className="h-10 input w-full">
              <option value="">Seleccionar...</option>
              {escalafonesFiltrados.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
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

        {/* Baja origen — opcional */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">¿Reemplaza una baja? <span className="text-gray-400 font-normal">(opcional)</span></label>
          <select
            value={bajaOrigenId ?? ''}
            onChange={(e) => setBajaOrigenId(e.target.value || undefined)}
            className="h-10 input w-full"
          >
            <option value="">— No vinculada —</option>
            {bajasConfirmadas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.cargo?.codigo ?? b.cargoId} · {b.cargo?.literalPuesto ?? '—'} · {b.fechaBaja?.slice(0, 10)}
              </option>
            ))}
          </select>
        </div>

        {/* Desde + Cantidad + botones */}
        <div className="grid grid-cols-5 gap-4 items-end">
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
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Etiqueta</label>
            <input
              type="text"
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value.toUpperCase())}
              placeholder="Ej: BA"
              maxLength={100}
              className="h-10 input w-full font-bold"
            />
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
  const [tab,        setTab]        = useState<'historial' | 'nueva' | 'transferencia'>('historial')
  const [tipoActivo, setTipoActivo] = useState<TipoAlta | null>(null)
  const [pendientes, setPendientes] = useState<ItemPendiente[]>([])
  const [guardando,  setGuardando]  = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [search,     setSearch]     = useState('')
  const [filtroEstado, setFiltroEstado] = useState<SolicitudAltaEstado | ''>('')

  // S13-D: historial ahora lista SolicitudAlta (con estado pendiente/aprobada/
  // rechazada) — el Cargo real recién existe cuando el director aprueba.
  const { data: solicitudesData, refetch: refetchSolicitudes } = useSolicitudesAlta({
    ...(filtroEstado && { estado: filtroEstado }),
  })
  const solicitudes = solicitudesData?.data ?? []
  const solicitudesFiltradas = search.trim()
    ? solicitudes.filter((s) => (s.expediente ?? '').toLowerCase().includes(search.trim().toLowerCase()))
    : solicitudes

  const crearSolicitud = useCreateSolicitudAlta()

  function handleAgregar(item: ItemPendiente) {
    setPendientes((prev) => [...prev, item])
  }

  async function registrarItem(item: ItemPendiente) {
    return crearSolicitud.mutateAsync({
      hospitalId:       item.hospitalId,
      escalafonId:      item.escalafonId,
      literalPuesto:    item.puesto,
      especialidad:     item.especialidad || undefined,
      unificadorPuesto: item.unificadorPuesto,
      agrupador:        item.agrupador,
      expediente:       item.expediente || undefined,
      desde:            item.desde,
      cantidad:         item.cantidad,
      etiqueta:         item.etiqueta || undefined,
      bajaOrigenId:     item.bajaOrigenId,
    })
  }

  async function handleRegistrarTodos() {
    if (pendientes.length === 0) return
    setGuardando(true); setError(null)
    try {
      for (const item of pendientes) {
        await registrarItem(item)
      }
      setPendientes([])
      refetchSolicitudes()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setGuardando(false)
    }
  }

  const totalPendientes = pendientes.reduce((acc, p) => acc + p.cantidad, 0)

  const BOTONES: { tipo: TipoAlta; label: string; cls: string }[] = [
    { tipo: 'pof',        label: 'Ejecución POF', cls: 'btn-secondary' },
    { tipo: 'pou',        label: 'Ejecución POU', cls: 'btn-outline'   },
    { tipo: 'estructura', label: 'Estructura',    cls: 'btn-outline'   },
  ]

  return (
    <div className="flex flex-col gap-6 h-full">

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm">
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <h1 className="font-primary text-xl font-bold text-gray-900">Alta de Cargos</h1>
          {tab === 'nueva' && (
            <div className="flex gap-2">
              {BOTONES.map(({ tipo, label, cls }) => (
                <button key={tipo} type="button"
                  onClick={() => setTipoActivo((prev) => (prev === tipo ? null : tipo))}
                  className={`${cls} ${tipoActivo === tipo ? 'ring-2 ring-offset-1 ring-secondary' : ''}`}>
                  {tipoActivo === tipo ? `▲ ${label}` : `+ ${label}`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 px-6 mt-4 border-b border-gray-200">
          {(['historial', 'nueva', 'transferencia'] as const).map((t) => (
            <button key={t} type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                tab === t
                  ? 'border-secondary text-secondary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t === 'historial' ? 'Historial de solicitudes' : t === 'nueva' ? 'Nueva alta' : 'Transferencia'}
            </button>
          ))}
        </div>

        {/* Contenido pestaña Nueva alta */}
        {tab === 'nueva' && (
          <div className="p-6">
            {!tipoActivo && pendientes.length === 0 && (
              <p className="text-sm text-gray-400">Seleccioná un tipo de cargo para agregar.</p>
            )}
            {(tipoActivo || pendientes.length > 0) && (
              <div className="flex gap-6 items-start">
                <div className="flex-1 min-w-0">
                  {tipoActivo && (
                    <FormAlta key={tipoActivo} tipo={tipoActivo} onAgregar={handleAgregar} onCancelar={() => setTipoActivo(null)} />
                  )}
                </div>
                <div className="w-72 flex-shrink-0">
                  <div className="rounded-xl border border-gray-200 bg-white sticky top-4">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                      <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Cargos pendientes</span>
                      {totalPendientes > 0 && (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-secondary text-white text-xs font-bold">{totalPendientes}</span>
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
                                  {item.etiqueta && (
                                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">{item.etiqueta}</span>
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
                    <p className="px-3 pb-2 text-[11px] text-gray-400">
                      Cada cargo queda como solicitud pendiente hasta que el director la apruebe.
                    </p>
                    <div className="px-3 pb-3">
                      <button type="button" onClick={handleRegistrarTodos}
                        disabled={pendientes.length === 0 || guardando}
                        className="w-full btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
                        {guardando ? 'Enviando...' : `Enviar a aprobación${totalPendientes > 0 ? ` (${totalPendientes})` : ''}`}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Contenido pestaña Historial */}
        {tab === 'historial' && (
          <HistorialSolicitudes
            search={search} setSearch={setSearch}
            filtroEstado={filtroEstado} setFiltroEstado={setFiltroEstado}
            solicitudes={solicitudesFiltradas}
          />
        )}

        {/* Contenido pestaña Transferencia */}
        {tab === 'transferencia' && (
          <div className="p-8 text-center text-sm text-gray-400">
            Próximamente — funcionalidad de transferencia de cargos.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Generador de PDF estilo resolución GCBA ───────────────────────────────────
// Solo tiene sentido para solicitudes aprobadas — antes de aprobar no existe
// ningún Cargo real con código asignado (S13-D: el código se genera al aprobar).
async function generarPDF(solicitud: SolicitudAlta) {
  const codigos = await Promise.all(
    solicitud.cargosCreadosIds.map(async (cargoId) => {
      try {
        const res = await apiClient.get<{ data: { codigo: string | null } }>(`/api/v1/cargos/${cargoId}`)
        return res.data.data.codigo ?? '—'
      } catch {
        return '—'
      }
    })
  )

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const expediente = solicitud.expediente ?? '(sin expediente)'
  const fecha = solicitud.createdAt.slice(0, 10)
  const registradoPor = solicitud.solicitadoPor?.username ?? '—'
  const desde = solicitud.desde ? solicitud.desde.slice(0, 10) : '—'

  doc.setFillColor(30, 41, 82)
  doc.rect(0, 0, 210, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('GOBIERNO DE LA CIUDAD AUTÓNOMA DE BUENOS AIRES', 105, 9, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Ministerio de Salud — Dirección General de Administración de Recursos Humanos', 105, 16, { align: 'center' })

  doc.setTextColor(30, 41, 82)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('ALTA DE CARGOS', 105, 34, { align: 'center' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(60, 60, 60)
  const col1 = 14, col2 = 62
  doc.text('Expediente / Decreto:', col1, 44)
  doc.setFont('helvetica', 'bold')
  doc.text(expediente, col2, 44)
  doc.setFont('helvetica', 'normal')
  doc.text('Fecha de solicitud:', col1, 51)
  doc.text(fecha, col2, 51)
  doc.text('Vigente desde:', col1, 58)
  doc.text(desde, col2, 58)
  doc.text('Solicitado por:', col1, 65)
  doc.text(registradoPor, col2, 65)
  doc.text('Total de cargos:', col1, 72)
  doc.text(String(codigos.length), col2, 72)

  doc.setDrawColor(200, 200, 200)
  doc.line(14, 76, 196, 76)

  autoTable(doc, {
    startY: 80,
    head: [['N°', 'Código', 'Hospital', 'Escalafón', 'Puesto']],
    body: codigos.map((codigo, i) => [
      String(i + 1),
      codigo,
      solicitud.hospital ? `${solicitud.hospital.sigla} — ${solicitud.hospital.nombre}` : '—',
      solicitud.escalafon?.nombre ?? '—',
      solicitud.literalPuesto,
    ]),
    headStyles: { fillColor: [30, 41, 82], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: [40, 40, 40] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 32 }, 2: { cellWidth: 55 }, 3: { cellWidth: 38 } },
    margin: { left: 14, right: 14 },
  })

  const pageH = doc.internal.pageSize.height
  doc.setFontSize(7)
  doc.setTextColor(150)
  doc.text(`Documento generado por el Sistema SRRHH — ${new Date().toLocaleString('es-AR')}`, 105, pageH - 8, { align: 'center' })

  doc.save(`Alta_Cargos_${expediente.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`)
}

// ── Historial de solicitudes de alta ──────────────────────────────────────────
function HistorialSolicitudes({
  search, setSearch, filtroEstado, setFiltroEstado, solicitudes,
}: {
  search: string
  setSearch: (v: string) => void
  filtroEstado: SolicitudAltaEstado | ''
  setFiltroEstado: (v: SolicitudAltaEstado | '') => void
  solicitudes: SolicitudAlta[]
}) {
  const [modalId, setModalId] = useState<string | null>(null)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const modalSolicitud = solicitudes.find((s) => s.id === modalId) ?? null

  async function onDescargarPdf(s: SolicitudAlta) {
    setGenerandoPdf(true)
    try {
      await generarPDF(s)
    } finally {
      setGenerandoPdf(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Modal de detalle */}
      {modalSolicitud && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="bg-navy px-6 py-4 rounded-t-xl flex items-start justify-between gap-4">
              <div>
                <p className="text-white/60 text-xs uppercase tracking-wider mb-0.5">Expediente / Decreto</p>
                <p className="text-white font-bold text-sm font-mono">{modalSolicitud.expediente ?? '(sin expediente)'}</p>
              </div>
              <button onClick={() => setModalId(null)} className="text-white/60 hover:text-white text-2xl leading-none mt-0.5">×</button>
            </div>

            <div className="px-6 py-4 space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className={`${ESTADO_BADGE[modalSolicitud.estado]} text-xs`}>{ESTADO_LABEL[modalSolicitud.estado]}</span>
                {modalSolicitud.estado === 'aprobada' && (
                  <span className="text-xs text-gray-400">{modalSolicitud.cargosCreadosIds.length} cargo(s) creado(s)</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div><span className="text-gray-500">Puesto:</span> <span className="font-medium text-gray-800">{modalSolicitud.literalPuesto}</span></div>
                <div><span className="text-gray-500">Hospital:</span> <span className="font-medium text-gray-800">{modalSolicitud.hospital ? `${modalSolicitud.hospital.sigla} — ${modalSolicitud.hospital.nombre}` : '—'}</span></div>
                <div><span className="text-gray-500">Escalafón:</span> <span className="font-medium text-gray-800">{modalSolicitud.escalafon?.nombre ?? '—'}</span></div>
                <div><span className="text-gray-500">Cantidad:</span> <span className="font-medium text-gray-800">{modalSolicitud.cantidad}</span></div>
                <div><span className="text-gray-500">Desde:</span> <span className="font-medium text-gray-800">{modalSolicitud.desde ? modalSolicitud.desde.slice(0, 10) : '—'}</span></div>
                <div><span className="text-gray-500">Solicitado por:</span> <span className="font-medium text-gray-800">{modalSolicitud.solicitadoPor?.username ?? '—'}</span></div>
                {modalSolicitud.especialidad && (
                  <div className="col-span-2"><span className="text-gray-500">Especialidad:</span> <span className="font-medium text-gray-800">{modalSolicitud.especialidad}</span></div>
                )}
                {modalSolicitud.etiqueta && (
                  <div className="col-span-2"><span className="text-gray-500">Etiqueta:</span> <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">{modalSolicitud.etiqueta}</span></div>
                )}
                {modalSolicitud.observaciones && (
                  <div className="col-span-2"><span className="text-gray-500">Observaciones:</span> <span className="text-gray-700">{modalSolicitud.observaciones}</span></div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
              <button onClick={() => setModalId(null)} className="btn-outline">Cerrar</button>
              {modalSolicitud.estado === 'aprobada' && (
                <button onClick={() => onDescargarPdf(modalSolicitud)} disabled={generandoPdf} className="btn-primary disabled:opacity-40">
                  {generandoPdf ? 'Generando...' : 'Descargar PDF'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="p-6 border-b border-gray-100 flex flex-wrap gap-3">
        <input type="text" placeholder="Buscar por expediente..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="h-10 px-3 border border-gray-300 rounded flex-1 min-w-[200px] focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as SolicitudAltaEstado | '')}
          className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* Tabla */}
      {solicitudes.length > 0 ? (
        <table className="w-full text-sm">
          <thead className="bg-navy text-white text-left sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 font-semibold rounded-tl-lg">Expediente</th>
              <th className="px-4 py-3 font-semibold">Fecha</th>
              <th className="px-4 py-3 font-semibold">Hospital</th>
              <th className="px-4 py-3 font-semibold">Puesto</th>
              <th className="px-4 py-3 font-semibold text-center">Cantidad</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 rounded-tr-lg" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {solicitudes.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs font-bold text-secondary max-w-[200px] truncate" title={s.expediente ?? ''}>{s.expediente ?? '(sin expediente)'}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{s.createdAt.slice(0, 10)}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">{s.hospital?.sigla ?? '—'}</td>
                <td className="px-4 py-3 text-gray-800 text-xs max-w-[200px] truncate" title={s.literalPuesto}>{s.literalPuesto}</td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-secondary/10 text-secondary text-xs font-bold">{s.cantidad}</span>
                </td>
                <td className="px-4 py-3"><span className={`${ESTADO_BADGE[s.estado]} text-xs`}>{ESTADO_LABEL[s.estado]}</span></td>
                <td className="px-4 py-3">
                  <button onClick={() => setModalId(s.id)} className="btn-outline text-xs px-3 py-1">Ver</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="p-8 text-center text-sm text-gray-400">
          No hay solicitudes de alta{search ? ` para "${search}"` : ''}.
        </p>
      )}
    </div>
  )
}
