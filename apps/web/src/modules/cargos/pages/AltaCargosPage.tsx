import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Cargo, CreateCargoRequest } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'
import { useHospitales, useEscalafones, usePuestosCargoNormalizados, useEspecialidadesPuesto, useAltasCargos } from '@/shared/hooks/useCatalogos'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type TipoAlta = 'pof' | 'pou' | 'estructura'

const TIPO_LABEL: Record<TipoAlta, string> = {
  pof:        'Ejecución POF',
  pou:        'Ejecución POU',
  estructura: 'Estructura',
}

interface OpcionModalidad {
  label: string
  unificadorPuesto: string
  agrupador?: string
}

function opcionesModalidad(escNombre: string, tipo: TipoAlta): OpcionModalidad[] {
  const esc = escNombre.toUpperCase()
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
    if (tipo === 'estructura') return [
      { label: 'General',   unificadorPuesto: 'EG' },
      { label: 'Jefe',      unificadorPuesto: 'EG', agrupador: 'Jefe' },
      { label: 'Director',  unificadorPuesto: 'EG', agrupador: 'Director' },
      { label: 'Gerencial', unificadorPuesto: 'Gerencial' },
    ]
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

// Escalafones permitidos por tipo de alta (nombres en BD)
const ESC_POF = new Set([
  'Carrera Profesional Hospitalaria', 'Carrera de Enfermería',
  'CEETPS', 'Escalafón General',
])
const ESC_POU = new Set([
  'Carrera Profesional Hospitalaria', 'CEETPS', 'Carrera de Enfermería',
  'Carrera de Técnicos de la Salud', 'Escalafón General',
])
const ESC_ESTRUCTURA = new Set([
  'Escalafón General', 'Autoridades Superiores', 'Carrera Gerencial', 'Cuerpos Transitorios',
])

function filtrarEscalafones(todos: { id: string; nombre: string }[], tipo: TipoAlta) {
  const permitidos = tipo === 'pof' ? ESC_POF : tipo === 'pou' ? ESC_POU : ESC_ESTRUCTURA
  return todos.filter((e) => permitidos.has(e.nombre))
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
  const escalafonesFiltrados = filtrarEscalafones(escalafones, tipo)

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
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Sigla <span className="text-danger">*</span></label>
            <select value={hospitalId} onChange={(e) => { setHospitalId(e.target.value); setPuesto(''); setEspecialidad('') }} className="h-10 input w-full">
              <option value="">Seleccionar...</option>
              {hospitales.map((h) => <option key={h.id} value={h.id}>{h.sigla} — {h.nombre}</option>)}
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
  const [guardando,  setGuardando]  = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [search,     setSearch]     = useState('')

  // S7-6: estado del modal de duplicado
  const [duplicado, setDuplicado] = useState<{
    item: ItemPendiente
    cargo: { id: string; codigo: string | null; literalPuesto: string | null; hospital: string; escalafon: string }
  } | null>(null)

  // S7-7: historial persistente
  const { data: altasData, refetch: refetchAltas } = useAltasCargos(
    search ? { expediente: search } : undefined
  )
  const altas = altasData?.data ?? []

  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (body: CreateCargoRequest) => {
      const res = await apiClient.post<{ data: Cargo[] }>('/api/v1/cargos', body)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cargos'] })
      refetchAltas()
    },
  })

  function handleAgregar(item: ItemPendiente) {
    setPendientes((prev) => [...prev, item])
  }

  async function registrarItem(item: ItemPendiente, forzar = false) {
    return mutation.mutateAsync({
      hospitalId:       item.hospitalId,
      escalafonId:      item.escalafonId,
      literalPuesto:    item.puesto,
      especialidad:     item.especialidad || undefined,
      unificadorPuesto: item.unificadorPuesto,
      agrupador:        item.agrupador,
      expediente:       item.expediente || undefined,
      desde:            item.desde,
      cantidad:         item.cantidad,
      forzar,
    })
  }

  async function handleRegistrarTodos() {
    if (pendientes.length === 0) return
    setGuardando(true); setError(null)
    try {
      for (const item of pendientes) {
        try {
          await registrarItem(item)
        } catch (err: unknown) {
          // S7-6: detectar 409 y abrir modal
          const status = (err as { response?: { status?: number; data?: { error?: { details?: unknown } } } })?.response?.status
          if (status === 409) {
            const details = (err as { response?: { data?: { error?: { details?: unknown } } } })?.response?.data?.error?.details as {
              codigo: string | null; literalPuesto: string | null; hospital: string; escalafon: string; id: string
            } | undefined
            if (details) {
              setDuplicado({ item, cargo: details })
              setGuardando(false)
              return
            }
          }
          throw err
        }
      }
      setPendientes([])
    } catch {
      setError('Error al registrar. Verificá los datos e intentá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  async function handleForzar() {
    if (!duplicado) return
    setDuplicado(null)
    setGuardando(true); setError(null)
    try {
      await registrarItem(duplicado.item, true)
      setPendientes((prev) => prev.filter((p) => p.id !== duplicado.item.id))
      // continuar con el resto si quedaron pendientes
      if (pendientes.filter((p) => p.id !== duplicado.item.id).length > 0) {
        await handleRegistrarTodos()
      }
    } catch {
      setError('Error al registrar. Verificá los datos e intentá de nuevo.')
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
    <div className="space-y-6">

      {/* S7-6: Modal de duplicado estructural */}
      {duplicado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="font-bold text-gray-900 text-base mb-1">Cargo duplicado</h3>
            <p className="text-sm text-gray-600 mb-4">
              Ya existe un cargo vigente con la misma estructura:
            </p>
            <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1 mb-5">
              <p><span className="text-gray-500">Código:</span> <span className="font-mono font-bold text-gray-800">{duplicado.cargo.codigo ?? '—'}</span></p>
              <p><span className="text-gray-500">Puesto:</span> <span className="font-medium text-gray-800">{duplicado.cargo.literalPuesto}</span></p>
              <p><span className="text-gray-500">Hospital:</span> {duplicado.cargo.hospital}</p>
              <p><span className="text-gray-500">Escalafón:</span> {duplicado.cargo.escalafon}</p>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setDuplicado(null)} className="btn-outline flex-1">Cancelar</button>
              <button type="button" onClick={handleForzar} className="btn-primary flex-1">Crear de todos modos</button>
            </div>
          </div>
        </div>
      )}

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

      {/* S7-7: Historial persistente agrupado por expediente */}
      <HistorialAltas search={search} setSearch={setSearch} altas={altas} />
    </div>
  )
}

