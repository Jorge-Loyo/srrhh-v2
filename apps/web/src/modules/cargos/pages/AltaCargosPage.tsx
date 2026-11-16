import { Fragment, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { SolicitudAlta, SolicitudAltaEstado, PuestoCatalogoEspecialidad, Etiqueta, PersonaListItem } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'
import { useHospitales, useEscalafonesPorTipoAlta, usePuestosCargoNormalizados, useEspecialidadesDePuestoId } from '@/shared/hooks/useCatalogos'
import { hospitalLabel } from '@/shared/lib/hospitalLabel'
import { capitalizar } from '@/shared/lib/utils'
import { SelectorCarreraPuestoEspecialidad } from '@/shared/components/selectores/SelectorCarreraPuestoEspecialidad'
import { opcionesCarreraAlta, filtrarPuestosAlta, pideIncluirAmbosAlta } from '../lib/carrerasGestionadas'
import type { TipoAltaCarrera } from '../lib/carrerasGestionadas'
import { resolverSeleccionAlta } from '../lib/altaSelector'
import { especialidadesPermitidasAlta } from '../lib/especialidadesAlta'
import { useEtiquetas } from '@/shared/hooks/useEtiquetas'
import { useSolicitudesAlta, useCreateSolicitudesAltaBatch, descargarPdfGrupo, useValidarSolicitudAlta } from '../hooks/useSolicitudesAlta'
import { EtiquetasChips } from '@/shared/components/EtiquetaChip'
import { filasPorCargo, solicitudMatcheaEtiqueta, etiquetasDeSolicitudes } from '../lib/historicoCargos'
import { agruparPorExpediente, type EstadoGrupo, type GrupoExpediente } from '../lib/agruparPorExpediente'
import { useHospitalesPou, usePouCargas } from '@/modules/pou/hooks/usePou'
import { useSiglasOrganigrama, useOrganigrama, aplanarArbol, type NodoPlano } from '@/modules/organigrama/hooks/useOrganigrama'
import { getApiErrorMessage } from '@/shared/lib/utils'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type TipoAlta = 'pof' | 'pou' | 'estructura' | 'pou_a_pof' | 'editar_estructura' | 'mod_pou'

const TIPO_LABEL: Record<TipoAlta, string> = {
  pof:               'Ejecución POF',
  pou:               'Ejecución POU',
  estructura:        'Estructura',
  pou_a_pof:         'POU a POF',
  editar_estructura: 'Editar Estructura',
  mod_pou:           'Modificación de la POU',
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

// Estado AGREGADO del grupo (expediente) para la vista Cargos Históricos.
// "parcial" (mezcla de estados) se muestra en ámbar; el resto reusa el mismo
// color/label que las solicitudes individuales.
const ESTADO_GRUPO_LABEL: Record<EstadoGrupo, string> = {
  pendiente: 'Pendiente',
  aprobada:  'Aprobado',
  rechazada: 'Rechazado',
  parcial:   'Parcial',
}

const ESTADO_GRUPO_BADGE: Record<EstadoGrupo, string> = {
  pendiente: 'badge-warning',
  aprobada:  'badge-success',
  rechazada: 'badge-danger',
  parcial:   'bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium',
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
  puestoCargoId: string
  puesto: string
  especialidadPuestoId?: string
  especialidad: string
  unificadorPuesto: string
  agrupador?: string
  expediente: string
  desde: string
  cantidad: number
  etiqueta: string
  // Estructura: nodo del organigrama donde se ubica el nuevo cargo
  nodoOrgId?: string
  nodoOrgPath?: string
  nodoOrgSigla?: string
  // POU a POF: cargo POU origen
  cargoOrigenId?: string
  cargoOrigenCodigo?: string
  cargoOrigenOcupado?: boolean
  cargoOrigenPersona?: string
  // Operación sobre la norma POU (Modificación de la POU). Viaja en el marcador de
  // `observaciones` para que "eliminar", "modificar" y "pasar a POF" no queden
  // indistinguibles. Sin valor = pasar POU a POF.
  operacionPou?: 'modificar' | 'eliminar'
}

// Marcador que acompaña al cargo POU origen en `observaciones`.
function marcadorCargoPou(item: Pick<ItemPendiente, 'cargoOrigenId' | 'operacionPou'>): string {
  return `${item.operacionPou ? `pou_${item.operacionPou}` : 'pou_a_pof'}:${item.cargoOrigenId}`
}

// ── Selector de etiqueta ─────────────────────────────────────────────────────
// Permite ELEGIR una etiqueta ya creada (chips del catálogo) o escribir una
// nueva. El valor emitido es el nombre (string) — el backend crea la etiqueta
// si no existe y la vincula al crear la solicitud (mismo catálogo que CPH).
function EtiquetaPicker({ value, onChange, catalogo }: {
  value: string
  onChange: (v: string) => void
  catalogo: Etiqueta[]
}) {
  const [abierto, setAbierto] = useState(false)
  const q = value.trim().toLowerCase()
  const filtradas = q ? catalogo.filter((e) => e.nombre.toLowerCase().includes(q)) : catalogo
  const existeExacta = !!q && catalogo.some((e) => e.nombre.toLowerCase() === q)

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Elegí o creá una"
        maxLength={100}
        className="h-10 input w-full font-bold"
      />
      {abierto && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {filtradas.length === 0 && !q && (
            <p className="px-3 py-2 text-xs text-gray-400">No hay etiquetas. Escribí para crear una.</p>
          )}
          {filtradas.map((e) => (
            <button
              key={e.id}
              type="button"
              onMouseDown={() => { onChange(e.nombre); setAbierto(false) }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-secondary/10"
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: e.color ?? '#4b5563' }} />
              <span className={e.nombre.toLowerCase() === value.toLowerCase() ? 'font-medium text-secondary' : 'text-gray-700'}>
                {e.nombre}
              </span>
            </button>
          ))}
          {q && !existeExacta && (
            <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
              Se creará la etiqueta <span className="font-bold text-secondary">"{value.trim()}"</span> al enviar
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Banner informativo del nodo de organigrama (Estructura) ────────────────
// Se muestra cuando el usuario elige "Estructura". Permite elegir la sigla
// (hospital o sección) y luego el nodo del árbol donde se ubicará el cargo.
const SECCIONES_FIJAS = [
  { sigla: 'nivel-central',     nombre: 'Nivel Central'     },
  { sigla: 'atencion-primaria', nombre: 'Atención Primaria' },
]

// Helpers para navegar el árbol de organigrama
function buscarPadreEnArbol(nodo: import('@/modules/organigrama/hooks/useOrganigrama').OrganigramaNodo, targetId: string): string | null {
  for (const hijo of nodo.hijos) {
    if (hijo.id === targetId) return nodo.id
    const found = buscarPadreEnArbol(hijo, targetId)
    if (found) return found
  }
  return null
}

function buscarHijosEnArbol(
  nodo: import('@/modules/organigrama/hooks/useOrganigrama').OrganigramaNodo,
  targetId: string,
): { id: string; nombre: string; tipo: string }[] {
  if (nodo.id === targetId) {
    return nodo.hijos.map((h) => ({ id: h.id, nombre: h.nombre ?? h.id, tipo: h.tipo }))
  }
  for (const hijo of nodo.hijos) {
    const found = buscarHijosEnArbol(hijo, targetId)
    if (found.length > 0 || hijo.id === targetId) return found
  }
  return []
}

// Vista en cascada: padre → nodo seleccionado → hijos directos
function NodoCascada({
  nodoPadre,
  nodoSeleccionado,
  hijosDirectos,
  onCambiar,
  labelNodo = 'Nodo seleccionado',
  colorScheme = 'violet',
}: {
  nodoPadre: NodoPlano | null | undefined
  nodoSeleccionado: NodoPlano | null | undefined
  hijosDirectos: { id: string; nombre: string; tipo: string }[]
  onCambiar: () => void
  labelNodo?: string
  colorScheme?: 'violet' | 'indigo'
}) {
  const ring = colorScheme === 'violet' ? 'border-violet-400 bg-violet-50' : 'border-indigo-400 bg-indigo-50'
  const text = colorScheme === 'violet' ? 'text-violet-800' : 'text-indigo-800'
  const badge = colorScheme === 'violet' ? 'bg-violet-100 text-violet-700' : 'bg-indigo-100 text-indigo-700'

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      {/* Padre */}
      {nodoPadre && (
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
          <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide w-16 shrink-0">Depende de</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">{nodoPadre.tipo}</span>
          <span className="text-xs text-gray-600 truncate">{nodoPadre.nombre}</span>
        </div>
      )}
      {/* Nodo seleccionado */}
      <div className={`flex items-center justify-between gap-2 px-3 py-2.5 border-2 ${ring}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 w-16 shrink-0">{labelNodo}</span>
          {nodoSeleccionado && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badge}`}>{nodoSeleccionado.tipo}</span>
          )}
          <span className={`text-xs font-bold truncate ${text}`}>{nodoSeleccionado?.nombre ?? '—'}</span>
        </div>
        <button type="button" onClick={onCambiar}
          className="text-xs text-gray-400 hover:text-red-500 shrink-0 underline">Cambiar</button>
      </div>
      {/* Hijos directos */}
      {hijosDirectos.length > 0 && (
        <div className="border-t border-gray-100">
          <p className="px-3 pt-1.5 pb-0.5 text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Dependen de este nodo</p>
          <div className="divide-y divide-gray-50">
            {hijosDirectos.slice(0, 5).map((h) => (
              <div key={h.id} className="flex items-center gap-2 px-3 py-1.5">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{h.tipo}</span>
                <span className="text-xs text-gray-500 truncate">{h.nombre}</span>
              </div>
            ))}
            {hijosDirectos.length > 5 && (
              <p className="px-3 py-1.5 text-[10px] text-gray-400">...y {hijosDirectos.length - 5} más</p>
            )}
          </div>
        </div>
      )}
      {hijosDirectos.length === 0 && nodoSeleccionado && (
        <div className="px-3 py-1.5 border-t border-gray-100">
          <p className="text-[10px] text-gray-400">Sin dependientes directos</p>
        </div>
      )}
    </div>
  )
}

function BannerNodoOrganigrama({ value, onChange }: {
  value: { sigla: string; nodoId: string; nodoPath: string } | null
  onChange: (v: { sigla: string; nodoId: string; nodoPath: string } | null) => void
}) {
  const [siglaElegida, setSiglaElegida] = useState('')
  const [busquedaSigla, setBusquedaSigla] = useState('')
  const [busquedaNodo,  setBusquedaNodo]  = useState('')
  const { data: siglas = [] } = useSiglasOrganigrama()

  const esSeccion = SECCIONES_FIJAS.some((s) => s.sigla === siglaElegida)
  const orgParams = siglaElegida
    ? esSeccion
      ? { seccion: siglaElegida as 'nivel-central' | 'atencion-primaria' }
      : { sigla: siglaElegida }
    : null
  const { data: arbol, isLoading: cargandoArbol } = useOrganigrama(orgParams)

  const nodosPlanos: NodoPlano[] = arbol ? aplanarArbol(arbol) : []
  const q = busquedaNodo.trim().toLowerCase()
  const nodosFiltrados = q
    ? nodosPlanos.filter((n) => n.nombre.toLowerCase().includes(q) || n.path.toLowerCase().includes(q))
    : nodosPlanos

  const siglasFiltradas = busquedaSigla.trim()
    ? siglas.filter((s) => s.nombre.toLowerCase().includes(busquedaSigla.toLowerCase()) || s.sigla.toLowerCase().includes(busquedaSigla.toLowerCase()))
    : siglas

  // Cascada: nodo padre, nodo seleccionado, hijos directos
  const nodoSeleccionado = value ? nodosPlanos.find((n) => n.id === value.nodoId) : null
  const nodoPadre = nodoSeleccionado
    ? nodosPlanos.find((n) => arbol && buscarPadreEnArbol(arbol, nodoSeleccionado.id) === n.id)
    : null
  const hijosDirectos = nodoSeleccionado && arbol
    ? buscarHijosEnArbol(arbol, nodoSeleccionado.id)
    : []

  function elegirSigla(sigla: string) {
    setSiglaElegida(sigla)
    setBusquedaNodo('')
    onChange(null)
  }

  function elegirNodo(nodo: NodoPlano) {
    onChange({ sigla: siglaElegida, nodoId: nodo.id, nodoPath: nodo.path })
    setBusquedaNodo('')
  }

  return (
    <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none mt-0.5">🏗️</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-violet-900">Ubicación en el organigrama</p>
          <p className="text-xs text-violet-700 mt-0.5">
            Elegí la sigla y el nodo del organigrama donde se ubicará el nuevo cargo de estructura.
          </p>
        </div>
        <a href="/organigrama" target="_blank" rel="noopener noreferrer"
          className="text-xs px-3 py-1.5 rounded border border-violet-300 bg-white text-violet-700 hover:bg-violet-100 font-medium transition-colors whitespace-nowrap">
          Ver organigrama →
        </a>
      </div>

      {/* Selector de sigla */}
      {!siglaElegida ? (
        <div className="space-y-2">
          <input
            type="text" value={busquedaSigla}
            onChange={(e) => setBusquedaSigla(e.target.value)}
            placeholder="Buscar sigla u hospital..."
            className="h-9 input w-full text-sm"
          />
          <div className="max-h-48 overflow-y-auto rounded-lg border border-violet-100 bg-white divide-y divide-gray-50">
            {siglasFiltradas.map((s) => (
              <button key={s.sigla} type="button" onClick={() => elegirSigla(s.sigla)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-violet-50 transition-colors">
                <span className="font-mono text-xs font-bold text-violet-700 w-28 shrink-0">{s.esSeccion ? s.nombre : s.sigla}</span>
                {!s.esSeccion && <span className="text-sm text-gray-700 truncate">{s.nombre}</span>}
              </button>
            ))}
            {siglasFiltradas.length === 0 && <p className="px-3 py-4 text-xs text-gray-400 text-center">Sin resultados</p>}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Sigla elegida */}
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-violet-100 border border-violet-200">
            <span className="text-sm font-bold text-violet-900">
              {siglas.find((s) => s.sigla === siglaElegida)?.nombre ?? siglaElegida}
            </span>
            <button type="button" onClick={() => { setSiglaElegida(''); onChange(null) }}
              className="text-xs text-violet-500 hover:text-violet-700 underline">Cambiar</button>
          </div>

          {/* Nodo elegido con cascada */}
          {value ? (
            <div className="space-y-1">
              <NodoCascada
                nodoPadre={nodoPadre}
                nodoSeleccionado={nodoSeleccionado}
                hijosDirectos={hijosDirectos}
                onCambiar={() => onChange(null)}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <input
                type="text" value={busquedaNodo}
                onChange={(e) => setBusquedaNodo(e.target.value)}
                placeholder="Buscar nodo del organigrama..."
                className="h-9 input w-full text-sm"
                autoFocus
              />
              {cargandoArbol ? (
                <p className="text-xs text-gray-400 px-2 py-3">Cargando árbol...</p>
              ) : (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-violet-100 bg-white divide-y divide-gray-50">
                  {nodosFiltrados.map((n) => (
                    <button key={n.id} type="button" onClick={() => elegirNodo(n)}
                      className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-violet-50 transition-colors">
                      <span
                        className="mt-0.5 shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700"
                        style={{ marginLeft: `${Math.min(n.nivel, 6) * 8}px` }}
                      >{n.tipo}</span>
                      <span className="text-xs text-gray-700 truncate">{n.nombre}</span>
                    </button>
                  ))}
                  {nodosFiltrados.length === 0 && <p className="px-3 py-4 text-xs text-gray-400 text-center">Sin resultados</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Banner informativo de la norma POU ───────────────────────────────────────
// Se muestra cuando el usuario elige "Ejecución POU". Recuerda que crear un
// cargo POU equivale a editar la norma estructural de TODOS los hospitales, y
// permite ver la POU actual o subir una nueva versión antes de continuar.
function BannerNormaPou({ onVerPou, onEditarPou }: { onVerPou: () => void; onEditarPou: () => void }) {
  const { data: hospitales = [] } = useHospitalesPou()
  const { data: cargas = [] } = usePouCargas()
  const ultimaCarga = cargas[0] ?? null

  return (
    <div className="mb-4 rounded-lg border border-secondary/30 bg-secondary/5 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none mt-0.5">📋</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900">Estás editando la norma de estructura POU</p>
          <p className="text-xs text-gray-600 mt-0.5">
            Crear un cargo POU modifica la dotación estructural de <strong>todos los hospitales</strong>.
            El documento que se genera refleja cómo queda la POU completa tras esta edición.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="text-xs text-gray-700">
          <span className="font-semibold">{hospitales.length}</span> hospital{hospitales.length !== 1 ? 'es' : ''} con datos POU cargados
          {ultimaCarga && (
            <span className="ml-2 text-gray-500">
              · Última norma: <span className="font-mono">{ultimaCarga.archivo}</span>{' '}
              ({new Date(ultimaCarga.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })})
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={onVerPou} className="btn-outline text-xs px-3 py-1.5">
          Ver norma POU actual →
        </button>
        <button type="button" onClick={onEditarPou} className="btn-secondary text-xs px-3 py-1.5">
          Actualizar norma POU (subir Excel)
        </button>
      </div>
    </div>
  )
}

// ── Formulario POU a POF ────────────────────────────────────────────────────
// Permite seleccionar uno o más cargos POU vigentes y convertirlos a POF.
// Cada cargo seleccionado se agrega al panel de pendientes como un item.
function FormPouAPof({ onAgregar, onCancelar }: {
  onAgregar: (items: ItemPendiente[]) => void
  onCancelar: () => void
}) {
  const [modalAbierto, setModalAbierto] = useState(false)
  const [expediente, setExpediente] = useState('')
  const [expConfirmado, setExpConfirmado] = useState(false)
  const [expInput, setExpInput] = useState('')
  const [desde, setDesde] = useState('')
  const [etiqueta, setEtiqueta] = useState('')
  const [seleccionados, setSeleccionados] = useState<ItemPendiente[]>([])
  const { data: catalogoEtiquetas = [] } = useEtiquetas()

  function confirmarExp() {
    const v = expInput.trim()
    if (!v) return
    setExpediente(v)
    setExpConfirmado(true)
  }

  function agregarCargo(c: CargoPou) {
    // Evitar duplicados
    if (seleccionados.some((s) => s.cargoOrigenId === c.id)) return
    const item: ItemPendiente = {
      id:               crypto.randomUUID(),
      tipo:             'pou_a_pof',
      hospitalId:       c.hospitalId,
      hospitalSigla:    c.hospital?.sigla ?? c.hospitalId,
      escalafonId:      c.escalafonId ?? '',
      escalafon:        c.escalafon?.nombre ?? '',
      puestoCargoId:    c.puestoCargoId ?? '',
      puesto:           c.literalPuesto ?? '',
      especialidad:     c.especialidadPuesto?.nombre ?? c.especialidad ?? '',
      unificadorPuesto: 'POF',
      expediente,
      desde,
      cantidad:         1,
      etiqueta,
      cargoOrigenId:    c.id,
      cargoOrigenCodigo: c.codigo ?? undefined,
      cargoOrigenOcupado: c.ocupado ?? false,
      cargoOrigenPersona: c.personaOcupante?.apellidoNombre ?? undefined,
    }
    setSeleccionados((prev) => [...prev, item])
  }

  function quitarCargo(id: string) {
    setSeleccionados((prev) => prev.filter((s) => s.cargoOrigenId !== id))
  }

  function handleAgregar() {
    if (seleccionados.length === 0 || !expConfirmado || !desde) return
    // Actualizar expediente/desde/etiqueta en todos los seleccionados
    const items = seleccionados.map((s) => ({ ...s, expediente, desde, etiqueta }))
    onAgregar(items)
    setSeleccionados([])
    setExpConfirmado(false)
    setExpInput('')
    setExpediente('')
    setDesde('')
    setEtiqueta('')
  }

  const formCompleto = expConfirmado && !!desde && seleccionados.length > 0

  return (
    <>
      {modalAbierto && (
        <ModalBuscarCargoPou
          onSeleccionar={(c) => { agregarCargo(c); }}
          onCerrar={() => setModalAbierto(false)}
          yaSeleccionados={seleccionados.map((s) => s.cargoOrigenId!).filter(Boolean)}
        />
      )}
      <div className="border-t border-gray-100 pt-5 space-y-4">
        {/* Banner informativo */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 flex items-start gap-3">
          <span className="text-2xl leading-none mt-0.5">🔄</span>
          <div>
            <p className="text-sm font-bold text-gray-900">Conversión POU → POF</p>
            <p className="text-xs text-gray-600 mt-0.5">
              Seleccioná los cargos POU vigentes a convertir. Si el cargo está ocupado, pasa a POF con la persona. Si está vacante, va a concurso.
            </p>
          </div>
        </div>

        {/* Expediente */}
        {!expConfirmado ? (
          <div className="flex items-end gap-3 p-4 rounded-lg border-2 border-secondary/30 bg-secondary/5">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-secondary mb-1.5 uppercase tracking-wider">
                Expediente <span className="text-danger">*</span>
              </label>
              <input type="text" value={expInput} onChange={(e) => setExpInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmarExp()}
                placeholder="EX-2026-32260736-GCABA-DGAYDRH" className="h-10 input w-full" autoFocus />
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
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">Expediente confirmado</p>
                <p className="text-sm font-bold text-gray-800 mt-0.5">{expediente}</p>
              </div>
            </div>
            <button type="button" onClick={() => { setExpConfirmado(false); setExpInput(expediente) }}
              className="text-xs text-gray-400 hover:text-gray-600 underline">Cambiar</button>
          </div>
        )}

        <div className={`space-y-4 transition-opacity ${expConfirmado ? '' : 'opacity-40 pointer-events-none select-none'}`}>
          {/* Cargos seleccionados */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500">Cargos POU a convertir <span className="text-danger">*</span></label>
              <button type="button" onClick={() => setModalAbierto(true)}
                className="text-xs px-3 py-1.5 rounded border border-secondary text-secondary hover:bg-secondary/10 font-medium transition-colors">
                + Seleccionar cargo POU
              </button>
            </div>
            {seleccionados.length === 0 ? (
              <button type="button" onClick={() => setModalAbierto(true)}
                className="w-full h-12 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-400 hover:border-secondary hover:text-secondary transition-colors">
                + Seleccionar cargo POU
              </button>
            ) : (
              <div className="space-y-2">
                {seleccionados.map((s) => (
                  <div key={s.cargoOrigenId} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-gray-700">{s.cargoOrigenCodigo ?? '—'}</span>
                        <span className="text-xs text-gray-400">·</span>
                        <span className="text-xs font-medium text-gray-700">{s.hospitalSigla}</span>
                        {s.cargoOrigenOcupado ? (
                          <span className="badge-success">Ocupado</span>
                        ) : (
                          <span className="badge-amber">Vacante → concurso</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5 truncate">{s.puesto}{s.especialidad ? ` · ${s.especialidad}` : ''}</p>
                      {s.cargoOrigenPersona && <p className="text-xs text-gray-400 truncate">{s.cargoOrigenPersona}</p>}
                    </div>
                    <button type="button" onClick={() => quitarCargo(s.cargoOrigenId!)}
                      className="text-gray-300 hover:text-danger transition-colors text-lg leading-none flex-shrink-0">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Desde + Etiqueta + botones */}
          <div className="grid grid-cols-5 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Desde <span className="text-danger">*</span></label>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-10 input w-full" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Etiqueta</label>
              <EtiquetaPicker value={etiqueta} onChange={setEtiqueta} catalogo={catalogoEtiquetas} />
            </div>
            <div className="col-span-2 flex gap-2">
              <button type="button" onClick={onCancelar} className="btn-outline flex-1">Cancelar</button>
              <button type="button" onClick={handleAgregar} disabled={!formCompleto}
                className="btn-primary flex-1 disabled:opacity-40">
                + Agregar ({seleccionados.length})
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// Tipo liviano para el modal de búsqueda POU / Estructura
interface CargoPou {
  id: string
  codigo?: string | null
  hospitalId: string
  hospital?: { sigla: string } | null
  escalafonId?: string | null
  escalafon?: { nombre: string } | null
  puestoCargoId?: string | null
  literalPuesto?: string | null
  especialidad?: string | null
  especialidadPuesto?: { nombre: string } | null
  ocupado?: boolean | null
  personaOcupante?: { apellidoNombre: string } | null
  subEstado?: string | null
  estado?: string
}

// ── Modal de búsqueda de cargos POU vigentes ─────────────────────────────────
function ModalBuscarCargoPou({ onSeleccionar, onCerrar, yaSeleccionados, soloVacantes = false }: {
  onSeleccionar: (c: CargoPou) => void
  onCerrar: () => void
  yaSeleccionados: string[]
  soloVacantes?: boolean
}) {
  const [hospitalId, setHospitalId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const { data: hospitales = [] } = useHospitales()

  const activo = !!hospitalId || busqueda.length >= 2

  const { data, isLoading } = useQuery({
    queryKey: ['cargos-pou-modal', hospitalId, busqueda],
    enabled: activo,
    placeholderData: (prev: CargoPou[] | undefined) => prev,
    queryFn: async () => {
      const params: Record<string, string> = { limit: '50', estado: 'vigente' }
      params.unificadorPuesto = 'POU'
      if (soloVacantes) params.subEstado = 'vacante'
      if (hospitalId) params.hospitalId = hospitalId
      if (busqueda.length >= 2) params.search = busqueda
      const res = await apiClient.get<{ data: CargoPou[] }>('/api/v1/cargos', { params })
      return res.data.data
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-primary text-base font-bold text-gray-900">Seleccionar cargo POU</h2>
            <p className="text-xs text-gray-500 mt-0.5">Cargos POU vigentes{soloVacantes ? ' vacantes' : ''} — podés seleccionar varios</p>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-3 border-b border-gray-100 flex gap-3">
          <select value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} className="h-9 input text-sm flex-1">
            <option value="">Todas las siglas</option>
            {hospitales.map((h) => <option key={h.id} value={h.id}>{hospitalLabel(h)}</option>)}
          </select>
          <input autoFocus type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Código, puesto, especialidad..." className="h-9 input text-sm flex-1" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {!activo && <p className="p-6 text-sm text-gray-400 text-center">Seleccioná una sigla o escribí al menos 2 caracteres</p>}
          {activo && isLoading && <p className="p-6 text-sm text-gray-400 text-center">Buscando...</p>}
          {activo && !isLoading && (data?.length ?? 0) === 0 && <p className="p-6 text-sm text-gray-400 text-center">Sin resultados.</p>}
          {activo && !isLoading && (data?.length ?? 0) > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Código</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Sigla</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Puesto</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Especialidad</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Persona</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Estado</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.map((c) => {
                  const yaEsta = yaSeleccionados.includes(c.id)
                  const sub = c.subEstado ?? (c.ocupado ? 'ocupado' : 'vacante')
                  return (
                    <tr key={c.id} className={yaEsta ? 'bg-gray-100' : 'hover:bg-gray-50 cursor-pointer'}
                      onClick={() => !yaEsta && onSeleccionar(c)}>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-700">{c.codigo ?? '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">{c.hospital?.sigla ?? '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-800 max-w-[200px]">
                        <span className="font-medium leading-tight line-clamp-2">{c.literalPuesto ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">
                        {c.especialidadPuesto?.nombre ?? c.especialidad ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">
                        {c.personaOcupante?.apellidoNombre ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={sub === 'ocupado' ? 'badge-success' : sub === 'concurso' ? 'badge-info' : 'badge-warning'}>
                          {sub === 'ocupado' ? 'Ocupado' : sub === 'concurso' ? 'Concurso' : 'Vacante'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {yaEsta
                          ? <span className="badge-amber">✓ Agregado</span>
                          : <span className="text-xs text-secondary font-medium">Seleccionar</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onCerrar} className="btn-primary">Listo</button>
        </div>
      </div>
    </div>
  )
}

// ── Formulario Editar Estructura ────────────────────────────────────────────────────
// Selecciona un cargo de estructura existente, lo da de baja y crea uno nuevo
// en el nodo destino del organigrama. Si tiene persona, pasa al nuevo cargo.
// Si está vacante, va a concurso.
function FormEditarEstructura({ onAgregar, onCancelar }: {
  onAgregar: (item: ItemPendiente | ItemPendiente[]) => void
  onCancelar: () => void
}) {
  const [modalAbierto, setModalAbierto] = useState(false)
  const [cargoOrigen, setCargoOrigen] = useState<CargoPou | null>(null)
  const [expInput, setExpInput] = useState('')
  const [expConfirmado, setExpConfirmado] = useState(false)
  const [expediente, setExpediente] = useState('')
  const [desde, setDesde] = useState('')
  const [etiqueta, setEtiqueta] = useState('')
  const [nodoOrg, setNodoOrg] = useState<{ sigla: string; nodoId: string; nodoPath: string } | null>(null)
  const { data: catalogoEtiquetas = [] } = useEtiquetas()

  function confirmarExp() {
    const v = expInput.trim()
    if (!v) return
    setExpediente(v)
    setExpConfirmado(true)
  }

  function seleccionarCargo(c: CargoPou) {
    setCargoOrigen(c)
    setModalAbierto(false)
  }

  function handleAgregar() {
    if (!cargoOrigen || !expConfirmado || !desde || !nodoOrg) return
    const item: ItemPendiente = {
      id:               crypto.randomUUID(),
      tipo:             'editar_estructura',
      hospitalId:       cargoOrigen.hospitalId,
      hospitalSigla:    cargoOrigen.hospital?.sigla ?? cargoOrigen.hospitalId,
      escalafonId:      cargoOrigen.escalafonId ?? '',
      escalafon:        cargoOrigen.escalafon?.nombre ?? '',
      puestoCargoId:    cargoOrigen.puestoCargoId ?? '',
      puesto:           cargoOrigen.literalPuesto ?? '',
      especialidad:     cargoOrigen.especialidadPuesto?.nombre ?? cargoOrigen.especialidad ?? '',
      unificadorPuesto: 'Estructura',
      expediente,
      desde,
      cantidad:         1,
      etiqueta,
      cargoOrigenId:    cargoOrigen.id,
      cargoOrigenCodigo: cargoOrigen.codigo ?? undefined,
      cargoOrigenOcupado: cargoOrigen.ocupado ?? false,
      cargoOrigenPersona: cargoOrigen.personaOcupante?.apellidoNombre ?? undefined,
      nodoOrgId:   nodoOrg.nodoId,
      nodoOrgPath: nodoOrg.nodoPath,
      nodoOrgSigla: nodoOrg.sigla,
    }
    onAgregar(item)
    setCargoOrigen(null)
    setNodoOrg(null)
    setExpConfirmado(false)
    setExpInput('')
    setExpediente('')
    setDesde('')
    setEtiqueta('')
  }

  const formCompleto = !!cargoOrigen && expConfirmado && !!desde && !!nodoOrg

  return (
    <>
      {modalAbierto && (
        <ModalBuscarCargoEstructura
          onSeleccionar={seleccionarCargo}
          onCerrar={() => setModalAbierto(false)}
        />
      )}
      <div className="border-t border-gray-100 pt-5 space-y-4">
        {/* Banner */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 flex items-start gap-3">
          <span className="text-2xl leading-none mt-0.5">✏️</span>
          <div>
            <p className="text-sm font-bold text-gray-900">Edición de cargo de estructura</p>
            <p className="text-xs text-gray-600 mt-0.5">
              El cargo de estructura seleccionado se da de baja y se crea uno nuevo en el nodo destino.
              Si tiene persona, pasa al nuevo cargo. Si está vacante, va a concurso.
            </p>
          </div>
        </div>

        {/* Expediente */}
        {!expConfirmado ? (
          <div className="flex items-end gap-3 p-4 rounded-lg border-2 border-secondary/30 bg-secondary/5">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-secondary mb-1.5 uppercase tracking-wider">
                Decreto <span className="text-danger">*</span>
              </label>
              <input type="text" value={expInput} onChange={(e) => setExpInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmarExp()}
                placeholder="Ej: DEC-541/MSGC/26" className="h-10 input w-full" autoFocus />
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
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">Decreto confirmado</p>
                <p className="text-sm font-bold text-gray-800 mt-0.5">{expediente}</p>
              </div>
            </div>
            <button type="button" onClick={() => { setExpConfirmado(false); setExpInput(expediente) }}
              className="text-xs text-gray-400 hover:text-gray-600 underline">Cambiar</button>
          </div>
        )}

        <div className={`space-y-4 transition-opacity ${expConfirmado ? '' : 'opacity-40 pointer-events-none select-none'}`}>
          {/* Cargo origen */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Cargo de estructura a editar <span className="text-danger">*</span></label>
            {cargoOrigen ? (
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-gray-700">{cargoOrigen.codigo ?? '—'}</span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs font-medium text-gray-700">{cargoOrigen.hospital?.sigla}</span>
                    <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">Se da de baja</span>
                    {cargoOrigen.ocupado
                      ? <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Ocupado → pasa al nuevo</span>
                      : <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Vacante → concurso</span>}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5 truncate">{cargoOrigen.literalPuesto}{cargoOrigen.especialidad ? ` · ${cargoOrigen.especialidad}` : ''}</p>
                  {cargoOrigen.personaOcupante && <p className="text-xs text-gray-400 truncate">{cargoOrigen.personaOcupante.apellidoNombre}</p>}
                </div>
                <button type="button" onClick={() => setCargoOrigen(null)}
                  className="text-xs text-gray-400 hover:text-red-500 underline shrink-0">Cambiar</button>
              </div>
            ) : (
              <button type="button" onClick={() => setModalAbierto(true)}
                className="w-full h-12 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-400 hover:border-secondary hover:text-secondary transition-colors">
                + Seleccionar cargo de estructura
              </button>
            )}
          </div>

          {/* Nodo destino con cascada */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Nodo destino en el organigrama <span className="text-danger">*</span></label>
            <BannerNodoOrganigrama value={nodoOrg} onChange={setNodoOrg} />
          </div>

          {/* Desde + Etiqueta + botones */}
          <div className="grid grid-cols-5 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Desde <span className="text-danger">*</span></label>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-10 input w-full" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Etiqueta</label>
              <EtiquetaPicker value={etiqueta} onChange={setEtiqueta} catalogo={catalogoEtiquetas} />
            </div>
            <div className="col-span-2 flex gap-2">
              <button type="button" onClick={onCancelar} className="btn-outline flex-1">Cancelar</button>
              <button type="button" onClick={handleAgregar} disabled={!formCompleto}
                className="btn-primary flex-1 disabled:opacity-40">+ Agregar</button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Modal de búsqueda de cargos de estructura vigentes ──────────────────────
function ModalBuscarCargoEstructura({ onSeleccionar, onCerrar }: {
  onSeleccionar: (c: CargoPou) => void
  onCerrar: () => void
}) {
  const [hospitalId, setHospitalId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const { data: hospitales = [] } = useHospitales()

  const activo = !!hospitalId || busqueda.length >= 2

  const { data, isLoading } = useQuery({
    queryKey: ['cargos-estructura-modal', hospitalId, busqueda],
    enabled: activo,
    placeholderData: (prev: CargoPou[] | undefined) => prev,
    queryFn: async () => {
      const params: Record<string, string> = { limit: '50', estado: 'vigente', unificadorPuesto: 'Estructura' }
      if (hospitalId) params.hospitalId = hospitalId
      if (busqueda.length >= 2) params.search = busqueda
      const res = await apiClient.get<{ data: CargoPou[] }>('/api/v1/cargos', { params })
      return res.data.data
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-primary text-base font-bold text-gray-900">Seleccionar cargo de estructura</h2>
            <p className="text-xs text-gray-500 mt-0.5">Cargos de estructura vigentes</p>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-3 border-b border-gray-100 flex gap-3">
          <select value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} className="h-9 input text-sm flex-1">
            <option value="">Todas las siglas</option>
            {hospitales.map((h) => <option key={h.id} value={h.id}>{hospitalLabel(h)}</option>)}
          </select>
          <input autoFocus type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Código, puesto, especialidad..." className="h-9 input text-sm flex-1" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {!activo && <p className="p-6 text-sm text-gray-400 text-center">Seleccioná una sigla o escribí al menos 2 caracteres</p>}
          {activo && isLoading && <p className="p-6 text-sm text-gray-400 text-center">Buscando...</p>}
          {activo && !isLoading && (data?.length ?? 0) === 0 && <p className="p-6 text-sm text-gray-400 text-center">Sin resultados.</p>}
          {activo && !isLoading && (data?.length ?? 0) > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Código</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Sigla</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Puesto</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Persona</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Estado</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.map((c) => {
                  const sub = c.subEstado ?? (c.ocupado ? 'ocupado' : 'vacante')
                  return (
                    <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onSeleccionar(c)}>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-700">{c.codigo ?? '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">{c.hospital?.sigla ?? '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-800 max-w-[220px]">
                        <span className="font-medium leading-tight line-clamp-2">{c.literalPuesto ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">
                        {c.personaOcupante?.apellidoNombre ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={sub === 'ocupado' ? 'badge-success' : sub === 'concurso' ? 'badge-info' : 'badge-warning'}>
                          {sub === 'ocupado' ? 'Ocupado' : sub === 'concurso' ? 'Concurso' : 'Vacante'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-xs text-secondary font-medium">Seleccionar</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onCerrar} className="btn-outline">Cerrar</button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-form liviano: Agregar cargo POU nuevo ───────────────────────────────
// Sin expediente/desde/etiqueta propios — los inyecta FormModificacionPou.
function SubFormAgregarPou({ onAgregar, onCancelar }: {
  onAgregar: (item: ItemPendiente) => void
  onCancelar: () => void
}) {
  const [hospitalId,    setHospitalId]    = useState('')
  const [escalafonId,   setEscalafonId]   = useState('')
  const [modalidadIdx,  setModalidadIdx]  = useState<number | null>(null)
  const [puestoSel,     setPuestoSel]     = useState<PuestoCatalogoEspecialidad | null>(null)
  const [especialidadSel, setEspecialidadSel] = useState<PuestoCatalogoEspecialidad | null>(null)
  const [cantidad,      setCantidad]      = useState(1)

  const { data: hospitales = [] }            = useHospitales()
  const { data: escalafonesFiltrados = [] }  = useEscalafonesPorTipoAlta('pou')
  const escNombre        = escalafonesFiltrados.find((e) => e.id === escalafonId)?.nombre ?? ''
  const escCodigo        = escalafonesFiltrados.find((e) => e.id === escalafonId)?.codigo
  const opciones         = escalafonId ? opcionesModalidad(escNombre, 'pou') : []
  const modalidadEfectiva = opciones.length === 1 ? opciones[0]! : (modalidadIdx !== null ? opciones[modalidadIdx] ?? null : null)
  const { data: puestosCatalogo = [] } = usePuestosCargoNormalizados(
    escalafonId || undefined, 'pou', undefined, pideIncluirAmbosAlta(escCodigo, 'pou'),
  )
  const puestos = filtrarPuestosAlta(puestosCatalogo, escCodigo, 'pou')
  const { data: especialidadesCatalogo = [] } = useEspecialidadesDePuestoId(puestoSel?.id)
  const { opciones: especialidades, faltanAtpAtc, obligatoria: especialidadObligatoria } =
    especialidadesPermitidasAlta(puestoSel?.nombre ?? '', especialidadesCatalogo)

  const formCompleto = !!hospitalId && !!escalafonId && !!modalidadEfectiva && !!puestoSel
    && (!especialidadObligatoria || !!especialidadSel)

  function handleAgregar() {
    if (!formCompleto || !modalidadEfectiva || !puestoSel) return
    const hospital = hospitales.find((h) => h.id === hospitalId)
    const esc      = escalafonesFiltrados.find((e) => e.id === escalafonId)
    onAgregar({
      id:               crypto.randomUUID(),
      tipo:             'pou',
      hospitalId,
      hospitalSigla:    hospital?.sigla ?? hospitalId,
      escalafonId,
      escalafon:        esc?.nombre ?? escalafonId,
      puestoCargoId:    puestoSel.id,
      puesto:           puestoSel.nombre,
      especialidadPuestoId: especialidadSel?.id,
      especialidad:     especialidadSel?.nombre ?? '',
      unificadorPuesto: modalidadEfectiva.unificadorPuesto,
      agrupador:        modalidadEfectiva.agrupador,
      expediente:       '',
      desde:            '',
      cantidad,
      etiqueta:         '',
    })
    setPuestoSel(null); setEspecialidadSel(null); setCantidad(1)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Repartición <span className="text-danger">*</span></label>
          <select value={hospitalId} onChange={(e) => { setHospitalId(e.target.value); setPuestoSel(null); setEspecialidadSel(null) }} className="h-10 input w-full">
            <option value="">Seleccionar...</option>
            {hospitales.map((h) => <option key={h.id} value={h.id}>{hospitalLabel(h)}</option>)}
          </select>
        </div>
        <SelectorCarreraPuestoEspecialidad
          modo="unico" resetDependientes
          mostrar={{ carrera: true, puesto: false, especialidad: false }}
          requeridos={{ carrera: true }}
          valor={{ carrera: escalafonId ? [escalafonId] : [], puesto: [], especialidad: [] }}
          carreraOpciones={opcionesCarreraAlta(escalafonesFiltrados, 'pou')}
          puestoOpciones={[]} especialidadOpciones={[]}
          placeholders={{ carrera: 'Seleccionar carrera...' }}
          onChange={(next) => { setEscalafonId(next.carrera[0] ?? ''); setModalidadIdx(null); setPuestoSel(null); setEspecialidadSel(null) }}
        />
      </div>
      {escalafonId && opciones.length > 1 && (
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Modalidad <span className="text-danger">*</span></label>
          <div className="flex flex-wrap gap-2">
            {opciones.map((op, i) => (
              <button key={i} type="button" onClick={() => { setModalidadIdx(i); setPuestoSel(null); setEspecialidadSel(null) }}
                className={`px-3 py-1.5 rounded border text-sm font-medium transition-colors ${
                  modalidadIdx === i ? 'border-secondary bg-secondary text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-secondary hover:text-secondary'
                }`}>{op.label}</button>
            ))}
          </div>
        </div>
      )}
      {escalafonId && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-4">
          <SelectorCarreraPuestoEspecialidad
            modo="unico" resetDependientes
            mostrar={{ carrera: false, puesto: true, especialidad: true }}
            requeridos={{ puesto: true, especialidad: true }}
            ocultarSiVacio={{ especialidad: true }}
            valor={{ carrera: [], puesto: puestoSel ? [puestoSel.id] : [], especialidad: especialidadSel ? [especialidadSel.id] : [] }}
            carreraOpciones={[]}
            puestoOpciones={puestos.map((p) => ({ value: p.id, label: capitalizar(p.nombre) }))}
            especialidadOpciones={puestoSel ? especialidades.map((e) => ({ value: e.id, label: capitalizar(e.nombre) })) : []}
            placeholders={{ puesto: 'Seleccionar puesto...', especialidad: 'Seleccionar especialidad...' }}
            onChange={(next, campo) => {
              if (campo === 'puesto') { setPuestoSel(resolverSeleccionAlta(next.puesto, puestos)); setEspecialidadSel(null) }
              else { setEspecialidadSel(resolverSeleccionAlta(next.especialidad, especialidades)) }
            }}
          />
          {puestoSel && faltanAtpAtc && (
            <p className="text-xs font-semibold text-warning">Faltan cargar las especialidades Enfermeros ATP/ATC en el catálogo.</p>
          )}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500">Cantidad</label>
          <button type="button" onClick={() => setCantidad((v) => Math.max(1, v - 1))} className="w-8 h-8 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 font-bold text-lg leading-none">−</button>
          <span className="w-8 text-center text-sm font-bold text-gray-800">{cantidad}</span>
          <button type="button" onClick={() => setCantidad((v) => Math.min(50, v + 1))} className="w-8 h-8 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 font-bold text-lg leading-none">+</button>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancelar} className="btn-outline">Cancelar</button>
          <button type="button" onClick={handleAgregar} disabled={!formCompleto}
            className="btn-secondary disabled:opacity-40">+ Agregar al expediente</button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-form liviano: Modificar / Eliminar cargo POU ─────────────────────────
// Sin expediente/desde/etiqueta propios.
function SubFormModificarEliminarPou({ accion, onAgregar, onCancelar }: {
  accion: 'modificar' | 'eliminar'
  onAgregar: (item: ItemPendiente) => void
  onCancelar: () => void
}) {
  const [modalAbierto, setModalAbierto] = useState(false)
  const [cargoOrigen, setCargoOrigen]   = useState<CargoPou | null>(null)
  const [puestoSel,   setPuestoSel]     = useState<PuestoCatalogoEspecialidad | null>(null)
  const [especialidadSel, setEspecialidadSel] = useState<PuestoCatalogoEspecialidad | null>(null)

  const { data: puestosCatalogo = [] }       = usePuestosCargoNormalizados(cargoOrigen?.escalafonId ?? undefined, 'pou')
  const { data: especialidadesCatalogo = [] } = useEspecialidadesDePuestoId(puestoSel?.id)

  const formCompleto = !!cargoOrigen && (accion === 'eliminar' || !!puestoSel)

  function handleAgregar() {
    if (!cargoOrigen) return
    onAgregar({
      id:               crypto.randomUUID(),
      tipo:             accion === 'eliminar' ? 'pou_a_pof' : 'pou',
      hospitalId:       cargoOrigen.hospitalId,
      hospitalSigla:    cargoOrigen.hospital?.sigla ?? cargoOrigen.hospitalId,
      escalafonId:      cargoOrigen.escalafonId ?? '',
      escalafon:        cargoOrigen.escalafon?.nombre ?? '',
      puestoCargoId:    accion === 'modificar' && puestoSel ? puestoSel.id : (cargoOrigen.puestoCargoId ?? ''),
      puesto:           accion === 'modificar' && puestoSel ? puestoSel.nombre : (cargoOrigen.literalPuesto ?? ''),
      especialidadPuestoId: accion === 'modificar' ? especialidadSel?.id : undefined,
      especialidad:     accion === 'modificar' ? (especialidadSel?.nombre ?? '') : (cargoOrigen.especialidad ?? ''),
      unificadorPuesto: 'POU Guardia',
      expediente:       '',
      desde:            '',
      cantidad:         1,
      etiqueta:         '',
      cargoOrigenId:    cargoOrigen.id,
      cargoOrigenCodigo: cargoOrigen.codigo ?? undefined,
      cargoOrigenOcupado: false,
      operacionPou:     accion,
    })
    setCargoOrigen(null); setPuestoSel(null); setEspecialidadSel(null)
  }

  return (
    <>
      {modalAbierto && (
        <ModalBuscarCargoPou
          onSeleccionar={(c) => { setCargoOrigen(c); setModalAbierto(false) }}
          onCerrar={() => setModalAbierto(false)}
          yaSeleccionados={cargoOrigen ? [cargoOrigen.id] : []}
          soloVacantes
        />
      )}
      <div className="space-y-4">
        <div className={`rounded-lg border p-4 flex items-start gap-3 ${
          accion === 'eliminar' ? 'border-danger/30 bg-red-50' : 'border-gray-200 bg-gray-50'
        }`}>
          <span className="text-2xl leading-none mt-0.5">{accion === 'eliminar' ? '🗑️' : '✏️'}</span>
          <div>
            <p className={`text-sm font-bold ${accion === 'eliminar' ? 'text-danger' : 'text-gray-900'}`}>
              {accion === 'eliminar' ? 'Eliminar cargo POU vacante' : 'Modificar cargo POU vacante'}
            </p>
            <p className="text-xs mt-0.5 text-gray-600">
              {accion === 'eliminar'
                ? 'El cargo POU seleccionado se dará de baja de la norma. Solo se puede eliminar si está vacante.'
                : 'Seleccióná el cargo POU vacante y el nuevo puesto/especialidad que tendrá.'}
            </p>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
            Cargo POU vacante a {accion === 'eliminar' ? 'eliminar' : 'modificar'} <span className="text-danger">*</span>
          </label>
          {cargoOrigen ? (
            <div className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
              accion === 'eliminar' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold text-gray-700">{cargoOrigen.codigo ?? '—'}</span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs font-medium text-gray-700">{cargoOrigen.hospital?.sigla}</span>
                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Vacante</span>
                  {accion === 'eliminar' && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">Se da de baja</span>}
                </div>
                <p className="text-xs text-gray-600 mt-0.5 truncate">
                  {cargoOrigen.literalPuesto}{cargoOrigen.especialidad ? ` · ${cargoOrigen.especialidad}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => { setCargoOrigen(null); setPuestoSel(null); setEspecialidadSel(null) }}
                className="text-xs text-gray-400 hover:text-red-500 underline shrink-0">Cambiar</button>
            </div>
          ) : (
            <button type="button" onClick={() => setModalAbierto(true)}
              className="w-full h-12 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-400 hover:border-secondary hover:text-secondary transition-colors">
              + Seleccionar cargo POU vacante
            </button>
          )}
        </div>
        {accion === 'modificar' && cargoOrigen && (
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500">Nuevo puesto / especialidad</p>
            <SelectorCarreraPuestoEspecialidad
              modo="unico" resetDependientes
              mostrar={{ carrera: false, puesto: true, especialidad: true }}
              requeridos={{ puesto: true }}
              ocultarSiVacio={{ especialidad: true }}
              valor={{ carrera: [], puesto: puestoSel ? [puestoSel.id] : [], especialidad: especialidadSel ? [especialidadSel.id] : [] }}
              carreraOpciones={[]}
              puestoOpciones={puestosCatalogo.map((p) => ({ value: p.id, label: capitalizar(p.nombre) }))}
              especialidadOpciones={puestoSel ? especialidadesCatalogo.map((e) => ({ value: e.id, label: capitalizar(e.nombre) })) : []}
              placeholders={{ puesto: 'Seleccionar nuevo puesto...', especialidad: 'Seleccionar especialidad...' }}
              onChange={(next, campo) => {
                if (campo === 'puesto') { setPuestoSel(resolverSeleccionAlta(next.puesto, puestosCatalogo)); setEspecialidadSel(null) }
                else { setEspecialidadSel(resolverSeleccionAlta(next.especialidad, especialidadesCatalogo)) }
              }}
            />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancelar} className="btn-outline">Cancelar</button>
          <button type="button" onClick={handleAgregar} disabled={!formCompleto}
            className="btn-secondary disabled:opacity-40">+ Agregar al expediente</button>
        </div>
      </div>
    </>
  )
}

// ── Sub-form liviano: POU a POF ───────────────────────────────────────────────
// Sin expediente/desde/etiqueta propios.
function SubFormPouAPof({ onAgregar, onCancelar }: {
  onAgregar: (items: ItemPendiente[]) => void
  onCancelar: () => void
}) {
  const [modalAbierto, setModalAbierto] = useState(false)
  const [seleccionados, setSeleccionados] = useState<ItemPendiente[]>([])

  function agregarCargo(c: CargoPou) {
    if (seleccionados.some((s) => s.cargoOrigenId === c.id)) return
    setSeleccionados((prev) => [...prev, {
      id:               crypto.randomUUID(),
      tipo:             'pou_a_pof',
      hospitalId:       c.hospitalId,
      hospitalSigla:    c.hospital?.sigla ?? c.hospitalId,
      escalafonId:      c.escalafonId ?? '',
      escalafon:        c.escalafon?.nombre ?? '',
      puestoCargoId:    c.puestoCargoId ?? '',
      puesto:           c.literalPuesto ?? '',
      especialidad:     c.especialidadPuesto?.nombre ?? c.especialidad ?? '',
      unificadorPuesto: 'POF',
      expediente:       '',
      desde:            '',
      cantidad:         1,
      etiqueta:         '',
      cargoOrigenId:    c.id,
      cargoOrigenCodigo: c.codigo ?? undefined,
      cargoOrigenOcupado: c.ocupado ?? false,
      cargoOrigenPersona: c.personaOcupante?.apellidoNombre ?? undefined,
    }])
  }

  function handleAgregar() {
    if (seleccionados.length === 0) return
    onAgregar(seleccionados)
    setSeleccionados([])
  }

  return (
    <>
      {modalAbierto && (
        <ModalBuscarCargoPou
          onSeleccionar={(c) => { agregarCargo(c) }}
          onCerrar={() => setModalAbierto(false)}
          yaSeleccionados={seleccionados.map((s) => s.cargoOrigenId!).filter(Boolean)}
        />
      )}
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 flex items-start gap-3">
          <span className="text-2xl leading-none mt-0.5">🔄</span>
          <div>
            <p className="text-sm font-bold text-gray-900">Conversión POU → POF</p>
            <p className="text-xs text-gray-600 mt-0.5">
              Seleccióná los cargos POU vigentes a convertir. Si el cargo está ocupado, pasa a POF con la persona. Si está vacante, va a concurso.
            </p>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-500">Cargos POU a convertir <span className="text-danger">*</span></label>
            <button type="button" onClick={() => setModalAbierto(true)}
              className="text-xs px-3 py-1.5 rounded border border-secondary text-secondary hover:bg-secondary/10 font-medium transition-colors">
              + Seleccionar cargo POU
            </button>
          </div>
          {seleccionados.length === 0 ? (
            <button type="button" onClick={() => setModalAbierto(true)}
              className="w-full h-12 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-400 hover:border-secondary hover:text-secondary transition-colors">
              + Seleccionar cargo POU
            </button>
          ) : (
            <div className="space-y-2">
              {seleccionados.map((s) => (
                <div key={s.cargoOrigenId} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-gray-700">{s.cargoOrigenCodigo ?? '—'}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs font-medium text-gray-700">{s.hospitalSigla}</span>
                      {s.cargoOrigenOcupado
                        ? <span className="badge-success">Ocupado</span>
                        : <span className="badge-amber">Vacante → concurso</span>}
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5 truncate">{s.puesto}{s.especialidad ? ` · ${s.especialidad}` : ''}</p>
                    {s.cargoOrigenPersona && <p className="text-xs text-gray-400 truncate">{s.cargoOrigenPersona}</p>}
                  </div>
                  <button type="button" onClick={() => setSeleccionados((prev) => prev.filter((x) => x.cargoOrigenId !== s.cargoOrigenId))}
                    className="text-gray-300 hover:text-danger transition-colors text-lg leading-none flex-shrink-0">×</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancelar} className="btn-outline">Cancelar</button>
          <button type="button" onClick={handleAgregar} disabled={seleccionados.length === 0}
            className="btn-secondary disabled:opacity-40">+ Agregar al expediente ({seleccionados.length})</button>
        </div>
      </div>
    </>
  )
}

// ── Formulario Modificación de la POU ──────────────────────────────────────
// Centraliza las 4 operaciones sobre la norma POU:
//   1. Agregar cargo POU nuevo (alta desde cero)
//   2. Modificar cargo POU vacante (cambiar puesto/especialidad)
//   3. Eliminar cargo POU
//   4. Pasar POU a POF
type AccionPou = 'agregar' | 'modificar' | 'eliminar' | 'pou_a_pof'

const ACCIONES_POU: { id: AccionPou; emoji: string; label: string; desc: string; color: string }[] = [
  { id: 'agregar',   emoji: '➕', label: 'Agregar cargo POU',       desc: 'Crear un nuevo cargo en la norma de POU',                    color: 'border-secondary/40 bg-secondary/5 text-gray-900 hover:border-secondary hover:bg-secondary/10' },
  { id: 'modificar', emoji: '✏️', label: 'Modificar cargo POU',     desc: 'Cambiar puesto o especialidad de un cargo POU vacante',      color: 'border-gray-300 bg-gray-50 text-gray-900 hover:border-secondary hover:bg-secondary/5' },
  { id: 'eliminar',  emoji: '🗑️', label: 'Eliminar cargo POU',      desc: 'Dar de baja un cargo POU vacante de la norma',               color: 'border-danger/30 bg-red-50 text-gray-900 hover:border-danger/60 hover:bg-red-100' },
  { id: 'pou_a_pof', emoji: '🔄', label: 'Pasar POU a POF',         desc: 'Convertir cargos POU vigentes a POF (ocupados o vacantes)',  color: 'border-gray-300 bg-gray-50 text-gray-900 hover:border-secondary hover:bg-secondary/5' },
]

function FormModificacionPou({ onAgregar, onCancelar }: {
  onAgregar: (items: ItemPendiente | ItemPendiente[]) => void
  onCancelar: () => void
}) {
  const [expInput, setExpInput]           = useState('')
  const [expediente, setExpediente]       = useState('')
  const [expConfirmado, setExpConfirmado] = useState(false)
  const [desde, setDesde]                 = useState('')
  const [etiqueta, setEtiqueta]           = useState('')
  const [accion, setAccion]               = useState<AccionPou | null>(null)
  const { data: hospitales = [] }         = useHospitalesPou()
  const { data: cargas = [] }             = usePouCargas()
  const { data: catalogoEtiquetas = [] }  = useEtiquetas()
  const ultimaCarga = cargas[0] ?? null
  const navigate = useNavigate()

  function confirmarExp() {
    const v = expInput.trim()
    if (!v) return
    setExpediente(v)
    setExpConfirmado(true)
  }

  // Inyecta expediente/desde/etiqueta del padre y sube al panel; vuelve al selector
  function agregarConExp(items: ItemPendiente | ItemPendiente[]) {
    const arr = Array.isArray(items) ? items : [items]
    onAgregar(arr.map((it) => ({ ...it, expediente, desde, etiqueta })))
    setAccion(null)
  }

  return (
    <div className="border-t border-gray-100 pt-5 space-y-4">

      {/* Banner POU */}
      <div className="rounded-lg border border-secondary/30 bg-secondary/5 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none mt-0.5">📋</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900">Modificación de la norma de estructura POU</p>
            <p className="text-xs text-gray-600 mt-0.5">
              Cualquier cambio en la POU afecta la dotación estructural de <strong>todos los hospitales</strong>.
              Confirmá el expediente una sola vez y luego agregá todas las operaciones que necesites.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="text-xs text-gray-700">
            <span className="font-semibold">{hospitales.length}</span> hospital{hospitales.length !== 1 ? 'es' : ''} con datos POU
            {ultimaCarga && (
              <span className="ml-2 text-gray-500">
                · Última norma: <span className="font-mono">{ultimaCarga.archivo}</span>{' '}
                ({new Date(ultimaCarga.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })})
              </span>
            )}
          </div>
          <div className="flex gap-2 ml-auto">
            <button type="button" onClick={() => navigate('/pou')}
              className="btn-outline text-xs px-3 py-1.5">
              Ver norma POU →
            </button>
            <button type="button" onClick={() => navigate('/pou/carga')}
              className="btn-secondary text-xs px-3 py-1.5">
              Actualizar norma (Excel)
            </button>
          </div>
        </div>
      </div>

      {/* Paso 1: Expediente único */}
      {!expConfirmado ? (
        <div className="flex items-end gap-3 p-4 rounded-lg border-2 border-secondary/30 bg-secondary/5">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-secondary mb-1.5 uppercase tracking-wider">
              Expediente <span className="text-danger">*</span>
            </label>
            <input type="text" value={expInput} onChange={(e) => setExpInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmarExp()}
              placeholder="EX-2026-32260736-GCABA-DGAYDRH" className="h-10 input w-full" autoFocus />
          </div>
          <button type="button" onClick={confirmarExp} disabled={!expInput.trim()}
            className="btn-primary disabled:opacity-40">Confirmar</button>
          <button type="button" onClick={onCancelar} className="btn-outline">Cancelar</button>
        </div>
      ) : (
        <div className="flex items-center justify-between p-4 rounded-lg border border-green-200 bg-green-50">
          <div className="flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-sm">✓</span>
            <div>
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">Expediente confirmado</p>
              <p className="text-sm font-bold text-gray-800 mt-0.5">{expediente}</p>
            </div>
          </div>
          <button type="button" onClick={() => { setExpConfirmado(false); setExpInput(expediente); setAccion(null) }}
            className="text-xs text-gray-400 hover:text-gray-600 underline">Cambiar</button>
        </div>
      )}

      {/* Paso 2: Fecha + Etiqueta compartidas */}
      <div className={`grid grid-cols-2 gap-4 transition-opacity ${expConfirmado ? '' : 'opacity-40 pointer-events-none select-none'}`}>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Vigente desde <span className="text-danger">*</span></label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-10 input w-full" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Etiqueta del expediente</label>
          <EtiquetaPicker value={etiqueta} onChange={setEtiqueta} catalogo={catalogoEtiquetas} />
        </div>
      </div>

      {/* Paso 3: Selector de acción repetible */}
      <div className={`space-y-4 transition-opacity ${expConfirmado && desde ? '' : 'opacity-40 pointer-events-none select-none'}`}>
        {!accion ? (
          <>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Elegí la operación a agregar</p>
            <div className="grid grid-cols-2 gap-3">
              {ACCIONES_POU.map((a) => (
                <button key={a.id} type="button" onClick={() => setAccion(a.id)}
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all hover:shadow-md ${a.color}`}>
                  <span className="text-2xl leading-none mt-0.5">{a.emoji}</span>
                  <div>
                    <p className="text-sm font-bold">{a.label}</p>
                    <p className="text-xs opacity-75 mt-0.5">{a.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={onCancelar} className="btn-outline">Cancelar</button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setAccion(null)}
                className="text-xs text-secondary hover:text-secondary-dark font-semibold underline">← Volver a operaciones</button>
              <span className="text-gray-300">|</span>
              <span className="text-xs font-bold text-gray-700">
                {ACCIONES_POU.find((a) => a.id === accion)?.emoji}{' '}
                {ACCIONES_POU.find((a) => a.id === accion)?.label}
              </span>
            </div>
            {accion === 'agregar' && (
              <SubFormAgregarPou onAgregar={agregarConExp} onCancelar={() => setAccion(null)} />
            )}
            {(accion === 'modificar' || accion === 'eliminar') && (
              <SubFormModificarEliminarPou key={accion} accion={accion}
                onAgregar={agregarConExp} onCancelar={() => setAccion(null)} />
            )}
            {accion === 'pou_a_pof' && (
              <SubFormPouAPof onAgregar={agregarConExp} onCancelar={() => setAccion(null)} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-formulario: Modificar / Eliminar cargo POU ───────────────────────────
// Selecciona un cargo POU vacante y lo modifica (cambia puesto/especialidad)
// o lo elimina (baja). Solo permite operar sobre cargos vacantes.
function FormModificarEliminarPou({ accion, onAgregar, onCancelar }: {
  accion: 'modificar' | 'eliminar'
  onAgregar: (item: ItemPendiente | ItemPendiente[]) => void
  onCancelar: () => void
}) {
  const [modalAbierto, setModalAbierto] = useState(false)
  const [cargoOrigen, setCargoOrigen] = useState<CargoPou | null>(null)
  const [expInput, setExpInput] = useState('')
  const [expConfirmado, setExpConfirmado] = useState(false)
  const [expediente, setExpediente] = useState('')
  const [desde, setDesde] = useState('')
  const [etiqueta, setEtiqueta] = useState('')
  // Solo para modificar: nuevo puesto/especialidad
  const [puestoSel, setPuestoSel] = useState<PuestoCatalogoEspecialidad | null>(null)
  const [especialidadSel, setEspecialidadSel] = useState<PuestoCatalogoEspecialidad | null>(null)
  const { data: catalogoEtiquetas = [] } = useEtiquetas()
  const { data: puestosCatalogo = [] } = usePuestosCargoNormalizados(
    cargoOrigen?.escalafonId ?? undefined, 'pou',
  )
  const { data: especialidadesCatalogo = [] } = useEspecialidadesDePuestoId(puestoSel?.id)

  function confirmarExp() {
    const v = expInput.trim()
    if (!v) return
    setExpediente(v)
    setExpConfirmado(true)
  }

  function handleAgregar() {
    if (!cargoOrigen || !expConfirmado || !desde) return
    const tipoItem: TipoAlta = accion === 'eliminar' ? 'pou_a_pof' : 'pou'
    const item: ItemPendiente = {
      id:               crypto.randomUUID(),
      tipo:             tipoItem,
      hospitalId:       cargoOrigen.hospitalId,
      hospitalSigla:    cargoOrigen.hospital?.sigla ?? cargoOrigen.hospitalId,
      escalafonId:      cargoOrigen.escalafonId ?? '',
      escalafon:        cargoOrigen.escalafon?.nombre ?? '',
      puestoCargoId:    accion === 'modificar' && puestoSel ? puestoSel.id : (cargoOrigen.puestoCargoId ?? ''),
      puesto:           accion === 'modificar' && puestoSel ? puestoSel.nombre : (cargoOrigen.literalPuesto ?? ''),
      especialidadPuestoId: accion === 'modificar' ? especialidadSel?.id : undefined,
      especialidad:     accion === 'modificar' ? (especialidadSel?.nombre ?? '') : (cargoOrigen.especialidad ?? ''),
      unificadorPuesto: 'POU Guardia',
      expediente,
      desde,
      cantidad:         1,
      etiqueta,
      cargoOrigenId:    cargoOrigen.id,
      cargoOrigenCodigo: cargoOrigen.codigo ?? undefined,
      cargoOrigenOcupado: false,
      operacionPou:     accion === 'eliminar' || accion === 'modificar' ? accion : undefined,
    }
    onAgregar(item)
    setCargoOrigen(null)
    setExpConfirmado(false)
    setExpInput('')
    setExpediente('')
    setDesde('')
    setEtiqueta('')
    setPuestoSel(null)
    setEspecialidadSel(null)
  }

  const formCompleto = !!cargoOrigen && expConfirmado && !!desde &&
    (accion === 'eliminar' || !!puestoSel)

  const colorBanner = accion === 'eliminar'
    ? 'border-red-200 bg-red-50'
    : 'border-amber-200 bg-amber-50'
  const colorTexto = accion === 'eliminar' ? 'text-red-900' : 'text-amber-900'
  const colorSubTexto = accion === 'eliminar' ? 'text-red-700' : 'text-amber-700'

  return (
    <>
      {modalAbierto && (
        <ModalBuscarCargoPou
          onSeleccionar={(c) => { setCargoOrigen(c); setModalAbierto(false) }}
          onCerrar={() => setModalAbierto(false)}
          yaSeleccionados={cargoOrigen ? [cargoOrigen.id] : []}
          soloVacantes
        />
      )}
      <div className="space-y-4">
        {/* Banner */}
        <div className={`rounded-xl border p-4 flex items-start gap-3 ${colorBanner}`}>
          <span className="text-2xl leading-none mt-0.5">{accion === 'eliminar' ? '🗑️' : '✏️'}</span>
          <div>
            <p className={`text-sm font-bold ${colorTexto}`}>
              {accion === 'eliminar' ? 'Eliminar cargo POU vacante' : 'Modificar cargo POU vacante'}
            </p>
            <p className={`text-xs mt-0.5 ${colorSubTexto}`}>
              {accion === 'eliminar'
                ? 'El cargo POU seleccionado se dará de baja de la norma. Solo se puede eliminar si está vacante.'
                : 'Seleccioná el cargo POU vacante y el nuevo puesto/especialidad que tendrá.'}
            </p>
          </div>
        </div>

        {/* Expediente */}
        {!expConfirmado ? (
          <div className="flex items-end gap-3 p-4 rounded-lg border-2 border-secondary/30 bg-secondary/5">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-secondary mb-1.5 uppercase tracking-wider">
                Expediente <span className="text-danger">*</span>
              </label>
              <input type="text" value={expInput} onChange={(e) => setExpInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmarExp()}
                placeholder="EX-2026-32260736-GCABA-DGAYDRH" className="h-10 input w-full" autoFocus />
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
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">Expediente confirmado</p>
                <p className="text-sm font-bold text-gray-800 mt-0.5">{expediente}</p>
              </div>
            </div>
            <button type="button" onClick={() => { setExpConfirmado(false); setExpInput(expediente) }}
              className="text-xs text-gray-400 hover:text-gray-600 underline">Cambiar</button>
          </div>
        )}

        <div className={`space-y-4 transition-opacity ${expConfirmado ? '' : 'opacity-40 pointer-events-none select-none'}`}>
          {/* Cargo POU a operar */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              Cargo POU vacante a {accion === 'eliminar' ? 'eliminar' : 'modificar'} <span className="text-danger">*</span>
            </label>
            {cargoOrigen ? (
              <div className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
                accion === 'eliminar' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
              }`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-gray-700">{cargoOrigen.codigo ?? '—'}</span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs font-medium text-gray-700">{cargoOrigen.hospital?.sigla}</span>
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Vacante</span>
                    {accion === 'eliminar' && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">Se da de baja</span>}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5 truncate">
                    {cargoOrigen.literalPuesto}{cargoOrigen.especialidad ? ` · ${cargoOrigen.especialidad}` : ''}
                  </p>
                </div>
                <button type="button" onClick={() => { setCargoOrigen(null); setPuestoSel(null); setEspecialidadSel(null) }}
                  className="text-xs text-gray-400 hover:text-red-500 underline shrink-0">Cambiar</button>
              </div>
            ) : (
              <button type="button" onClick={() => setModalAbierto(true)}
                className="w-full h-12 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-400 hover:border-secondary hover:text-secondary transition-colors">
                + Seleccionar cargo POU vacante
              </button>
            )}
          </div>

          {/* Nuevo puesto (solo modificar) */}
          {accion === 'modificar' && cargoOrigen && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500">Nuevo puesto / especialidad</p>
              <SelectorCarreraPuestoEspecialidad
                modo="unico"
                resetDependientes
                mostrar={{ carrera: false, puesto: true, especialidad: true }}
                requeridos={{ puesto: true }}
                ocultarSiVacio={{ especialidad: true }}
                valor={{ carrera: [], puesto: puestoSel ? [puestoSel.id] : [], especialidad: especialidadSel ? [especialidadSel.id] : [] }}
                carreraOpciones={[]}
                puestoOpciones={puestosCatalogo.map((p) => ({ value: p.id, label: capitalizar(p.nombre) }))}
                especialidadOpciones={puestoSel ? especialidadesCatalogo.map((e) => ({ value: e.id, label: capitalizar(e.nombre) })) : []}
                placeholders={{ puesto: 'Seleccionar nuevo puesto...', especialidad: 'Seleccionar especialidad...' }}
                onChange={(next, campo) => {
                  if (campo === 'puesto') {
                    setPuestoSel(resolverSeleccionAlta(next.puesto, puestosCatalogo))
                    setEspecialidadSel(null)
                  } else {
                    setEspecialidadSel(resolverSeleccionAlta(next.especialidad, especialidadesCatalogo))
                  }
                }}
              />
            </div>
          )}

          {/* Desde + Etiqueta + botones */}
          <div className="grid grid-cols-5 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Desde <span className="text-danger">*</span></label>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-10 input w-full" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Etiqueta</label>
              <EtiquetaPicker value={etiqueta} onChange={setEtiqueta} catalogo={catalogoEtiquetas} />
            </div>
            <div className="col-span-2 flex gap-2">
              <button type="button" onClick={onCancelar} className="btn-outline flex-1">Cancelar</button>
              <button type="button" onClick={handleAgregar} disabled={!formCompleto}
                className="btn-primary flex-1 disabled:opacity-40">+ Agregar</button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Formulario (expediente + campos, agrega al panel) ────────────────────────
function FormAlta({ tipo, onAgregar, onCancelar }: {
  tipo: TipoAltaCarrera
  onAgregar: (item: ItemPendiente | ItemPendiente[]) => void
  onCancelar: () => void
}) {
  const [expInput,      setExpInput]      = useState('')
  const [expConfirmado, setExpConfirmado] = useState(false)
  const [expediente,    setExpediente]    = useState('')
  const [hospitalId,    setHospitalId]    = useState('')
  const [escalafonId,   setEscalafonId]   = useState('')
  const [modalidadIdx,  setModalidadIdx]  = useState<number | null>(null)
  const [puestoSel,       setPuestoSel]       = useState<PuestoCatalogoEspecialidad | null>(null)
  const [especialidadSel, setEspecialidadSel] = useState<PuestoCatalogoEspecialidad | null>(null)
  const puesto = puestoSel?.nombre ?? ''
  const especialidad = especialidadSel?.nombre ?? ''
  const [desde,         setDesde]         = useState('')
  const [cantidad,      setCantidad]      = useState(1)
  const [etiqueta,      setEtiqueta]      = useState('')

  const { data: hospitales        = [] } = useHospitales()
  const { data: escalafonesFiltrados = [] } = useEscalafonesPorTipoAlta(tipo)
  // Catálogo de etiquetas reutilizable (mismo que Concursos CPH): permite
  // elegir una etiqueta ya creada o escribir una nueva.
  const { data: catalogoEtiquetas = [] } = useEtiquetas()

  const escNombre         = escalafonesFiltrados.find((e) => e.id === escalafonId)?.nombre ?? ''
  const opciones          = escalafonId ? opcionesModalidad(escNombre, tipo) : []
  const modalidadEfectiva = opciones.length === 1 ? opciones[0]! : (modalidadIdx !== null ? opciones[modalidadIdx] ?? null : null)

  // Carrera 87: solo Enfermero Profesional / Licenciado en Enfermería (ver lib/carrerasGestionadas).
  const escCodigo = escalafonesFiltrados.find((e) => e.id === escalafonId)?.codigo
  // Solo las carreras con regla de puestos piden también los puestos 'ambos'
  // (la 87 los necesita); el resto del alta queda con su lista de hoy.
  const { data: puestosCatalogo = [] } = usePuestosCargoNormalizados(
    escalafonId || undefined, modalidadParaTipo(tipo), undefined, pideIncluirAmbosAlta(escCodigo, tipo),
  )
  const puestos   = filtrarPuestosAlta(puestosCatalogo, escCodigo, tipo)
  // S21: especialidades del puesto EXACTO por id (evita el bug de homónimos).
  const { data: especialidadesCatalogo = [] } = useEspecialidadesDePuestoId(puestoSel?.id)
  // Regla enfermería: solo "Enfermeros ATP/ATC"; si aún no están en el catálogo,
  // avisa y no bloquea el alta (ver lib/especialidadesAlta).
  const { opciones: especialidades, faltanAtpAtc, obligatoria: especialidadObligatoria } =
    especialidadesPermitidasAlta(puesto, especialidadesCatalogo)

  const formCompleto = expConfirmado && !!hospitalId && !!escalafonId && !!modalidadEfectiva && !!puesto
    && (!especialidadObligatoria || !!especialidad) && !!desde
  const expLabel       = tipo === 'estructura' ? 'Decreto' : 'Expediente'
  const expPlaceholder = tipo === 'estructura' ? 'Ej: DEC-541/MSGC/26' : 'Ej: EX-2026-32260736-GCABA-DGAYDRH'

  function confirmarExp() {
    const v = expInput.trim()
    if (!v) return
    setExpediente(v)
    setExpConfirmado(true)
  }

  function handleAgregar() {
    if (!formCompleto || !modalidadEfectiva || !puestoSel) return
    const hospital = hospitales.find((h) => h.id === hospitalId)
    const esc      = escalafonesFiltrados.find((e) => e.id === escalafonId)
    onAgregar({
      id:               crypto.randomUUID(),
      tipo,
      hospitalId,
      hospitalSigla:    hospital?.sigla ?? hospitalId,
      escalafonId,
      escalafon:        esc?.nombre ?? escalafonId,
      puestoCargoId:    puestoSel.id,
      puesto,
      especialidadPuestoId: especialidadSel?.id,
      especialidad:     especialidad || '',
      unificadorPuesto: modalidadEfectiva.unificadorPuesto,
      agrupador:        modalidadEfectiva.agrupador,
      expediente,
      desde,
      cantidad,
      etiqueta:         etiqueta || '',
    })
    setPuestoSel(null); setEspecialidadSel(null); setCantidad(1); setEtiqueta('')
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

        {/* Hospital + Carrera */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Repartición <span className="text-danger">*</span></label>
            <select value={hospitalId} onChange={(e) => { setHospitalId(e.target.value); setPuestoSel(null); setEspecialidadSel(null) }} className="h-10 input w-full">
              <option value="">Seleccionar...</option>
              {hospitales.map((h) => <option key={h.id} value={h.id}>{hospitalLabel(h)}</option>)}
            </select>
          </div>
          <SelectorCarreraPuestoEspecialidad
            modo="unico"
            resetDependientes
            mostrar={{ carrera: true, puesto: false, especialidad: false }}
            requeridos={{ carrera: true }}
            valor={{ carrera: escalafonId ? [escalafonId] : [], puesto: [], especialidad: [] }}
            carreraOpciones={opcionesCarreraAlta(escalafonesFiltrados, tipo)}
            puestoOpciones={[]}
            especialidadOpciones={[]}
            placeholders={{ carrera: 'Seleccionar carrera...' }}
            onChange={(next) => { setEscalafonId(next.carrera[0] ?? ''); setModalidadIdx(null); setPuestoSel(null); setEspecialidadSel(null) }}
          />
        </div>

        {/* Modalidad — solo si hay más de una opción */}
        {escalafonId && opciones.length > 1 && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Modalidad / Categoría <span className="text-danger">*</span></label>
            <div className="flex flex-wrap gap-2">
              {opciones.map((op, i) => (
                <button key={i} type="button" onClick={() => { setModalidadIdx(i); setPuestoSel(null); setEspecialidadSel(null) }}
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
            <SelectorCarreraPuestoEspecialidad
              modo="unico"
              resetDependientes
              mostrar={{ carrera: false, puesto: true, especialidad: true }}
              requeridos={{ puesto: true, especialidad: true }}
              ocultarSiVacio={{ especialidad: true }}
              valor={{ carrera: [], puesto: puestoSel ? [puestoSel.id] : [], especialidad: especialidadSel ? [especialidadSel.id] : [] }}
              carreraOpciones={[]}
              puestoOpciones={puestos.map((p) => ({ value: p.id, label: capitalizar(p.nombre) }))}
              especialidadOpciones={puesto ? especialidades.map((e) => ({ value: e.id, label: capitalizar(e.nombre) })) : []}
              placeholders={{ puesto: 'Seleccionar puesto...', especialidad: 'Seleccionar especialidad...' }}
              onChange={(next, campo) => {
                if (campo === 'puesto') {
                  setPuestoSel(resolverSeleccionAlta(next.puesto, puestos))
                  setEspecialidadSel(null)
                } else {
                  setEspecialidadSel(resolverSeleccionAlta(next.especialidad, especialidades))
                }
              }}
            />
            {puesto && faltanAtpAtc && (
              <p role="status" className="text-xs font-semibold text-warning">
                Faltan cargar las especialidades Enfermeros ATP/ATC en el catálogo. Podés dar el alta sin especialidad.
              </p>
            )}
          </div>
        )}

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
            <EtiquetaPicker
              value={etiqueta}
              onChange={setEtiqueta}
              catalogo={catalogoEtiquetas}
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

// Resumen del grupo enviado a aprobación — alimenta el modal de confirmación.
// Se arma con los ítems recién enviados (comparten el expediente del lote).
interface ResumenEnvio {
  expediente: string
  totalCargos: number
  items: ItemPendiente[]
}

// ── Transferencias ──────────────────────────────────────────────────────────
// El usuario declara transferencias (nombre, apellido, sigla origen, sigla
// destino, CUIL). Se guardan en localStorage. La tabla consulta el padrón por
// CUIL; cuando aparece → notificación + botón Confirmar que crea la SolicitudAlta
// con esTransferencia:true (se aprueba directamente sin pasar por el director).

interface TransferenciaDeclarada {
  id: string
  apellido: string
  nombre: string
  cuil: string
  siglaOrigen: string
  siglaDestino: string
  declaradaAt: string
  // Datos del cargo destino (para la solicitud)
  hospitalId?: string
  escalafonId?: string
  puestoCargoId?: string
}

function normalizarCuil(cuil: string): string {
  return cuil.replace(/[^0-9]/g, '')
}

// Fila de la tabla: consulta el padrón por CUIL y muestra el estado
function FilaTransferencia({
  t,
  onEliminar,
  onConfirmada,
}: {
  t: TransferenciaDeclarada
  onEliminar: () => void
  onConfirmada: () => void
}) {
  const cuil = normalizarCuil(t.cuil)
  const [confirmando, setConfirmando] = useState(false)
  const [errorConf, setErrorConf] = useState<string | null>(null)
  const crearLote = useCreateSolicitudesAltaBatch()

  const { data, isLoading } = useQuery({
    queryKey: ['persona-padron-cuil', cuil],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PersonaListItem[] }>('/api/v1/personas', {
        params: { search: cuil, limit: 5 },
      })
      return res.data.data
    },
    enabled: cuil.length >= 10,
    refetchInterval: 60_000, // re-consulta cada minuto
  })

  const persona = data?.find((p) => normalizarCuil(p.cuil) === cuil) ?? null
  const enPadron = !!persona

  async function confirmar() {
    if (!persona || !t.hospitalId || !t.escalafonId || !t.puestoCargoId) return
    setConfirmando(true); setErrorConf(null)
    try {
      await crearLote.mutateAsync({
        items: [{
          hospitalId:      t.hospitalId,
          escalafonId:     t.escalafonId,
          puestoCargoId:   t.puestoCargoId,
          esTransferencia: true,
          expediente:      `Transferencia ${t.siglaOrigen} → ${t.siglaDestino}`,
        }],
      })
      onConfirmada()
    } catch (err) {
      setErrorConf(getApiErrorMessage(err))
    } finally {
      setConfirmando(false)
    }
  }

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <p className="font-medium text-gray-800 text-sm">{t.apellido}, {t.nombre}</p>
        <p className="font-mono text-xs text-gray-500">{t.cuil}</p>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{t.siglaOrigen}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{t.siglaDestino}</td>
      <td className="px-4 py-3 text-xs text-gray-400">{t.declaradaAt.slice(0, 10)}</td>
      <td className="px-4 py-3">
        {isLoading ? (
          <span className="text-xs text-gray-400">Consultando padrón...</span>
        ) : enPadron ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
              <span>●</span> En padrón
            </span>
            <span className="text-xs text-gray-500 truncate max-w-[160px]">{persona.apellidoNombre}</span>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
            <span>○</span> Sin padrón — esperando
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          {enPadron && t.hospitalId && t.escalafonId && t.puestoCargoId && (
            <button
              type="button"
              onClick={confirmar}
              disabled={confirmando}
              className="btn-primary text-xs px-3 py-1 disabled:opacity-40"
            >
              {confirmando ? 'Confirmando...' : 'Confirmar transferencia'}
            </button>
          )}
          {errorConf && <span className="text-xs text-red-500">{errorConf}</span>}
          <button type="button" onClick={onEliminar}
            className="text-gray-300 hover:text-red-400 text-lg leading-none transition-colors">×</button>
        </div>
      </td>
    </tr>
  )
}

// Formulario para declarar una nueva transferencia
function FormTransferencia({ onAgregar, onCancelar }: {
  onAgregar: (t: TransferenciaDeclarada) => void
  onCancelar: () => void
}) {
  const [apellido, setApellido] = useState('')
  const [nombre, setNombre] = useState('')
  const [cuil, setCuil] = useState('')
  const [siglaOrigen, setSiglaOrigen] = useState('')
  const [siglaDestino, setSiglaDestino] = useState('')
  // Cargo destino (opcional — si no se completa, el botón Confirmar no aparece)
  const [hospitalId, setHospitalId] = useState('')
  const [escalafonId, setEscalafonId] = useState('')
  const [puestoCargoId, setPuestoCargoId] = useState('')
  const { data: hospitales = [] } = useHospitales()
  const { data: escalafones = [] } = useEscalafonesPorTipoAlta('pof')
  const { data: puestosCatalogo = [] } = usePuestosCargoNormalizados(
    escalafonId || undefined, 'ambos',
  )

  const valido = apellido.trim() && nombre.trim() && normalizarCuil(cuil).length >= 10 && siglaOrigen.trim() && siglaDestino.trim()

  function handleAgregar() {
    if (!valido) return
    onAgregar({
      id:           crypto.randomUUID(),
      apellido:     apellido.trim(),
      nombre:       nombre.trim(),
      cuil:         cuil.trim(),
      siglaOrigen:  siglaOrigen.trim().toUpperCase(),
      siglaDestino: siglaDestino.trim().toUpperCase(),
      declaradaAt:  new Date().toISOString(),
      hospitalId:   hospitalId || undefined,
      escalafonId:  escalafonId || undefined,
      puestoCargoId: puestoCargoId || undefined,
    })
    setApellido(''); setNombre(''); setCuil('')
    setSiglaOrigen(''); setSiglaDestino('')
    setHospitalId(''); setEscalafonId(''); setPuestoCargoId('')
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-gray-50 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none mt-0.5">🔀</span>
        <div>
          <p className="text-sm font-bold text-gray-900">Declarar transferencia</p>
          <p className="text-xs text-gray-600 mt-0.5">
            Ingresá los datos de la persona que se transfiere. Cuando aparezca en el padrón semanal podrás confirmar la transferencia y asignarle un código de cargo.
          </p>
        </div>
      </div>

      {/* Datos personales */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Apellido <span className="text-danger">*</span></label>
          <input type="text" value={apellido} onChange={(e) => setApellido(e.target.value)}
            placeholder="GARCIA" className="h-9 input w-full text-sm" autoFocus />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre <span className="text-danger">*</span></label>
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
            placeholder="JUAN" className="h-9 input w-full text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">CUIL <span className="text-danger">*</span></label>
          <input type="text" value={cuil} onChange={(e) => setCuil(e.target.value)}
            placeholder="20-12345678-9" className="h-9 input w-full text-sm font-mono" />
        </div>
      </div>

      {/* Siglas */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Sigla de origen <span className="text-danger">*</span></label>
          <input type="text" value={siglaOrigen} onChange={(e) => setSiglaOrigen(e.target.value)}
            placeholder="HGAIP" className="h-9 input w-full text-sm font-mono uppercase" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Sigla de destino <span className="text-danger">*</span></label>
          <input type="text" value={siglaDestino} onChange={(e) => setSiglaDestino(e.target.value)}
            placeholder="HGATA" className="h-9 input w-full text-sm font-mono uppercase" />
        </div>
      </div>

      {/* Cargo destino (opcional — necesario para confirmar) */}
      <details className="group">
        <summary className="cursor-pointer text-xs font-semibold text-secondary hover:text-secondary-dark select-none">
          ▶ Cargo destino (necesario para confirmar la transferencia)
        </summary>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Repartición destino</label>
            <select value={hospitalId} onChange={(e) => { setHospitalId(e.target.value); setEscalafonId(''); setPuestoCargoId('') }}
              className="h-9 input w-full text-sm">
              <option value="">Seleccionar...</option>
              {hospitales.map((h) => <option key={h.id} value={h.id}>{hospitalLabel(h)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Carrera</label>
            <select value={escalafonId} onChange={(e) => { setEscalafonId(e.target.value); setPuestoCargoId('') }}
              className="h-9 input w-full text-sm" disabled={!hospitalId}>
              <option value="">Seleccionar...</option>
              {escalafones.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Puesto</label>
            <select value={puestoCargoId} onChange={(e) => setPuestoCargoId(e.target.value)}
              className="h-9 input w-full text-sm" disabled={!escalafonId}>
              <option value="">Seleccionar...</option>
              {puestosCatalogo.map((p) => <option key={p.id} value={p.id}>{capitalizar(p.nombre)}</option>)}
            </select>
          </div>
        </div>
      </details>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="btn-outline">Cancelar</button>
        <button type="button" onClick={handleAgregar} disabled={!valido}
          className="btn-primary disabled:opacity-40">Agregar transferencia</button>
      </div>
    </div>
  )
}

// Pestaña completa de transferencias
function TabTransferencias({
  transferencias,
  onAgregar,
  onEliminar,
  onConfirmada,
}: {
  transferencias: TransferenciaDeclarada[]
  onAgregar: (t: TransferenciaDeclarada) => void
  onEliminar: (id: string) => void
  onConfirmada: (id: string) => void
}) {
  const [formAbierto, setFormAbierto] = useState(false)

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-gray-800">Transferencias declaradas</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Declarás la transferencia antes de que aparezca en el padrón. Cuando el padrón semanal la incluya, podés confirmarla y se asigna el código de cargo.
          </p>
        </div>
        <button type="button" onClick={() => setFormAbierto((v) => !v)}
          className={`btn-primary ${formAbierto ? 'opacity-60' : ''}`}>
          {formAbierto ? '▲ Cerrar' : '+ Nueva transferencia'}
        </button>
      </div>

      {formAbierto && (
        <FormTransferencia
          onAgregar={(t) => { onAgregar(t); setFormAbierto(false) }}
          onCancelar={() => setFormAbierto(false)}
        />
      )}

      {transferencias.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-10 text-center">
          <p className="text-sm text-gray-400">No hay transferencias declaradas.</p>
          <p className="text-xs text-gray-300 mt-1">Usá el botón "+ Nueva transferencia" para agregar.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-navy text-white text-left">
              <tr>
                <th className="px-4 py-3 font-semibold rounded-tl-xl">Persona</th>
                <th className="px-4 py-3 font-semibold">Origen</th>
                <th className="px-4 py-3 font-semibold">Destino</th>
                <th className="px-4 py-3 font-semibold">Declarada</th>
                <th className="px-4 py-3 font-semibold">Estado padrón</th>
                <th className="px-4 py-3 rounded-tr-xl" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transferencias.map((t) => (
                <FilaTransferencia
                  key={t.id}
                  t={t}
                  onEliminar={() => onEliminar(t.id)}
                  onConfirmada={() => onConfirmada(t.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
        <strong>¿Cómo funciona?</strong> Las transferencias declaradas se guardan localmente.
        Cada minuto se consulta el padrón por CUIL. Cuando la persona aparece, el estado cambia a
        <span className="mx-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">● En padrón</span>
        y podés confirmar la transferencia para asignarle un código de cargo.
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────
export function AltaCargosPage() {
  const navigate = useNavigate()
  const [tab,        setTab]        = useState<'historial' | 'nueva' | 'transferencia'>('historial')
  const [tipoActivo, setTipoActivo] = useState<TipoAlta | null>(null)
  const [pendientes, setPendientes] = useState<ItemPendiente[]>([])
  const [guardando,  setGuardando]  = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [search,     setSearch]     = useState('')
  const [filtroEstado, setFiltroEstado] = useState<SolicitudAltaEstado | ''>('')
  const [confirmacion, setConfirmacion] = useState<ResumenEnvio | null>(null)
  const [nodoOrg, setNodoOrg] = useState<{ sigla: string; nodoId: string; nodoPath: string } | null>(null)
  const [transferencias, setTransferencias] = useState<TransferenciaDeclarada[]>(() => {
    try { return JSON.parse(localStorage.getItem('srrhh_transferencias') ?? '[]') } catch { return [] }
  })

  useEffect(() => {
    localStorage.setItem('srrhh_transferencias', JSON.stringify(transferencias))
  }, [transferencias])

  // S13-D: historial ahora lista SolicitudAlta (con estado pendiente/aprobada/
  // rechazada) — el Cargo real recién existe cuando el director aprueba.
  const { data: solicitudesData, refetch: refetchSolicitudes } = useSolicitudesAlta({
    limit: 100,
    ...(filtroEstado && { estado: filtroEstado }),
    ...(tab === 'historial' && { esTransferencia: false }),
  })
  const solicitudes = solicitudesData?.data ?? []
  const solicitudesFiltradas = search.trim()
    ? solicitudes.filter((s) => (s.expediente ?? '').toLowerCase().includes(search.trim().toLowerCase()) || solicitudMatcheaEtiqueta(s, search))
    : solicitudes

  const crearLote = useCreateSolicitudesAltaBatch()

  function handleAgregar(itemOrItems: ItemPendiente | ItemPendiente[]) {
    const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems]
    const itemsFinales = items.map((item) =>
      tipoActivo === 'estructura' && nodoOrg
        ? { ...item, nodoOrgId: nodoOrg.nodoId, nodoOrgPath: nodoOrg.nodoPath, nodoOrgSigla: nodoOrg.sigla }
        : item
    )
    setPendientes((prev) => [...prev, ...itemsFinales])
  }

  async function handleRegistrarTodos() {
    if (pendientes.length === 0) return
    setGuardando(true); setError(null)
    try {
      // LOTE: una sola request → una transacción en el backend que crea las N
      // solicitudes + autorizaciones (evita el timeout de 5 s de N requests).
      await crearLote.mutateAsync({
        items: pendientes.map((item) => ({
          hospitalId:       item.hospitalId,
          escalafonId:      item.escalafonId,
          puestoCargoId:       item.puestoCargoId,
          especialidadPuestoId: item.especialidadPuestoId,
          unificadorPuesto: item.unificadorPuesto,
          agrupador:        item.nodoOrgId ?? item.agrupador,
          expediente:       item.expediente || undefined,
          desde:            item.desde,
          cantidad:         item.cantidad,
          etiqueta:         item.etiqueta || undefined,
          // nodoOrgPath viaja en observaciones para el PDF; cargoOrigenId para POU a POF / editar_estructura
          observaciones: item.tipo === 'editar_estructura' && item.nodoOrgPath && item.cargoOrigenId
            ? `nodo:${item.nodoOrgSigla}|${item.nodoOrgId}|${item.nodoOrgPath}|origen:${item.cargoOrigenId}`
            : item.nodoOrgPath
            ? `nodo:${item.nodoOrgSigla}|${item.nodoOrgId}|${item.nodoOrgPath}`
            : item.cargoOrigenId
            ? marcadorCargoPou(item)
            : undefined,
        })),
      })
      // Resumen para el modal (todos los ítems del lote comparten el expediente).
      const enviados = pendientes
      const expediente = enviados[0]?.expediente ?? ''
      const totalCargos = enviados.reduce((acc, p) => acc + p.cantidad, 0)
      // Form limpio: se vacían los pendientes y se cierra el formulario abierto.
      setPendientes([])
      setTipoActivo(null)
      refetchSolicitudes()
      setConfirmacion({ expediente, totalCargos, items: enviados })
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setGuardando(false)
    }
  }

  const totalPendientes = pendientes.reduce((acc, p) => acc + p.cantidad, 0)

  const BOTONES_DESDE_CERO: { tipo: TipoAlta; label: string; cls: string }[] = [
    { tipo: 'pof',        label: 'Ejecución POF',       cls: 'btn-secondary' },
    { tipo: 'mod_pou',    label: 'Modificación de la POU', cls: 'btn-outline' },
    { tipo: 'estructura', label: 'Estructura',           cls: 'btn-outline'   },
  ]
  const BOTONES_CONVERSION: { tipo: TipoAlta; label: string; cls: string }[] = [
    { tipo: 'editar_estructura', label: 'Editar Estructura', cls: 'btn-outline' },
  ]

  return (
    <div className="flex flex-col gap-6 h-full">

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm">
          {tab === 'nueva' && (
            <div className="flex items-center justify-between px-6 pt-5 pb-0">
              <h1 className="font-primary text-xl font-bold text-gray-900">Alta de Cargos</h1>
              {tab === 'nueva' && (
                <div className="flex items-center gap-2">
                  {BOTONES_DESDE_CERO.map(({ tipo, label, cls }) => (
                    <button key={tipo} type="button"
                      onClick={() => setTipoActivo((prev) => (prev === tipo ? null : tipo))}
                      className={`${cls} ${tipoActivo === tipo ? 'ring-2 ring-offset-1 ring-secondary' : ''}`}>
                      {tipoActivo === tipo ? `▲ ${label}` : `+ ${label}`}
                    </button>
                  ))}
                  <span className="w-px h-6 bg-gray-300 mx-1" />
                  {BOTONES_CONVERSION.map(({ tipo, label, cls }) => (
                    <button key={tipo} type="button"
                      onClick={() => setTipoActivo((prev) => (prev === tipo ? null : tipo))}
                      className={`${cls} ${tipoActivo === tipo ? 'ring-2 ring-offset-1 ring-secondary' : ''}`}>
                      {tipoActivo === tipo ? `▲ ${label}` : `🔄 ${label}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {tab !== 'nueva' && (
            <div className="flex items-center justify-between px-6 pt-5 pb-0">
              <h1 className="font-primary text-xl font-bold text-gray-900">Alta de Cargos</h1>
            </div>
          )}

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
              {t === 'historial' ? 'Cargos Históricos' : t === 'nueva' ? 'Nueva alta' : 'Transferencia'}
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
                  {tipoActivo === 'estructura' && <BannerNodoOrganigrama value={nodoOrg} onChange={setNodoOrg} />}
                  {tipoActivo === 'mod_pou' && (
                    <FormModificacionPou onAgregar={handleAgregar} onCancelar={() => setTipoActivo(null)} />
                  )}
                  {tipoActivo && tipoActivo !== 'pou_a_pof' && tipoActivo !== 'editar_estructura' && tipoActivo !== 'mod_pou' && (
                    <FormAlta key={tipoActivo} tipo={tipoActivo as TipoAltaCarrera} onAgregar={handleAgregar} onCancelar={() => setTipoActivo(null)} />
                  )}
                  {tipoActivo === 'editar_estructura' && (
                    <FormEditarEstructura onAgregar={handleAgregar} onCancelar={() => setTipoActivo(null)} />
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
                                  {item.cargoOrigenCodigo && (
                                    <span className="text-xs font-mono text-gray-500">{item.cargoOrigenCodigo}</span>
                                  )}
                                  {item.cantidad > 1 && (
                                    <span className="text-xs bg-secondary/10 text-secondary px-1.5 py-0.5 rounded font-medium">x{item.cantidad}</span>
                                  )}
                                  {item.etiqueta && (
                                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">{item.etiqueta}</span>
                                  )}
                                  {item.cargoOrigenOcupado === false && (item.tipo === 'pou_a_pof' || item.tipo === 'editar_estructura') && (
                                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">vacante</span>
                                  )}
                                  {item.tipo === 'editar_estructura' && item.cargoOrigenOcupado && (
                                    <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">con persona</span>
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

        {/* Contenido pestaña Cargos Históricos — vista AGRUPADA por expediente,
            solo lectura (ver + descargar PDF del grupo). */}
        {tab === 'historial' && (
          <CargosHistoricos
            search={search} setSearch={setSearch}
            filtroEstado={filtroEstado} setFiltroEstado={setFiltroEstado}
            solicitudes={solicitudesFiltradas}
          />
        )}

        {/* Contenido pestaña Transferencia */}
        {tab === 'transferencia' && (
          <TabTransferencias
            transferencias={transferencias}
            onAgregar={(t) => setTransferencias((prev) => [...prev, t])}
            onEliminar={(id) => setTransferencias((prev) => prev.filter((t) => t.id !== id))}
            onConfirmada={(id) => setTransferencias((prev) => prev.filter((t) => t.id !== id))}
          />
        )}
      </div>

      {/* Modal de confirmación tras enviar a aprobación */}
      {confirmacion && (
        <ModalConfirmacionEnvio
          resumen={confirmacion}
          onCerrar={() => setConfirmacion(null)}
          onIrAHistorial={() => { setConfirmacion(null); setTab('historial') }}
        />
      )}
    </div>
  )
}

// ── Modal de confirmación del envío a aprobación ──────────────────────────────
// Se muestra al enviar el lote: confirma N cargos enviados a aprobación con el
// detalle del grupo (expediente + una línea por cargo) y permite descargar el
// PDF del expediente (on-demand del backend) o ir a Cargos Históricos.
function ModalConfirmacionEnvio({ resumen, onCerrar, onIrAHistorial }: {
  resumen: ResumenEnvio
  onCerrar: () => void
  onIrAHistorial: () => void
}) {
  const [descargando, setDescargando] = useState(false)
  const [errorPdf, setErrorPdf] = useState<string | null>(null)

  async function onDescargar() {
    setDescargando(true); setErrorPdf(null)
    try {
      await descargarPdfGrupo(resumen.expediente)
    } catch (err) {
      setErrorPdf(getApiErrorMessage(err))
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="bg-navy px-6 py-4 rounded-t-xl flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-sm">✓</span>
              <p className="text-white font-bold text-sm">Se enviaron {resumen.totalCargos} cargo(s) a aprobación</p>
            </div>
            <p className="text-white/60 text-xs mt-1">Expediente <span className="font-mono">{resumen.expediente || '(sin expediente)'}</span></p>
          </div>
          <button onClick={onCerrar} className="text-white/60 hover:text-white text-2xl leading-none mt-0.5">×</button>
        </div>

        <div className="px-6 py-4 overflow-y-auto">
          <p className="text-xs text-gray-500 mb-3">
            Cada cargo queda como solicitud pendiente hasta que el director la apruebe.
            Podés descargar el documento del expediente ahora o después desde el historial.
          </p>
          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-3 py-2 font-semibold">Hospital</th>
                  <th className="px-3 py-2 font-semibold">Carrera</th>
                  <th className="px-3 py-2 font-semibold">Puesto</th>
                  <th className="px-3 py-2 font-semibold">Especialidad</th>
                  <th className="px-3 py-2 font-semibold text-center">Cant.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resumen.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 text-gray-700">{item.hospitalSigla}</td>
                    <td className="px-3 py-2 text-gray-700">{item.escalafon}</td>
                    <td className="px-3 py-2 text-gray-800">{item.puesto}</td>
                    <td className="px-3 py-2 text-gray-500">{item.especialidad || '—'}</td>
                    <td className="px-3 py-2 text-center font-bold text-secondary">{item.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {errorPdf && <p className="mt-2 text-xs text-red-500">{errorPdf}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button onClick={onCerrar} className="btn-outline">Cerrar</button>
          <button onClick={onIrAHistorial} className="btn-outline">Ir a Cargos Históricos</button>
          <button onClick={onDescargar} disabled={descargando} className="btn-primary disabled:opacity-40">
            {descargando ? 'Generando...' : 'Descargar PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}

import { usePatchCargoSame } from '../hooks/useCargos'

// ── Celda inline para cargar/editar el código SAME de un cargo ───────────────
function CeldaCodigoSame({ cargoId, idSial }: { cargoId: string; idSial: string | null }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(idSial ?? '')
  const patch = usePatchCargoSame()

  // Si el idSial viene del servidor (tras invalidación) lo sincronizamos
  const valorMostrado = idSial ?? '—'

  async function guardar() {
    const v = valor.trim()
    if (!v || v === idSial) { setEditando(false); return }
    await patch.mutateAsync({ id: cargoId, codigoSame: v })
    setEditando(false)
  }

  if (editando) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          type="text"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') setEditando(false) }}
          className="h-7 px-2 border border-secondary rounded text-xs font-mono w-28 focus:outline-none focus:ring-1 focus:ring-secondary"
          placeholder="Ej: 12345678"
        />
        <button type="button" onClick={guardar} disabled={patch.isPending}
          className="text-xs px-2 py-1 rounded bg-secondary text-white hover:bg-secondary/80 disabled:opacity-40">
          {patch.isPending ? '...' : '✓'}
        </button>
        <button type="button" onClick={() => setEditando(false)}
          className="text-xs text-gray-400 hover:text-gray-600">✕</button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 group">
      <span className={`font-mono text-xs ${idSial ? 'text-gray-800 font-medium' : 'text-gray-300'}`}>
        {valorMostrado}
      </span>
      <button
        type="button"
        onClick={() => { setValor(idSial ?? ''); setEditando(true) }}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-1.5 py-0.5 rounded border border-gray-300 text-gray-500 hover:border-secondary hover:text-secondary"
      >
        {idSial ? 'Editar' : '+ Cargar'}
      </button>
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
    head: [['N°', 'Código', 'Hospital', 'Carrera', 'Puesto']],
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
  search, setSearch, filtroEstado, setFiltroEstado, solicitudes, esTransferencia = false,
}: {
  search: string
  setSearch: (v: string) => void
  filtroEstado: SolicitudAltaEstado | ''
  setFiltroEstado: (v: SolicitudAltaEstado | '') => void
  solicitudes: SolicitudAlta[]
  esTransferencia?: boolean
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
                <div><span className="text-gray-500">Carrera:</span> <span className="font-medium text-gray-800">{modalSolicitud.escalafon?.nombre ?? '—'}</span></div>
                <div><span className="text-gray-500">Cantidad:</span> <span className="font-medium text-gray-800">{modalSolicitud.cantidad}</span></div>
                <div><span className="text-gray-500">Desde:</span> <span className="font-medium text-gray-800">{modalSolicitud.desde ? modalSolicitud.desde.slice(0, 10) : '—'}</span></div>
                <div><span className="text-gray-500">Solicitado por:</span> <span className="font-medium text-gray-800">{modalSolicitud.solicitadoPor?.username ?? '—'}</span></div>
                {modalSolicitud.especialidad && (
                  <div className="col-span-2"><span className="text-gray-500">Especialidad:</span> <span className="font-medium text-gray-800">{modalSolicitud.especialidad}</span></div>
                )}
                {modalSolicitud.etiquetas && modalSolicitud.etiquetas.length > 0 && (
                  <div className="col-span-2 flex items-center gap-1.5 flex-wrap">
                    <span className="text-gray-500">Etiquetas:</span>
                    {modalSolicitud.etiquetas.map(({ etiqueta }) => (
                      <span
                        key={etiqueta.id}
                        className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: `${etiqueta.color ?? '#4b5563'}1a`,
                          color: etiqueta.color ?? '#4b5563',
                          borderColor: `${etiqueta.color ?? '#4b5563'}55`,
                        }}
                      >
                        {etiqueta.nombre}
                      </span>
                    ))}
                  </div>
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
        <input type="text" placeholder="Buscar por expediente o etiqueta..."
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
          No hay {esTransferencia ? 'transferencias' : 'solicitudes de alta'}{search ? ` para "${search}"` : ''}.
        </p>
      )}
    </div>
  )
}

// ── Cargos Históricos (Paso 3) ────────────────────────────────────────────────
// Vista AGRUPADA POR EXPEDIENTE del lote de creación: una fila por expediente
// (el grupo), con estado AGREGADO del grupo. SOLO LECTURA: únicas acciones son
// VER el detalle (expandir la fila → solicitudes del grupo con su estado
// individual; link al cargo /cargos/:id si ya existe) y DESCARGAR el PDF del
// grupo (reusa descargarPdfGrupo → GET /solicitudes-alta/grupo/pdf, el endpoint
// que ya existe). No hay editar/borrar/aprobar.
function CargosHistoricos({
  search, setSearch, filtroEstado, setFiltroEstado, solicitudes,
}: {
  search: string
  setSearch: (v: string) => void
  filtroEstado: SolicitudAltaEstado | ''
  setFiltroEstado: (v: SolicitudAltaEstado | '') => void
  solicitudes: SolicitudAlta[]
}) {
  const [expandido, setExpandido] = useState<string | null>(null)
  const [descargando, setDescargando] = useState<string | null>(null)
  const [errorPdf, setErrorPdf] = useState<string | null>(null)

  const grupos = agruparPorExpediente(solicitudes)

  async function onDescargar(g: GrupoExpediente) {
    if (!g.expediente) return
    setDescargando(g.expediente); setErrorPdf(null)
    try {
      await descargarPdfGrupo(g.expediente)
    } catch (err) {
      setErrorPdf(getApiErrorMessage(err))
    } finally {
      setDescargando(null)
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Filtros — la búsqueda por expediente se aplica aguas arriba (sobre las
          solicitudes); el filtro por estado filtra las solicitudes subyacentes
          que luego se agrupan. */}
      <div className="p-6 border-b border-gray-100 flex flex-wrap gap-3">
        <input type="text" placeholder="Buscar por expediente o etiqueta..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="h-10 px-3 border border-gray-300 rounded flex-1 min-w-[200px] focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary" />
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as SolicitudAltaEstado | '')}
          className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {errorPdf && <p className="px-6 pt-3 text-xs text-red-500">{errorPdf}</p>}

      {/* Tabla agrupada — una fila por expediente */}
      {grupos.length > 0 ? (
        <table className="w-full text-sm">
          <thead className="bg-navy text-white text-left sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 font-semibold rounded-tl-lg">Expediente</th>
              <th className="px-4 py-3 font-semibold">Fecha de creación</th>
              <th className="px-4 py-3 font-semibold">Solicitante</th>
              <th className="px-4 py-3 font-semibold text-center">Cargos</th>
              <th className="px-4 py-3 font-semibold">Etiquetas</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 rounded-tr-lg" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {grupos.map((g) => {
              const clave = g.expediente || '(sin-expediente)'
              const abierto = expandido === clave
              return (
                <Fragment key={clave}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-secondary max-w-[220px] truncate" title={g.expediente}>{g.expediente || '(sin expediente)'}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{g.createdAt.slice(0, 10)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{g.solicitante ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-secondary/10 text-secondary text-xs font-bold">{g.totalCargos}</span>
                    </td>
                    <td className="px-4 py-3"><EtiquetasChips etiquetas={etiquetasDeSolicitudes(g.solicitudes)} /></td>
                    <td className="px-4 py-3"><span className={`${ESTADO_GRUPO_BADGE[g.estado]} text-xs`}>{ESTADO_GRUPO_LABEL[g.estado]}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setExpandido(abierto ? null : clave)} className="btn-outline text-xs px-3 py-1">
                          {abierto ? 'Ocultar' : 'Ver detalle'}
                        </button>
                        <button onClick={() => onDescargar(g)} disabled={!g.expediente || descargando === g.expediente}
                          className="btn-primary text-xs px-3 py-1 disabled:opacity-40">
                          {descargando === g.expediente ? 'Generando...' : 'Descargar PDF'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {abierto && (
                    <tr className="bg-gray-50/60">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="overflow-x-auto border border-gray-100 rounded-lg bg-white">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 text-gray-600 text-left">
                              <tr>
                                <th className="px-3 py-2 font-semibold">Código de cargo</th>
                                <th className="px-3 py-2 font-semibold">Cód. SAME</th>
                                <th className="px-3 py-2 font-semibold">Tipo de alta</th>
                                <th className="px-3 py-2 font-semibold">Repartición</th>
                                <th className="px-3 py-2 font-semibold">Carrera</th>
                                <th className="px-3 py-2 font-semibold">Puesto</th>
                                <th className="px-3 py-2 font-semibold">Especialidad</th>
                                <th className="px-3 py-2 font-semibold">Etiquetas</th>
                                <th className="px-3 py-2 font-semibold">Desde</th>
                                <th className="px-3 py-2 font-semibold">Estado</th>
                                <th className="px-3 py-2 font-semibold">Concurso</th>
                                <th className="px-3 py-2" />
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {filasPorCargo(g.solicitudes).map((f) => (
                                <tr key={f.key}>
                                  <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">
                                    {f.codigo ?? <span className="text-gray-400 font-normal">Aún no creado</span>}
                                  </td>
                                  <td className="px-3 py-2">
                                    {f.cargoId
                                      ? <CeldaCodigoSame cargoId={f.cargoId} idSial={f.idSial} />
                                      : <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{f.tipoAlta}</td>
                                  <td className="px-3 py-2 text-gray-700">{f.hospital ?? '—'}</td>
                                  <td className="px-3 py-2 text-gray-700">{f.carrera ?? '—'}</td>
                                  <td className="px-3 py-2 text-gray-800">{f.puesto}</td>
                                  <td className="px-3 py-2 text-gray-700">{f.especialidad ?? '—'}</td>
                                  <td className="px-3 py-2"><EtiquetasChips etiquetas={f.etiquetas} /></td>
                                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{f.desde ? f.desde.slice(0, 10) : '—'}</td>
                                  <td className="px-3 py-2"><span className={`${ESTADO_BADGE[f.estado]} text-xs`}>{ESTADO_LABEL[f.estado]}</span></td>
                                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                                    {f.tipoConcurso === null ? '—' : f.tipoConcurso === 'sin_concurso' ? 'Sin concurso' : f.tipoConcurso === 'cph' ? 'CPH' : 'CEETPS'}
                                  </td>
                                  <td className="px-3 py-2">
                                    {/* Cargo real ya creado (solicitud aprobada) → Ver cargo; si tiene
                                        concurso, mismo destino que "Caratular" en Nuevos cargos. */}
                                    <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                                      {f.cargoId && (
                                        <Link to={`/cargos/${f.cargoId}`} className="text-secondary underline hover:text-secondary/80">Ver cargo</Link>
                                      )}
                                      {f.rutaConcurso && (
                                        <Link to={f.rutaConcurso} className="text-secondary underline hover:text-secondary/80">Ver concurso</Link>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      ) : (
        <p className="p-8 text-center text-sm text-gray-400">
          No hay cargos históricos{search ? ` para "${search}"` : ''}.
        </p>
      )}
    </div>
  )
}
