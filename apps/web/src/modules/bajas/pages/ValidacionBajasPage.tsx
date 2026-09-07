import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'

interface UltimaOcupacion {
  id: string
  hasta: string | null
  persona: { id: string; apellidoNombre: string; cuil: string } | null
}

interface BajaManual {
  id: string
  estado: string
  fechaBaja: string | null
  motivo: string | null
  tipoBaja: string | null
}

type Origen = 'padron' | 'baja_sial' | 'baja_manual' | 'ambos' | 'desconocido'

interface CargoValidacion {
  id: string
  codigo: string | null
  literalPuesto: string | null
  estadoDesde: string | null
  diasEnValidacion: number | null
  motivoBaja: string | null
  origen: Origen
  bajaManual: BajaManual | null
  enPadronPendiente: boolean
  enSial: boolean
  tienePersonaActiva: boolean
  sialFecha: string | null
  hospital: { sigla: string; nombre: string }
  escalafon: { nombre: string }
  ultimaOcupacion: UltimaOcupacion | null
}

interface CargoHistorico {
  id: string
  codigo: string | null
  literalPuesto: string | null
  estadoDesde: string | null
  motivoBaja: string | null
  enSial: boolean
  expediente: string | null
  hospital: { sigla: string; nombre: string }
  escalafon: { nombre: string }
  ultimaOcupacion: UltimaOcupacion | null
}

interface CargoSoloBaja {
  cuil: string
  apellidoNombre: string
  motivoBaja: string | null
  idSialRol: string
  hospitalSigla: string
  literalPuesto: string | null
  escalafon: string | null
  cargoSial: string
  cargoId: string | null
  cargoEstado: string | null
  cargoCodigo: string | null
  sialFecha: string
  padronFecha: string
}

type SubTab = 'todos' | 'triangulados' | 'solo_padron' | 'solo_baja' | 'historico'

function OrigenBadge({ origen }: { origen: Origen }) {
  if (origen === 'ambos') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">
      ⚡ Padrón + SIAL
    </span>
  )
  if (origen === 'padron') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
      📋 Padrón
    </span>
  )
  if (origen === 'baja_sial') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-700 border border-teal-200">
      🗂 SIAL
    </span>
  )
  if (origen === 'baja_manual') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200">
      ✍ Manual
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
      ? Sin origen
    </span>
  )
}