// ── Tipo del historial ────────────────────────────────────────────────────────
type AltaItem = {
  id: string; codigo: string | null; literalPuesto: string | null
  expediente: string | null; fechaDesde: string | null; createdAt: string
  hospital: { sigla: string; nombre: string }
  escalafon: { nombre: string }
  createdBy: { username: string } | null
}

// ── Generador de PDF estilo resolución GCBA ───────────────────────────────────
function generarPDF(expediente: string, cargos: AltaItem[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const fecha = cargos[0]?.createdAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  const registradoPor = cargos[0]?.createdBy?.username ?? '—'
  const desde = cargos[0]?.fechaDesde ? cargos[0].fechaDesde.slice(0, 10) : '—'

  // Encabezado navy
  doc.setFillColor(30, 41, 82)
  doc.rect(0, 0, 210, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('GOBIERNO DE LA CIUDAD AUTÓNOMA DE BUENOS AIRES', 105, 9, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Ministerio de Salud — Dirección General de Administración de Recursos Humanos', 105, 16, { align: 'center' })

  // Título
  doc.setTextColor(30, 41, 82)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('ALTA DE CARGOS', 105, 34, { align: 'center' })

  // Datos del acto
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(60, 60, 60)
  const col1 = 14, col2 = 62
  doc.text('Expediente / Decreto:', col1, 44)
  doc.setFont('helvetica', 'bold')
  doc.text(expediente, col2, 44)
  doc.setFont('helvetica', 'normal')
  doc.text('Fecha de registro:', col1, 51)
  doc.text(fecha, col2, 51)
  doc.text('Vigente desde:', col1, 58)
  doc.text(desde, col2, 58)
  doc.text('Registrado por:', col1, 65)
  doc.text(registradoPor, col2, 65)
  doc.text('Total de cargos:', col1, 72)
  doc.text(String(cargos.length), col2, 72)

  doc.setDrawColor(200, 200, 200)
  doc.line(14, 76, 196, 76)

  // Tabla
  autoTable(doc, {
    startY: 80,
    head: [['N°', 'Código', 'Hospital', 'Escalafón', 'Puesto']],
    body: cargos.map((c, i) => [
      String(i + 1),
      c.codigo ?? '—',
      `${c.hospital.sigla} — ${c.hospital.nombre}`,
      c.escalafon.nombre,
      c.literalPuesto ?? '—',
    ]),
    headStyles: { fillColor: [30, 41, 82], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: [40, 40, 40] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 32 }, 2: { cellWidth: 55 }, 3: { cellWidth: 38 } },
    margin: { left: 14, right: 14 },
  })

  // Pie
  const pageH = doc.internal.pageSize.height
  doc.setFontSize(7)
  doc.setTextColor(150)
  doc.text(`Documento generado por el Sistema SRRHH — ${new Date().toLocaleString('es-AR')}`, 105, pageH - 8, { align: 'center' })

  doc.save(`Alta_Cargos_${expediente.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`)
}

// ── Historial agrupado por expediente ─────────────────────────────────────────
function HistorialAltas({
  search, setSearch, altas,
}: {
  search: string
  setSearch: (v: string) => void
  altas: AltaItem[]
}) {
  const [modalExp, setModalExp] = useState<string | null>(null)

  const grupos = altas.reduce<Record<string, AltaItem[]>>((acc, a) => {
    const key = a.expediente ?? '(sin expediente)'
    ;(acc[key] ??= []).push(a)
    return acc
  }, {})

  const gruposOrdenados = Object.entries(grupos).sort(
    ([, a], [, b]) => b[0]!.createdAt.localeCompare(a[0]!.createdAt)
  )

  const cargosModal = modalExp ? (grupos[modalExp] ?? []) : []

  return (
    <>
      {/* Modal de detalle + PDF */}
      {modalExp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="bg-navy px-6 py-4 rounded-t-xl flex items-start justify-between gap-4">
              <div>
                <p className="text-white/60 text-xs uppercase tracking-wider mb-0.5">Expediente / Decreto</p>
                <p className="text-white font-bold text-sm font-mono">{modalExp}</p>
              </div>
              <button onClick={() => setModalExp(null)} className="text-white/60 hover:text-white text-2xl leading-none mt-0.5">×</button>
            </div>

            <div className="px-6 py-4 border-b border-gray-100 grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Fecha de registro</p>
                <p className="font-medium text-gray-800">{cargosModal[0]?.createdAt.slice(0, 10) ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Vigente desde</p>
                <p className="font-medium text-gray-800">{cargosModal[0]?.fechaDesde ? cargosModal[0].fechaDesde.slice(0, 10) : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Registrado por</p>
                <p className="font-medium text-gray-800">{cargosModal[0]?.createdBy?.username ?? '—'}</p>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">N°</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Código</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Hospital</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Escalafón</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Puesto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cargosModal.map((c, i) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-gray-800">{c.codigo ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{c.hospital.sigla} — {c.hospital.nombre}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{c.escalafon.nombre}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{c.literalPuesto ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-400">{cargosModal.length} cargo{cargosModal.length !== 1 ? 's' : ''}</p>
              <div className="flex gap-3">
                <button onClick={() => setModalExp(null)} className="btn-outline">Cerrar</button>
                <button onClick={() => generarPDF(modalExp, cargosModal)} className="btn-primary">
                  Descargar PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Buscador */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <h2 className="font-primary text-base font-bold text-gray-700">Historial de altas</h2>
        <input type="text" placeholder="Buscar por expediente..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="h-10 px-3 border border-gray-300 rounded w-full focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
      </div>

      {/* Tabla agrupada */}
      {gruposOrdenados.length > 0 ? (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-navy text-white text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Expediente</th>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Hospital</th>
                <th className="px-4 py-3 font-semibold">Escalafón</th>
                <th className="px-4 py-3 font-semibold">Puesto</th>
                <th className="px-4 py-3 font-semibold">Desde</th>
                <th className="px-4 py-3 font-semibold">Registrado por</th>
                <th className="px-4 py-3 font-semibold text-center">Cargos</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {gruposOrdenados.map(([exp, items]) => {
                const primero = items[0]!
                const hospitales = [...new Set(items.map((i) => i.hospital.sigla))].join(', ')
                const escalafones = [...new Set(items.map((i) => i.escalafon.nombre))].join(', ')
                const puestos = [...new Set(items.map((i) => i.literalPuesto ?? '—'))].join(', ')
                return (
                  <tr key={exp} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-secondary max-w-[200px] truncate" title={exp}>{exp}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{primero.createdAt.slice(0, 10)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{hospitales}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{escalafones}</td>
                    <td className="px-4 py-3 text-gray-800 text-xs max-w-[180px] truncate" title={puestos}>{puestos}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{primero.fechaDesde ? primero.fechaDesde.slice(0, 10) : '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{primero.createdBy?.username ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-secondary/10 text-secondary text-xs font-bold">{items.length}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setModalExp(exp)} className="btn-outline text-xs px-3 py-1">Ver</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-sm text-gray-400">
          No hay altas registradas{search ? ` para "${search}"` : ''}.
        </div>
      )}
    </>
  )
}