function EstadoBadge({ estado }: { estado: string | null }) {
  if (!estado) return <span className="text-gray-300 text-xs">—</span>
  const map: Record<string, { label: string; cls: string }> = {
    vigente:             { label: 'Vigente',           cls: 'bg-green-100 text-green-700 border-green-200' },
    validacion_vacante:  { label: 'En validación',     cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    no_vigente:          { label: 'No vigente',        cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  }
  const s = map[estado] ?? { label: estado, cls: 'bg-gray-100 text-gray-500 border-gray-200' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${s.cls}`}>
      {s.label}
    </span>
  )
}

const PAGE_SIZE = 30

export function ValidacionBajasPage() {
  const queryClient = useQueryClient()
  const [confirmando, setConfirmando] = useState<CargoValidacion | null>(null)
  const [confirmandoSoloBaja, setConfirmandoSoloBaja] = useState<CargoSoloBaja | null>(null)
  const [acta, setActa] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [escalafon, setEscalafon] = useState('')
  const [subTab, setSubTab] = useState<SubTab>('todos')
  const [page, setPage] = useState(1)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['validacion-bajas'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CargoValidacion[] }>('/api/v1/bajas/validacion')
      return res.data.data
    },
  })

  const { data: historico, isLoading: loadingHistorico } = useQuery({
    queryKey: ['validacion-bajas-historico'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CargoHistorico[] }>('/api/v1/bajas/validacion/historico')
      return res.data.data
    },
    enabled: subTab === 'historico',
  })

  const { data: soloBaja, isLoading: loadingSoloBaja } = useQuery({
    queryKey: ['validacion-solo-baja'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CargoSoloBaja[] }>('/api/v1/bajas/validacion/solo-baja')
      return res.data.data
    },
  })

  const confirmar = useMutation({
    mutationFn: async ({ cargoId, actaAdministrativa }: { cargoId: string; actaAdministrativa?: string }) =>
      apiClient.post(`/api/v1/bajas/validacion/${cargoId}/confirmar`, { actaAdministrativa }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['validacion-bajas'] })
      queryClient.invalidateQueries({ queryKey: ['validacion-solo-baja'] })
      queryClient.invalidateQueries({ queryKey: ['cargos'] })
      setConfirmando(null)
      setConfirmandoSoloBaja(null)
      setActa('')
    },
  })

  const todos        = data ?? []
  const triangulados = todos.filter((c) => c.origen === 'ambos')
  const soloPadron   = todos.filter((c) => c.origen === 'padron' || c.origen === 'baja_sial' || c.origen === 'desconocido')

  const sialFecha = todos.find((c) => c.sialFecha)?.sialFecha

  const counts: Record<SubTab, number | null> = {
    todos:        todos.length + (soloBaja?.length ?? 0),
    triangulados: triangulados.length,
    solo_padron:  soloPadron.length,
    solo_baja:    soloBaja?.length ?? null,
    historico:    historico?.length ?? null,
  }

  // Base activa (no histórico)
  const baseActiva = subTab === 'triangulados' ? triangulados
    : subTab === 'solo_padron' ? soloPadron
    : todos

  const q = busqueda.toLowerCase().trim()

  const filtradosActivos = (q || escalafon
    ? baseActiva.filter((c) =>
        (!escalafon || c.escalafon.nombre === escalafon) &&
        (!q || (
          c.codigo?.toLowerCase().includes(q) ||
          c.hospital.sigla.toLowerCase().includes(q) ||
          c.hospital.nombre.toLowerCase().includes(q) ||
          c.escalafon.nombre.toLowerCase().includes(q) ||
          c.literalPuesto?.toLowerCase().includes(q) ||
          c.ultimaOcupacion?.persona?.apellidoNombre.toLowerCase().includes(q) ||
          c.ultimaOcupacion?.persona?.cuil.includes(q)
        ))
      )
    : baseActiva)

  const filtradosHistorico = (q || escalafon) && historico
    ? historico.filter((c) =>
        (!escalafon || c.escalafon.nombre === escalafon) &&
        (!q || (
          c.codigo?.toLowerCase().includes(q) ||
          c.hospital.sigla.toLowerCase().includes(q) ||
          c.hospital.nombre.toLowerCase().includes(q) ||
          c.escalafon.nombre.toLowerCase().includes(q) ||
          c.literalPuesto?.toLowerCase().includes(q) ||
          c.ultimaOcupacion?.persona?.apellidoNombre.toLowerCase().includes(q) ||
          c.ultimaOcupacion?.persona?.cuil.includes(q)
        ))
      )
    : (historico ?? [])

  const filtradosSoloBaja = (q || escalafon) && soloBaja
    ? soloBaja.filter((c) =>
        (!escalafon || c.escalafon === escalafon) &&
        (!q || (
          c.apellidoNombre.toLowerCase().includes(q) ||
          c.cuil.includes(q) ||
          c.hospitalSigla.toLowerCase().includes(q) ||
          c.literalPuesto?.toLowerCase().includes(q) ||
          c.cargoSial.toLowerCase().includes(q)
        ))
      )
    : (soloBaja ?? [])

  // En tab 'todos' cada tabla pagina su propio array independientemente
  const filtrados = subTab === 'historico' ? filtradosHistorico
    : subTab === 'solo_baja' ? filtradosSoloBaja
    : filtradosActivos
  const totalPages = Math.ceil(filtrados.length / PAGE_SIZE)
  const pagina = filtrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  // Normalizar ambos tipos a una estructura común para la tabla unificada
  interface FilaUnificada {
    key: string
    codigo: string | null
    apellidoNombre: string | null
    hospitalSigla: string
    escalafon: string
    puesto: string | null
    origen: Origen | 'solo_sial'
    motivoBaja: string | null
    estadoDesde: string | null
    // para acciones
    _tipo: 'validacion' | 'solo_baja'
    _raw: CargoValidacion | CargoSoloBaja
  }

  const filasValidacion: FilaUnificada[] = filtradosActivos.map((c) => ({
    key: c.id,
    codigo: c.codigo,
    apellidoNombre: c.ultimaOcupacion?.persona?.apellidoNombre ?? null,
    hospitalSigla: c.hospital.sigla,
    escalafon: c.escalafon.nombre,
    puesto: c.literalPuesto,
    origen: c.origen,
    motivoBaja: c.motivoBaja,
    estadoDesde: c.estadoDesde,
    _tipo: 'validacion',
    _raw: c,
  }))

  const filasSoloBaja: FilaUnificada[] = filtradosSoloBaja.map((c, i) => ({
    key: `sial-${i}`,
    codigo: c.cargoCodigo ?? c.cargoSial,
    apellidoNombre: c.apellidoNombre,
    hospitalSigla: c.hospitalSigla,
    escalafon: c.escalafon ?? '—',
    puesto: c.literalPuesto,
    origen: 'solo_sial',
    motivoBaja: c.motivoBaja,
    estadoDesde: null,
    _tipo: 'solo_baja',
    _raw: c,
  }))

  const filasUnificadas = subTab === 'todos' ? [...filasValidacion, ...filasSoloBaja] : []
  const totalPagesUnificado = Math.ceil(filasUnificadas.length / PAGE_SIZE)
  const paginaUnificada = filasUnificadas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const SUBTABS: { key: SubTab; label: string }[] = [
    { key: 'todos',       label: 'Todos' },
    { key: 'triangulados',label: 'Triangulados ⚡' },
    { key: 'solo_padron', label: 'Solo padrón' },
    { key: 'solo_baja',   label: 'Solo baja SIAL ⚠' },
    { key: 'historico',   label: '📁 Histórico' },
  ]

  return (
    <div className="space-y-4">

      {/* Modal confirmar solo-baja */}
      {confirmandoSoloBaja && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4 space-y-4">
            <h3 className="font-bold text-gray-900">Confirmar baja SIAL</h3>
            <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
              <p><span className="text-gray-500">Persona:</span> <span className="font-medium">{confirmandoSoloBaja.apellidoNombre}</span></p>
              <p><span className="text-gray-500">CUIL:</span> <span className="font-mono">{confirmandoSoloBaja.cuil}</span></p>
              <p><span className="text-gray-500">Cargo:</span> <span className="font-mono font-bold">{confirmandoSoloBaja.cargoCodigo ?? confirmandoSoloBaja.cargoSial}</span></p>
              <p><span className="text-gray-500">Hospital:</span> {confirmandoSoloBaja.hospitalSigla}</p>
              <p><span className="text-gray-500">Motivo SIAL:</span> {confirmandoSoloBaja.motivoBaja ?? '—'}</p>
              <p className="mt-2 text-amber-700 text-xs font-semibold">
                ⚠ Este cargo aparece en el archivo de bajas SIAL pero sigue activo en el padrón.
              </p>
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
              <button className="btn-outline flex-1" onClick={() => { setConfirmandoSoloBaja(null); setActa('') }}>Cancelar</button>
              <button
                className="btn-primary flex-1"
                disabled={confirmar.isPending || !confirmandoSoloBaja.cargoId}
                onClick={() => confirmar.mutate({ cargoId: confirmandoSoloBaja.cargoId!, actaAdministrativa: acta || undefined })}
              >
                {confirmar.isPending ? 'Confirmando...' : 'Confirmar baja'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar */}
      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4 space-y-4">
            <h3 className="font-bold text-gray-900">Confirmar baja — no genera concurso</h3>
            <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
              <p><span className="text-gray-500">Cargo:</span> <span className="font-mono font-bold">{confirmando.codigo ?? '—'}</span></p>
              <p><span className="text-gray-500">Puesto:</span> {confirmando.literalPuesto ?? '—'}</p>
              <p><span className="text-gray-500">Hospital:</span> {confirmando.hospital.sigla}</p>
              {confirmando.ultimaOcupacion?.persona && (
                <p><span className="text-gray-500">Persona:</span> {confirmando.ultimaOcupacion.persona.apellidoNombre}</p>
              )}
              {confirmando.origen === 'ambos' && (
                <p className="mt-2 text-purple-700 text-xs font-semibold">
                  ⚡ Aparece tanto en el padrón semanal como en el archivo SIAL de bajas.
                </p>
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
              <button className="btn-outline flex-1" onClick={() => { setConfirmando(null); setActa('') }}>Cancelar</button>
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

      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-primary text-xl font-bold text-gray-900">Validación de Bajas</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Cargos en <span className="font-medium">validación vacante</span> — cruzados contra padrón semanal y archivo SIAL
              {sialFecha && <span className="ml-1 text-gray-400">({new Date(sialFecha).toLocaleDateString('es-AR')})</span>}
            </p>
          </div>

          {data && (
            <div className="flex gap-3 text-center shrink-0">
              <div className="px-3 py-1.5 rounded-lg bg-purple-50 border border-purple-200">
                <div className="text-lg font-bold text-purple-700">{triangulados.length}</div>
                <div className="text-xs text-purple-600">Triangulados</div>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200">
                <div className="text-lg font-bold text-blue-700">{soloPadron.length}</div>
                <div className="text-xs text-blue-600">Solo padrón</div>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
                <div className="text-lg font-bold text-amber-700">{soloBaja?.length ?? '…'}</div>
                <div className="text-xs text-amber-600">Solo SIAL</div>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
                <div className="text-lg font-bold text-gray-700">{todos.length + (soloBaja?.length ?? 0)}</div>
                <div className="text-xs text-gray-500">Total</div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 flex gap-3">
          <div className="relative w-72">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setPage(1) }}
              placeholder="Buscar por código, hospital, persona..."
              className="h-9 pl-9 pr-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy/30 w-full"
            />
          </div>
          <select
            value={escalafon}
            onChange={(e) => { setEscalafon(e.target.value); setPage(1) }}
            className="h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy/30 text-gray-700 bg-white"
          >
            <option value="">Todos los escalafones</option>
            <option value="CEETPS">CEETPS</option>
            <option value="Nueva Carrera Administrativa">Nueva Carrera Administrativa</option>
            <option value="Nueva Carrera Enfermería">Nueva Carrera Enfermería</option>
            <option value="Nueva Carrera Profesional Hospitalaria">Nueva Carrera Profesional Hospitalaria</option>
            <option value="Salud - Guardias">Salud - Guardias</option>
            <option value="Escalafón General">Escalafón General</option>
            <option value="Carrera Gerencial">Carrera Gerencial</option>
            <option value="Cuerpo Especialistas Profesionales">Cuerpo Especialistas Profesionales</option>
            <option value="Docentes">Docentes</option>
            <option value="Docentes Históricos">Docentes Históricos</option>
            <option value="Médicos">Médicos</option>
            <option value="Planta Transitoria">Planta Transitoria</option>
            <option value="Planta de Gabinete">Planta de Gabinete</option>
            <option value="Plantas Transitorias Acta 06/2014">Plantas Transitorias Acta 06/2014</option>
            <option value="Plantas Transitorias Modulo Operativo">Plantas Transitorias Modulo Operativo</option>
            <option value="Residentes">Residentes</option>
            <option value="Régimen Modular Extraordinario PG">Régimen Modular Extraordinario PG</option>
            <option value="Autoridades Superiores">Autoridades Superiores</option>
            <option value="Gabinete">Gabinete</option>
          </select>
          {(busqueda || escalafon) && (
            <button
              className="h-9 px-3 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg"
              onClick={() => { setBusqueda(''); setEscalafon(''); setPage(1) }}
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200 bg-white px-4">
        {SUBTABS.map((st) => (
          <button
            key={st.key}
            onClick={() => { setSubTab(st.key); setPage(1); setEscalafon('') }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              subTab === st.key
                ? 'border-primary text-gray-900 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {st.label}
            {counts[st.key] !== null && (
              <span className="ml-1.5 text-gray-400">({counts[st.key]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Leyendas */}
      {subTab === 'triangulados' && triangulados.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-purple-200 bg-purple-50 px-4 py-2.5 text-xs text-purple-700">
          <span className="mt-0.5 shrink-0">⚡</span>
          <span>
            Estos cargos aparecen <strong>tanto en el padrón semanal como en el archivo SIAL de bajas</strong>.
            La coincidencia en ambas fuentes confirma la baja.
          </span>
        </div>
      )}
      {subTab === 'solo_padron' && soloPadron.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-700">
          <span className="mt-0.5 shrink-0">📋</span>
          <span>
            Estos cargos aparecen en el <strong>padrón semanal</strong> pero <strong>no en el archivo SIAL de bajas</strong>.
            Revisá si la baja es real antes de confirmar.
          </span>
        </div>
      )}
      {subTab === 'solo_baja' && (soloBaja?.length ?? 0) > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <span className="mt-0.5 shrink-0">⚠</span>
          <span>
            Estas personas aparecen en el <strong>archivo de bajas SIAL</strong> pero su cargo sigue <strong>activo en el padrón</strong>.
            Son bajas que SIAL registró pero que todavía no se reflejaron en el padrón semanal.
            {soloBaja?.[0]?.sialFecha && <span className="ml-1">(SIAL: {new Date(soloBaja[0].sialFecha).toLocaleDateString('es-AR')} — Padrón: {new Date(soloBaja[0].padronFecha).toLocaleDateString('es-AR')})</span>}
          </span>
        </div>
      )}
      {subTab === 'historico' && (
        <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-600">
          <span className="mt-0.5 shrink-0">📁</span>
          <span>
            Cargos <strong>no vigentes</strong> que pasaron por el proceso de validación de bajas. Últimos 200 registros.
          </span>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {(isLoading || (subTab === 'historico' && loadingHistorico) || (subTab === 'solo_baja' && loadingSoloBaja)) && (
          <p className="p-6 text-sm text-gray-400">Cargando...</p>
        )}
        {isError && <p className="p-6 text-sm text-danger">No se pudo cargar el listado.</p>}

        {!isLoading && !isError && filtrados.length === 0 && !(subTab === 'todos' && (soloBaja?.length ?? 0) > 0) && (
          <p className="p-8 text-center text-sm text-gray-400">
            {busqueda ? `Sin resultados para "${busqueda}"` : 'No hay cargos en esta categoría.'}
          </p>
        )}

        {/* Tabla unificada — tab todos */}
        {subTab === 'todos' && !isLoading && !isError && filasUnificadas.length > 0 && (
          <>
            <table className="w-full text-sm">
              <thead className="bg-navy text-white text-left sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 font-semibold">Código</th>
                  <th className="px-4 py-3 font-semibold">Hospital</th>
                  <th className="px-4 py-3 font-semibold">Escalafón</th>
                  <th className="px-4 py-3 font-semibold">Puesto</th>
                  <th className="px-4 py-3 font-semibold">Persona</th>
                  <th className="px-4 py-3 font-semibold">Origen</th>
                  <th className="px-4 py-3 font-semibold">Motivo SIAL</th>
                  <th className="px-4 py-3 font-semibold">Desde</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginaUnificada.map((f) => {
                  const esValidacion = f._tipo === 'validacion'
                  const raw = f._raw
                  return (
                    <tr key={f.key} className={`hover:bg-gray-50 ${
                      f.origen === 'ambos' ? 'bg-purple-50/40' :
                      f.origen === 'solo_sial' ? 'bg-amber-50/30' : ''
                    }`}>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-gray-800">{f.codigo ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{f.hospitalSigla}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{f.escalafon}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate" title={f.puesto ?? undefined}>{f.puesto ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{f.apellidoNombre ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3">
                        {f.origen === 'solo_sial'
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">⚠ Solo SIAL</span>
                          : <OrigenBadge origen={f.origen as Origen} />}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 max-w-[160px] truncate" title={f.motivoBaja ?? undefined}>
                        {f.motivoBaja ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {f.estadoDesde ? new Date(f.estadoDesde).toLocaleDateString('es-AR') : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {esValidacion
                          ? <button className="btn-primary text-xs px-3 py-1" onClick={() => { setConfirmando(raw as CargoValidacion); setActa('') }}>Confirmar baja</button>
                          : (() => { const sb = raw as CargoSoloBaja; return sb.cargoId && sb.cargoEstado !== 'no_vigente'
                              ? <button className="btn-primary text-xs px-3 py-1" onClick={() => { setConfirmandoSoloBaja(sb); setActa('') }}>Dar de baja</button>
                              : <span className="text-xs text-gray-300">{sb.cargoId ? 'Ya dado de baja' : 'Sin cargo'}</span>
                          })()
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {totalPagesUnificado > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                <span>Página {page} de {totalPagesUnificado} — {filasUnificadas.length} en total</span>
                <div className="flex gap-2">
                  <button className="btn-outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
                  <button className="btn-outline" disabled={page >= totalPagesUnificado} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Tabla validación — tabs triangulados / solo_padron */}
        {!isLoading && !isError && filtrados.length > 0 && (subTab === 'triangulados' || subTab === 'solo_padron') && (
          <>
            <table className="w-full text-sm">
              <thead className="bg-navy text-white text-left sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 font-semibold">Código</th>
                  <th className="px-4 py-3 font-semibold">Hospital</th>
                  <th className="px-4 py-3 font-semibold">Escalafón</th>
                  <th className="px-4 py-3 font-semibold">Puesto</th>
                  <th className="px-4 py-3 font-semibold">Última persona</th>
                  <th className="px-4 py-3 font-semibold">Origen</th>
                  <th className="px-4 py-3 font-semibold">Motivo SIAL</th>
                  <th className="px-4 py-3 font-semibold">Desde</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(pagina as CargoValidacion[]).map((c) => (
                  <tr key={c.id} className={`hover:bg-gray-50 ${c.origen === 'ambos' ? 'bg-purple-50/40' : ''}`}>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-gray-800">{c.codigo ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{c.hospital.sigla}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{c.escalafon.nombre}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate" title={c.literalPuesto ?? undefined}>{c.literalPuesto ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.ultimaOcupacion?.persona
                        ? <span>{c.ultimaOcupacion.persona.apellidoNombre} <span className="text-gray-400 text-xs">({c.ultimaOcupacion.persona.cuil})</span></span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3"><OrigenBadge origen={c.origen} /></td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[160px] truncate" title={c.motivoBaja ?? undefined}>
                      {c.motivoBaja ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {c.estadoDesde ? new Date(c.estadoDesde).toLocaleDateString('es-AR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="btn-primary text-xs px-3 py-1" onClick={() => { setConfirmando(c); setActa('') }}>Confirmar baja</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                <span>Página {page} de {totalPages} — {filtrados.length} en total</span>
                <div className="flex gap-2">
                  <button className="btn-outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
                  <button className="btn-outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Tabla solo baja SIAL */}
        {subTab === 'solo_baja' && !loadingSoloBaja && filtrados.length > 0 && (
          <>
            <table className="w-full text-sm">
              <thead className="bg-navy text-white text-left sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 font-semibold">Apellido y Nombre</th>
                  <th className="px-4 py-3 font-semibold">Hospital</th>
                  <th className="px-4 py-3 font-semibold">Escalafón</th>
                  <th className="px-4 py-3 font-semibold">Puesto</th>
                  <th className="px-4 py-3 font-semibold">Cargo SIAL</th>
                  <th className="px-4 py-3 font-semibold">Motivo baja</th>
                  <th className="px-4 py-3 font-semibold">Código cargo</th>
                  <th className="px-4 py-3 font-semibold">Estado cargo</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(pagina as CargoSoloBaja[]).map((c, i) => (
                  <tr key={i} className="hover:bg-gray-50 bg-amber-50/30">
                    <td className="px-4 py-3 font-medium text-gray-800">{c.apellidoNombre}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{c.hospitalSigla}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{c.escalafon ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate" title={c.literalPuesto ?? undefined}>{c.literalPuesto ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.cargoSial}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{c.motivoBaja ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-gray-800">{c.cargoCodigo ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3"><EstadoBadge estado={c.cargoEstado} /></td>
                    <td className="px-4 py-3 text-right">
                      {c.cargoId && c.cargoEstado !== 'no_vigente'
                        ? <button className="btn-primary text-xs px-3 py-1" onClick={() => { setConfirmandoSoloBaja(c); setActa('') }}>Dar de baja</button>
                        : <span className="text-xs text-gray-300">{c.cargoId ? 'Ya dado de baja' : 'Sin cargo'}</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                <span>Página {page} de {totalPages} — {filtrados.length} en total</span>
                <div className="flex gap-2">
                  <button className="btn-outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
                  <button className="btn-outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
                </div>
              </div>
            )}
          </>
        )}

        {subTab === 'historico' && !loadingHistorico && filtrados.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-navy text-white text-left sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 font-semibold">Código</th>
                <th className="px-4 py-3 font-semibold">Hospital</th>
                <th className="px-4 py-3 font-semibold">Escalafón</th>
                <th className="px-4 py-3 font-semibold">Puesto</th>
                <th className="px-4 py-3 font-semibold">Última persona</th>
                <th className="px-4 py-3 font-semibold">SIAL</th>
                <th className="px-4 py-3 font-semibold">Motivo</th>
                <th className="px-4 py-3 font-semibold">Confirmado</th>
                <th className="px-4 py-3 font-semibold">Acto adm.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(pagina as CargoHistorico[]).map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-gray-800">{c.codigo ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{c.hospital.sigla}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{c.escalafon.nombre}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate" title={c.literalPuesto ?? undefined}>{c.literalPuesto ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.ultimaOcupacion?.persona
                      ? <span>{c.ultimaOcupacion.persona.apellidoNombre} <span className="text-gray-400 text-xs">({c.ultimaOcupacion.persona.cuil})</span></span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {c.enSial
                      ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-700 border border-teal-200">✓ SIAL</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 max-w-[160px] truncate" title={c.motivoBaja ?? undefined}>
                    {c.motivoBaja ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {c.estadoDesde ? new Date(c.estadoDesde).toLocaleDateString('es-AR') : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                    {c.expediente ?? <span className="text-gray-300">—</span>}
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
