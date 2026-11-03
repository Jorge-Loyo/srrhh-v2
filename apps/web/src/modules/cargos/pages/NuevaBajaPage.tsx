import { useState, useEffect } from 'react'
import { useNavigate, Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import { useHospitales, useCodigosRegistro } from '@/shared/hooks/useCatalogos'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import { hospitalLabel } from '@/shared/lib/hospitalLabel'
import type { Baja, Cargo, CargoDetail, PaginatedResponse, TipoConcurso } from '@srrhh/types'
import {
  OPCIONES_ORIGEN, OPCIONES_MOTIVO_BAJA,
  CEETPS_CODIGOS, origenToMotivoConcurso,
  getPuestoOptions, getEspecialidadOptions,
} from '../lib/bajasHelpers'
import { useCadenaRetencion } from '@/modules/retenciones/hooks/useCadenaRetencion'
import { CadenaRetencionTree } from '@/modules/retenciones/components/CadenaRetencionTree'
import { SearchableSelect } from '@/shared/components/ui/SearchableSelect'
import { EtiquetasControl } from '@/shared/components/EtiquetasControl'

type Paso = 1 | 2 | 3

function ModalBuscarCargo({
  origen,
  onSeleccionar,
  onCerrar,
}: {
  origen: string
  onSeleccionar: (c: Cargo) => void
  onCerrar: () => void
}) {
  // Modo "Cobertura Dotación": se buscan cargos VACANTES (sin ocupante), que
  // siempre son POU. La carrera se elige entre los códigos de registro válidos
  // para estos concursos (37 y 23). No hay persona ni id_sial que buscar → se
  // ocultan los inputs de texto. Puesto (solo POU) y especialidad (cascada) son
  // desplegables.
  const esCobertura = origen === 'Cobertura Dotación'
  // Modo "Retención de Cargo": solo tiene sentido buscar personas en situación
  // de revista "retención de cargo", y el cargo siempre vigente. Por eso la
  // situación de revista queda fija y el filtro de estado del cargo se oculta.
  const esRetencion = origen === 'Retención de Cargo'

  const [hospitalId, setHospitalId] = useState('')
  const [codigoRegistroId, setCodigoRegistroId] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [situacionRevista, setSituacionRevista] = useState(esRetencion ? 'retencion de cargo' : '')
  const [busqueda, setBusqueda] = useState('')
  const [personaBusq, setPersonaBusq] = useState('')
  // Cobertura Dotación: puesto (POU) y especialidad en cascada.
  const [puestoCob, setPuestoCob] = useState('')
  const [especialidadCob, setEspecialidadCob] = useState('')
  // Cobertura Dotación: la carrera se elige entre los códigos válidos para
  // estos concursos (37 y 23). Default = 37.
  const [codigoCobertura, setCodigoCobertura] = useState('37')
  const { data: hospitales } = useHospitales()
  const { data: codigosRegistro } = useCodigosRegistro()

  // Códigos de registro válidos para Cobertura Dotación (37 y 23). El operador
  // elige cuál; el buscador trae vacantes del código seleccionado.
  const CODIGOS_COBERTURA = ['37', '23']
  const codigosRegCobertura = (codigosRegistro ?? []).filter((cr) => CODIGOS_COBERTURA.includes(cr.codigo))
  const codigoRegCoberturaSel = codigosRegCobertura.find((cr) => cr.codigo === codigoCobertura)
  // Puestos POU (guardia) para el desplegable de Cobertura Dotación.
  const puestosPou = getPuestoOptions('POU', '')
  const especialidadesCob = puestoCob ? getEspecialidadOptions(puestoCob) : []

  // ── Mapeos label↔id para los SearchableSelect (combobox con búsqueda) ──────
  // SearchableSelect trabaja con options: string[] (labels); para los campos
  // cuyo value es un id (Sigla→hospitalId, Carrera→codigoRegistroId) se pasan
  // displayToValue/valueToDisplay para traducir label↔id.
  const siglaOptions = (hospitales ?? []).map((h) => hospitalLabel(h))
  const hospitalIdToLabel = (id: string) => {
    const h = (hospitales ?? []).find((x) => x.id === id)
    return h ? hospitalLabel(h) : ''
  }
  const labelToHospitalId = (label: string) => {
    const h = (hospitales ?? []).find((x) => hospitalLabel(x) === label)
    return h?.id ?? ''
  }
  // Carrera (rama default): catálogo completo de códigos de registro.
  const carreraOptions = (codigosRegistro ?? []).map((cr) => `${cr.codigo} — ${cr.literal}`)
  const carreraIdToLabel = (id: string) => {
    const cr = (codigosRegistro ?? []).find((x) => x.id === id)
    return cr ? `${cr.codigo} — ${cr.literal}` : ''
  }
  const labelToCarreraId = (label: string) => {
    const cr = (codigosRegistro ?? []).find((x) => `${x.codigo} — ${x.literal}` === label)
    return cr?.id ?? ''
  }
  // Carrera (Cobertura): solo los códigos válidos 37/23; el value es el CÓDIGO.
  const coberturaCarreraOptions = CODIGOS_COBERTURA.map((cod) => {
    const cr = codigosRegCobertura.find((c) => c.codigo === cod)
    return cr?.literal ? `${cod} — ${cr.literal}` : cod
  })
  const coberturaCodigoToLabel = (cod: string) => {
    const cr = codigosRegCobertura.find((c) => c.codigo === cod)
    return cr?.literal ? `${cod} — ${cr.literal}` : cod
  }
  const coberturaLabelToCodigo = (label: string) => label.split(' — ')[0]

  const activoCobertura = !!(codigoRegCoberturaSel && (hospitalId || puestoCob || especialidadCob))
  const activoDefault = !!(hospitalId || codigoRegistroId || estadoFiltro || situacionRevista || busqueda.length >= 2 || personaBusq.length >= 2)
  const activo = esCobertura ? activoCobertura : activoDefault

  const { data, isLoading, isError } = useQuery({
    queryKey: esCobertura
      ? ['cargo-modal-baja-cobertura', hospitalId, codigoRegCoberturaSel?.id, puestoCob, especialidadCob]
      : ['cargo-modal-baja', hospitalId, codigoRegistroId, estadoFiltro, situacionRevista, busqueda, personaBusq],
    enabled: activo,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      if (esCobertura) {
        // Vacante = cargo vigente SIN ocupante (ocupado=false). Siempre POU +
        // código de registro elegido (37 o 23). Puesto/especialidad filtran
        // server-side.
        const res = await apiClient.get<PaginatedResponse<Cargo>>('/api/v1/cargos', {
          params: {
            limit: 40,
            estado: 'vigente',
            ocupado: 'false',
            ...(codigoRegCoberturaSel && { codigoRegistroId: codigoRegCoberturaSel.id }),
            ...(hospitalId && { hospitalId }),
            ...(puestoCob && { literalPuesto: puestoCob }),
            ...(especialidadCob && { especialidad: especialidadCob }),
          },
        })
        return res.data.data
      }
      const comunes = {
        ...(hospitalId && { hospitalId }),
        ...(codigoRegistroId && { codigoRegistroId }),
        ...(situacionRevista && { situacionRevista }),
        ...(busqueda.length >= 2 && { search: busqueda }),
        ...(personaBusq.length >= 2 && { personaSearch: personaBusq }),
      }
      // Retención de Cargo: el filtro de estado del cargo no se muestra; siempre
      // se traen cargos vigentes (es donde la persona retiene el cargo).
      if (esRetencion) {
        const res = await apiClient.get<PaginatedResponse<Cargo>>('/api/v1/cargos', {
          params: { limit: 40, estado: 'vigente', ...comunes },
        })
        return res.data.data
      }
      // Si el usuario eligió un estado, se consulta solo ese. Si no, se mantiene
      // el comportamiento por defecto: vigentes + en validación.
      if (estadoFiltro) {
        const res = await apiClient.get<PaginatedResponse<Cargo>>('/api/v1/cargos', {
          params: { limit: 40, estado: estadoFiltro, ...comunes },
        })
        return res.data.data
      }
      const [r1, r2] = await Promise.all([
        apiClient.get<PaginatedResponse<Cargo>>('/api/v1/cargos', {
          params: { limit: 30, estado: 'vigente', ...comunes },
        }),
        apiClient.get<PaginatedResponse<Cargo>>('/api/v1/cargos', {
          params: { limit: 10, estado: 'validacion_vacante', ...comunes },
        }),
      ])
      return [...r1.data.data, ...r2.data.data]
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-primary text-base font-bold text-gray-900">Buscar cargo</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {esCobertura
                ? 'Cargos vacantes POU (CPH 37 o 23) — filtrá por carrera, sigla, puesto y especialidad'
                : 'Filtrá por sigla, código, puesto, especialidad o persona'}
            </p>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-4 border-b border-gray-100 space-y-3">
          {esCobertura ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Sigla</label>
                  <SearchableSelect
                    value={hospitalId}
                    onChange={setHospitalId}
                    options={siglaOptions}
                    placeholder="Todas"
                    className="text-sm"
                    valueToDisplay={hospitalIdToLabel}
                    displayToValue={labelToHospitalId}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Carrera</label>
                  {/* Elegible entre los códigos válidos para estos concursos (37 y 23). */}
                  <SearchableSelect
                    value={codigoCobertura}
                    onChange={(v) => setCodigoCobertura(v || '37')}
                    options={coberturaCarreraOptions}
                    placeholder="Carrera"
                    className="text-sm"
                    valueToDisplay={coberturaCodigoToLabel}
                    displayToValue={coberturaLabelToCodigo}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Puesto (POU)</label>
                  <SearchableSelect
                    value={puestoCob}
                    onChange={(v) => { setPuestoCob(v); setEspecialidadCob('') }}
                    options={puestosPou}
                    placeholder="Todos"
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Especialidad</label>
                  <SearchableSelect
                    value={especialidadCob}
                    onChange={setEspecialidadCob}
                    options={especialidadesCob}
                    placeholder={puestoCob ? 'Todas' : 'Elegí un puesto primero'}
                    className="text-sm"
                    disabled={!puestoCob}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Sigla</label>
                  <SearchableSelect
                    value={hospitalId}
                    onChange={setHospitalId}
                    options={siglaOptions}
                    placeholder="Todas"
                    className="text-sm"
                    valueToDisplay={hospitalIdToLabel}
                    displayToValue={labelToHospitalId}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Carrera</label>
                  <SearchableSelect
                    value={codigoRegistroId}
                    onChange={setCodigoRegistroId}
                    options={carreraOptions}
                    placeholder="Todas"
                    className="text-sm"
                    valueToDisplay={carreraIdToLabel}
                    displayToValue={labelToCarreraId}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input autoFocus type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Código, ID SIAL, puesto, especialidad..." className="input h-9 w-full text-sm" />
                <input type="text" value={personaBusq} onChange={(e) => setPersonaBusq(e.target.value)} placeholder="Nombre o CUIL de la persona..." className="input h-9 w-full text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* En Retención de Cargo el estado del cargo no se elige: siempre vigente. */}
                {!esRetencion && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Estado del cargo</label>
                    <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} className="input h-9 w-full text-sm">
                      <option value="">Vigentes + en validación</option>
                      <option value="vigente">Vigente</option>
                      <option value="validacion_vacante">En validación</option>
                      <option value="no_vigente">No vigente</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Estado de la persona en el puesto</label>
                  {/* En Retención de Cargo queda fija en "retención de cargo" (única opción posible). */}
                  <select
                    value={situacionRevista}
                    onChange={(e) => setSituacionRevista(e.target.value)}
                    disabled={esRetencion}
                    className="input h-9 w-full text-sm disabled:bg-gray-50 disabled:text-gray-600 disabled:cursor-not-allowed"
                  >
                    {!esRetencion && <option value="">Todos</option>}
                    {!esRetencion && <option value="activo">Activo</option>}
                    {!esRetencion && <option value="comision">Comisión</option>}
                    <option value="retencion de cargo">Retención de cargo</option>
                  </select>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {!activo && (
            <p className="p-6 text-sm text-gray-400 text-center">
              {esCobertura
                ? 'Seleccioná una sigla, un puesto o una especialidad'
                : 'Seleccioná una sigla o escribí al menos 2 caracteres'}
            </p>
          )}
          {activo && isLoading && <p className="p-6 text-sm text-gray-400 text-center">Buscando...</p>}
          {activo && !isLoading && isError && (
            <p className="p-6 text-sm text-danger text-center">
              Ocurrió un error al buscar cargos. Reintentá; si persiste, avisá al equipo técnico.
            </p>
          )}
          {activo && !isLoading && !isError && (data?.length ?? 0) === 0 && <p className="p-6 text-sm text-gray-400 text-center">Sin resultados.</p>}
          {activo && !isLoading && !isError && (data?.length ?? 0) > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">Código</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">ID SIAL Rol</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Sigla</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Puesto</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Especialidad</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Persona</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.map((c) => (
                  <tr key={c.id} onClick={() => onSeleccionar(c)} className="cursor-pointer hover:bg-blue-50 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-700 whitespace-nowrap">{c.codigo ?? '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-600 whitespace-nowrap">{c.idSial ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{c.hospital?.sigla ?? '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-800 max-w-[220px]">
                      <span className="font-medium leading-tight line-clamp-2">{c.literalPuesto ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[140px]">
                      {c.especialidadPuesto?.nombre ?? c.especialidadLegacy ?? c.especialidad ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[160px]">
                      {c.personaOcupante ? c.personaOcupante.apellidoNombre : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {(() => {
                        if (c.estado === 'validacion_vacante') {
                          return <span className="badge-warning">En validación</span>
                        }
                        // Lee el sub-estado persistido; fallback transitorio a la
                        // ocupación mientras el backfill no haya corrido (ver D4).
                        const sub = c.subEstado ?? (c.ocupado ? 'ocupado' : 'vacante')
                        const label = sub === 'ocupado' ? 'Ocupado' : sub === 'concurso' ? 'Concurso' : 'Vacante'
                        const cls = sub === 'ocupado' ? 'badge-success' : sub === 'concurso' ? 'badge-info' : 'badge-warning'
                        return <span className={cls}>{label}</span>
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ── helpers UI ───────────────────────────────────────────────────────────────
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}{required && <span className="text-danger ml-0.5">*</span>}</label>
      {children}
    </div>
  )
}

function ReadonlyInput({ value, placeholder }: { value: string; placeholder?: string }) {
  return (
    <input
      type="text"
      readOnly
      value={value}
      placeholder={placeholder ?? 'Se completa al seleccionar cargo'}
      className="input h-10 w-full bg-gray-50 text-gray-600"
    />
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-navy uppercase tracking-wide mb-3 pb-1 border-b border-gray-100">{title}</h3>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-gray-500 w-40 shrink-0">{label}:</span>
      <span className="text-gray-800 font-medium">{value || '—'}</span>
    </div>
  )
}

// ── Derivar campos desde CargoDetail ─────────────────────────────────────────
function derivarDesdeCargo(det: CargoDetail) {
  const persona = det.ocupacionActual?.persona ?? det.historial?.[0]?.persona ?? null
  const escalafon = det.codigoRegistro?.literal ?? det.escalafon?.nombre ?? ''
  const codigo = (det.codigo ?? '').toUpperCase()
  const uni = (det.unificadorPuesto ?? '').toLowerCase()
  const pouPof = codigo.includes('POF') ? 'POF'
    : codigo.includes('POU') ? 'POU'
    : uni.includes('planta') ? 'POF'
    : uni.includes('guardia') ? 'POU'
    : ''
  return {
    cuil: persona?.cuil ?? '',
    nombreApellido: persona?.apellidoNombre ?? '',
    codigoRegistro: det.codigoRegistro?.codigo ?? '37',
    escalafon,
    pouPof,
    puesto: det.literalPuesto ?? '',
    especialidad: det.especialidadPuesto?.nombre ?? det.especialidadLegacy ?? det.especialidad ?? '',
  }
}

// ── Página principal ──────────────────────────────────────────────────────────
export function NuevaBajaPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const { bajaId } = useParams<{ bajaId?: string }>()
  const modoEdicion = !!bajaId
  const sinConcurso = searchParams.get('sinConcurso') === '1'

  // ── wizard ──
  const [paso, setPaso] = useState<Paso>(1)

  // ── cargo seleccionado ──
  const [cargo, setCargo] = useState<CargoDetail | null>(null)
  const [cargandoCargo, setCargandoCargo] = useState(false)
  const [modalAbierto, setModalAbierto] = useState(false)

  // S18-8: alerta de cascada — si el cargo forma parte de una cadena de
  // retención activa, avisar antes de confirmar la baja
  const { data: cadenaRetencion } = useCadenaRetencion(cargo?.id, paso === 3)

  // ── campos derivados del cargo (readonly) ──
  const [cuil, setCuil] = useState('')
  const [nombreApellido, setNombreApellido] = useState('')
  const [codigoRegistro, setCodigoRegistro] = useState('37')
  const [escalafon, setEscalfon] = useState('')
  const [pouPof, setPouPof] = useState('')
  const [puesto, setPuesto] = useState('')
  const [especialidad, setEspecialidad] = useState('')
  // Si el cargo trajo la especialidad VACÍA pero hay un puesto, el usuario
  // puede elegir una especialidad entre las disponibles para ese puesto. Si el
  // cargo ya trae especialidad, el campo queda readonly (no se pisa lo del
  // cargo). El flag se fija al aplicar el cargo (no depende del valor actual
  // de `especialidad`), para que el campo siga editable después de elegir.
  const [especialidadVinoDelCargo, setEspecialidadVinoDelCargo] = useState(false)
  const especialidadesDisponibles = puesto ? getEspecialidadOptions(puesto) : []
  const especialidadEditable = !especialidadVinoDelCargo && !!puesto && especialidadesDisponibles.length > 0

  // ── campos editables ──
  // Origen puede venir fijado por el modal "Gestión de Cargos" (query ?origen=...).
  // Si viene, se inicializa con ese valor y el dropdown queda bloqueado.
  const origenFijado = searchParams.get('origen') ?? ''
  const [origen, setOrigen] = useState(origenFijado)
  const [exBaja, setExBaja] = useState('')
  const [partida, setPartida] = useState('')
  const [fechaBaja, setFechaBaja] = useState('')   // siempre ISO yyyy-mm-dd en el input
  const [cargaHoraria, setCargaHoraria] = useState('')
  const [motivo, setMotivo] = useState('')
  const [docRespaldatoria, setDocRespaldatoria] = useState('')
  const [fechaPaseParalelo, setFechaPaseParalelo] = useState('')  // ISO
  const [observaciones, setObservaciones] = useState('')

  // ── paso 2 ──
  const [generaConcurso, setGeneraConcurso] = useState<boolean | null>(null)
  const [tipoConcursoSeleccionado, setTipoConcursoSeleccionado] = useState<TipoConcurso>('cph' as TipoConcurso)

  // ── UI ──
  const [guardando, setGuardando] = useState(false)
  const [guardadoOk, setGuardadoOk] = useState(false)
  const [error, setError] = useState('')

  // Campos diferidos: Doc. respaldatoria y Fecha pase paralelo/GT pueden quedar
  // pendientes. Si al avanzar/guardar alguno está vacío, se pide confirmación
  // previa y, si el usuario acepta, se ejecuta la acción diferida guardada acá.
  const [avisoDiferidos, setAvisoDiferidos] = useState<null | (() => void)>(null)
  const hayCamposDiferidosPendientes = !docRespaldatoria || !fechaPaseParalelo
  // Ejecuta `accion` directo si no hay pendientes; si los hay, muestra el aviso.
  function conAvisoDiferidos(accion: () => void) {
    if (hayCamposDiferidosPendientes) {
      setAvisoDiferidos(() => accion)
    } else {
      accion()
    }
  }

  // ── cargar baja existente (modo edición) ──
  const { data: bajaExistente } = useQuery({
    queryKey: ['baja-editar', bajaId],
    enabled: modoEdicion,
    queryFn: async () => {
      const res = await apiClient.get<{ data: Baja }>(`/api/v1/bajas/${bajaId}`)
      return res.data.data
    },
  })

  useEffect(() => {
    if (!bajaExistente) return
    setOrigen(bajaExistente.tipificadorOrigen ?? '')
    setExBaja(bajaExistente.eeBaja ?? '')
    setPartida(bajaExistente.partidaPresupuestaria ?? '')
    setDocRespaldatoria(bajaExistente.docRespaldatoria ?? '')
    setMotivo(bajaExistente.motivo ?? '')
    setObservaciones(bajaExistente.observaciones ?? '')
    if (bajaExistente.fechaBaja) {
      // fechaBaja viene como ISO string desde la API
      setFechaBaja(bajaExistente.fechaBaja.slice(0, 10))
    }
    if (bajaExistente.fechaPaseParalelo) {
      setFechaPaseParalelo(bajaExistente.fechaPaseParalelo.slice(0, 10))
    }
    if ((bajaExistente as any).cargaHoraria) {
      setCargaHoraria(String((bajaExistente as any).cargaHoraria))
    }
    // Restaurar decisión genera_concurso del borrador
    if (typeof bajaExistente.generaConcurso === 'boolean') {
      setGeneraConcurso(bajaExistente.generaConcurso)
    }
    if (bajaExistente.cargoId) {
      setCargandoCargo(true)
      apiClient.get<{ data: CargoDetail }>(`/api/v1/cargos/${bajaExistente.cargoId}`)
        .then((res) => aplicarCargo(res.data.data))
        .finally(() => setCargandoCargo(false))
    }
  }, [bajaExistente])

  // Si el origen vino fijado por el modal "Gestión de Cargos", aplicar su lógica
  // (ej. "Cobertura Dotación" fuerza el motivo) una sola vez al montar.
  useEffect(() => {
    if (origenFijado) handleOrigenChange(origenFijado)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const codigoNum = Number(codigoRegistro)
  const esCeetps = CEETPS_CODIGOS.includes(codigoNum)
  // Origen "Retención de Cargo": label de fecha y motivo fijo/bloqueado.
  const esRetencion = origen === 'Retención de Cargo'

  // Refresca solo las etiquetas del cargo tras asignar/quitar una, sin pisar los
  // campos derivados (algunos editables como CUIL/nombre en alta manual).
  async function refrescarEtiquetasCargo() {
    if (!cargo) return
    try {
      const res = await apiClient.get<{ data: CargoDetail }>(`/api/v1/cargos/${cargo.id}`)
      const det = res.data.data
      setCargo((prev) => (prev ? { ...prev, etiquetas: det.etiquetas ?? [] } : prev))
    } catch {
      // Silencioso: el EtiquetasControl ya muestra su propio toast en error de
      // asignación/quita; un fallo de refresco no debe bloquear el formulario.
    }
  }

  function aplicarCargo(det: CargoDetail) {
    const d = derivarDesdeCargo(det)
    setCargo(det)
    setCuil(d.cuil)
    setNombreApellido(d.nombreApellido)
    setCodigoRegistro(d.codigoRegistro)
    setEscalfon(d.escalafon)
    setPouPof(d.pouPof)
    setPuesto(d.puesto)
    setEspecialidad(d.especialidad)
    // Si el cargo trajo especialidad, el campo queda readonly; si vino vacía,
    // habilitamos la edición (elegir entre las especialidades del puesto).
    setEspecialidadVinoDelCargo(!!d.especialidad)
  }

  async function seleccionarCargo(c: Cargo) {
    setModalAbierto(false)
    setCargandoCargo(true)
    setError('')
    try {
      const res = await apiClient.get<{ data: CargoDetail }>(`/api/v1/cargos/${c.id}`)
      const det = res.data.data
      if (!det || !det.id) {
        setError(`Respuesta inesperada del servidor al cargar cargo ${c.id}`)
        return
      }
      aplicarCargo(det)
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? 'Error desconocido'
      setError(`No se pudo cargar el cargo: ${msg}`)
    } finally {
      setCargandoCargo(false)
    }
  }

  function handleOrigenChange(v: string) {
    setOrigen(v)
    if (v === 'Cobertura Dotación') {
      setNombreApellido('')
      setCuil('')
      setPartida('')
      setDocRespaldatoria('')
      setMotivo('Cobertura Dotación')
    }
    // Retención de Cargo: el motivo queda fijo y bloqueado en 'Retención de
    // Cargo' (mismo patrón que Cobertura Dotación, pero solo fija el motivo).
    if (v === 'Retención de Cargo') {
      setMotivo('Retención de Cargo')
    }
  }

  const paso1Valido = !!(cargo && fechaBaja && motivo && origen)
  function avanzar() {
    if (sinConcurso) {
      setGeneraConcurso(false)
      setPaso(3)
    } else {
      setPaso(2)
    }
  }

  // ── body compartido para POST/PATCH ──
  function buildBody(conConcurso: boolean): Record<string, unknown> {
    return {
      cargoId: cargo!.id,
      hospitalId: cargo!.hospitalId,
      personaId: cargo!.ocupacionActual?.personaId ?? cargo!.historial?.[0]?.personaId ?? undefined,
      fechaBaja: fechaBaja || undefined,
      motivo: motivo || undefined,
      tipoBaja: motivo || undefined,
      tipificadorOrigen: origen || undefined,
      eeBaja: exBaja || undefined,
      partida: partida || undefined,
      docRespaldatoria: docRespaldatoria || undefined,
      fechaPaseParalelo: fechaPaseParalelo || undefined,
      cargaHoraria: cargaHoraria ? Number(cargaHoraria) : undefined,
      observaciones: observaciones || undefined,
      generaConcurso: conConcurso,
      ...(conConcurso && {
        tipoConcurso: tipoConcursoSeleccionado,
        // Propaga el tipo elegido en "Origen" al concurso que se genera.
        motivoConcurso: origenToMotivoConcurso(origen),
      }),
    }
  }

  const mutCrear = useMutation({
    mutationFn: async (conConcurso: boolean) => {
      const body = buildBody(conConcurso)
      if (modoEdicion) {
        // Sale del borrador → confirmada directamente
        const res = await apiClient.patch<{ data: Baja }>(`/api/v1/bajas/${bajaId}`, { ...body, estado: 'confirmada' })
        return res.data.data
      }
      const res = await apiClient.post<{ data: Baja }>('/api/v1/bajas', body)
      return res.data.data
    },
  })

  const mutBorrador = useMutation({
    mutationFn: async () => {
      // Borrador: solo datos del paso 1, sin tocar generaConcurso ni tipoConcurso
      // El usuario todavía no decidió si genera concurso (eso es paso 2)
      const body: Record<string, unknown> = {
        cargoId: cargo!.id,
        hospitalId: cargo!.hospitalId,
        personaId: cargo!.ocupacionActual?.personaId ?? cargo!.historial?.[0]?.personaId ?? undefined,
        fechaBaja: fechaBaja || undefined,
        motivo: motivo || undefined,
        tipoBaja: motivo || undefined,
        tipificadorOrigen: origen || undefined,
        eeBaja: exBaja || undefined,
        partida: partida || undefined,
        docRespaldatoria: docRespaldatoria || undefined,
        fechaPaseParalelo: fechaPaseParalelo || undefined,
        cargaHoraria: cargaHoraria ? Number(cargaHoraria) : undefined,
        observaciones: observaciones || undefined,
        estado: 'resolucion_a_la_firma',
        // Si ya pasó por paso 2 y decidió, preservar la decisión
        ...(generaConcurso !== null && {
          generaConcurso,
          ...(generaConcurso && {
            tipoConcurso: tipoConcursoSeleccionado,
            motivoConcurso: origenToMotivoConcurso(origen),
          }),
        }),
      }
      if (modoEdicion) {
        const res = await apiClient.patch<{ data: Baja }>(`/api/v1/bajas/${bajaId}`, body)
        return res.data.data
      }
      const res = await apiClient.post<{ data: Baja }>('/api/v1/bajas', body)
      return res.data.data
    },
  })

  async function guardarBorrador() {
    if (!cargo) return
    setGuardando(true); setError(''); setGuardadoOk(false)
    try {
      const baja = await mutBorrador.mutateAsync()
      setGuardadoOk(true)
      setTimeout(() => setGuardadoOk(false), 3000)
      if (!modoEdicion) {
        const qs = sinConcurso ? '?sinConcurso=1' : ''
        navigate(`/cargos/baja/${baja.id}/editar${qs}`)
      }
    } catch {
      setError('No se pudo guardar el borrador.')
    } finally {
      setGuardando(false)
    }
  }

  // Anular borrador: solo disponible en modo edición sobre una baja en
  // 'resolucion_a_la_firma'. Lleva la baja a 'anulada' sin tocar el cargo.
  const puedeAnular = modoEdicion && (bajaExistente?.estado as string | undefined) === 'resolucion_a_la_firma'

  const mutAnular = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ data: Baja }>(`/api/v1/bajas/${bajaId}/anular`)
      return res.data.data
    },
  })

  async function anular() {
    if (!bajaId) return
    if (!window.confirm('¿Anular esta baja? El borrador quedará anulado y el cargo no se modifica.')) return
    setGuardando(true); setError('')
    try {
      await mutAnular.mutateAsync()
      queryClient.invalidateQueries({ queryKey: ['bajas'] })
      navigate('/cargos/alta-por-baja')
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? ''
      setError(msg || 'No se pudo anular la baja. Intentá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  async function confirmar(conConcurso: boolean) {
    if (!cargo) return
    setGuardando(true); setError('')
    try {
      const baja = await mutCrear.mutateAsync(conConcurso)
      if (conConcurso) {
        const res = await apiClient.get<{ data: { id: string }[] }>('/api/v1/concursos-cph', {
          params: { cargoId: baja.cargoId, limit: 1 },
        })
        const id = res.data.data[0]?.id
        navigate(id ? `/concursos/cph/${id}/wizard` : '/concursos/cph')
      } else {
        navigate(sinConcurso ? '/cargos/baja' : '/cargos/alta-por-baja')
      }
    } catch (e: any) {
      const status = e?.response?.status
      const msg = e?.response?.data?.message ?? e?.message ?? ''
      // 409: ya existe concurso abierto para este cargo — ir directo a él
      if (status === 409 && conConcurso && cargo) {
        try {
          const res = await apiClient.get<{ data: { id: string }[] }>('/api/v1/concursos-cph', {
            params: { cargoId: cargo.id, limit: 1 },
          })
          const id = res.data.data[0]?.id
          if (id) { navigate(`/concursos/cph/${id}/wizard`); return }
        } catch { /* ignorar, mostrar error abajo */ }
      }
      setError(msg || 'No se pudo registrar la baja. Intentá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  const volverUrl = sinConcurso ? '/cargos/baja' : '/cargos/alta-por-baja'

  return (
    <>
      {modalAbierto && (
        <ModalBuscarCargo
          origen={origen}
          onSeleccionar={seleccionarCargo}
          onCerrar={() => setModalAbierto(false)}
        />
      )}

      {/* Aviso previo — campos diferidos pendientes (Doc. respaldatoria / Fecha
          pase paralelo). Al confirmar se ejecuta la acción diferida guardada. */}
      {avisoDiferidos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAvisoDiferidos(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-start gap-3">
              <span className="text-xl">⚠️</span>
              <h2 className="font-primary text-base font-bold text-gray-900">Datos pendientes de completar</h2>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-600">
                Doc. respaldatoria y/o Fecha pase paralelo quedarán pendientes de completar. Podés
                cargarlos después desde la lista de bajas. ¿Continuar?
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
              <button className="btn-outline" onClick={() => setAvisoDiferidos(null)}>Cancelar</button>
              <button
                className="btn-primary"
                onClick={() => {
                  const accion = avisoDiferidos
                  setAvisoDiferidos(null)
                  accion()
                }}
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto space-y-6">
        {/* breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link to={volverUrl} className="text-secondary hover:underline">
            ← {sinConcurso ? 'Baja de Cargos' : 'Alta por Baja'}
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-500">{modoEdicion ? 'Editar Baja' : 'Nueva Baja'}</span>
        </div>

        {/* stepper */}
        <div className="flex items-center">
          {(sinConcurso
            ? ['Datos de la baja', 'Confirmación']
            : ['Datos de la baja', '¿Genera concurso?', 'Confirmación']
          ).map((label, i, arr) => {
            // mapear índice visual al paso real
            const pasoReal: Paso = sinConcurso
              ? ([1, 3] as Paso[])[i]
              : ([1, 2, 3] as Paso[])[i]
            const activo = paso === pasoReal
            const completo = paso > pasoReal
            return (
              <div key={label} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className={[
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors',
                    activo ? 'bg-navy text-white border-navy' : completo ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-400 border-gray-300',
                  ].join(' ')}>
                    {completo ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs mt-1 text-center leading-tight ${activo ? 'font-bold text-navy' : 'text-gray-400'}`}>{label}</span>
                </div>
                {i < arr.length - 1 && <div className={`h-0.5 flex-1 mb-5 ${completo ? 'bg-green-400' : 'bg-gray-200'}`} />}
              </div>
            )
          })}
        </div>

        {/* ── PASO 1 ── */}
        {paso === 1 && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h1 className="font-primary text-lg font-bold text-gray-900">
                {modoEdicion ? 'Editar baja' : 'Datos de la baja'}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">Completá todos los campos del formulario</p>
            </div>

            <div className="p-6 space-y-6">
              {/* Identificación */}
              <Section title="Identificación">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Origen" required>
                    <select
                      value={origen}
                      onChange={(e) => handleOrigenChange(e.target.value)}
                      disabled={!!origenFijado || modoEdicion}
                      className="input h-10 w-full disabled:bg-gray-100 disabled:text-gray-600 disabled:cursor-not-allowed"
                    >
                      <option value="">Seleccioná...</option>
                      {OPCIONES_ORIGEN.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="EX Baja">
                    <input
                      type="text"
                      value={exBaja}
                      onChange={(e) => setExBaja(e.target.value)}
                      placeholder="EX-2026-12345678-GCABA-HGAP"
                      className="input h-10 w-full font-mono text-sm"
                    />
                  </Field>
                </div>
              </Section>

              {/* Cargo */}
              <Section title="Cargo">
                {cargandoCargo ? (
                  <div className="h-10 border border-gray-200 rounded-lg px-4 flex items-center text-sm text-gray-400">
                    Cargando datos del cargo...
                  </div>
                ) : cargo ? (
                  <div className="flex items-start gap-3 border border-gray-200 rounded-lg px-4 py-3 bg-gray-50">
                    <div className="flex-1">
                      <span className="font-mono text-sm font-bold text-gray-800">{cargo.codigo}</span>
                      <span className="text-gray-400 mx-2">·</span>
                      <span className="text-sm text-gray-600">
                        {cargo.hospital?.sigla} — {cargo.literalPuesto}
                        {cargo.especialidad ? ` · ${cargo.especialidad}` : ''}
                      </span>
                      {(() => {
                        const p = cargo.ocupacionActual?.persona ?? cargo.historial?.[0]?.persona
                        return p ? (
                          <p className="text-xs text-gray-400 mt-1">
                            {cargo.estado === 'validacion_vacante' && (
                              <span className="badge-warning text-[10px] mr-1">En validación</span>
                            )}
                            Último ocupante: <span className="font-medium text-gray-600">{p.apellidoNombre}</span> · {p.cuil}
                          </p>
                        ) : null
                      })()}
                    </div>
                    <button onClick={() => setModalAbierto(true)} className="text-xs text-secondary hover:underline shrink-0 mt-0.5">
                      Cambiar
                    </button>
                  </div>
                ) : null}

                {/* Etiquetas del cargo — disponibles en cualquier formulario que
                    gestione un cargo. Solo se muestran cuando hay un cargo
                    seleccionado. */}
                {cargo && !cargandoCargo && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-gray-500">Etiquetas:</span>
                    <EtiquetasControl
                      entidad="cargo"
                      entidadId={cargo.id}
                      asignadas={cargo.etiquetas ?? []}
                      onCambio={refrescarEtiquetasCargo}
                    />
                  </div>
                )}

                {!cargandoCargo && !cargo && (
                  <button
                    type="button"
                    onClick={() => setModalAbierto(true)}
                    className="w-full h-10 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-400 hover:border-secondary hover:text-secondary transition-colors"
                  >
                    + Asignar cargo de baja
                  </button>
                )}
              </Section>

              {/* Datos funcionales */}
              <Section title="Datos funcionales">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Field label="CUIL">
                    <input
                      type="text"
                      value={cuil}
                      readOnly={!!cargo}
                      onChange={(e) => setCuil(e.target.value.replace(/\D/g, '').slice(0, 11))}
                      placeholder="20123456789"
                      className={`input h-10 w-full ${cargo ? 'bg-gray-50 text-gray-600' : ''}`}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Apellido y Nombre">
                      <input
                        type="text"
                        value={nombreApellido}
                        readOnly={!!cargo}
                        onChange={(e) => setNombreApellido(e.target.value)}
                        className={`input h-10 w-full ${cargo ? 'bg-gray-50 text-gray-600' : ''}`}
                      />
                    </Field>
                  </div>
                  <Field label="Código de registro">
                    <ReadonlyInput value={codigoRegistro} />
                  </Field>
                  <Field label="Carrera">
                    <ReadonlyInput value={escalafon} />
                  </Field>
                  <Field label="POU/POF">
                    <ReadonlyInput value={pouPof} />
                  </Field>
                  <Field label="Puesto" required>
                    <ReadonlyInput value={puesto} />
                  </Field>
                  <Field label="Especialidad">
                    {/* Si el cargo trae la especialidad cargada → readonly (se
                        respeta lo que vino del cargo). Si viene VACÍA y hay
                        puesto, el usuario puede elegir entre las especialidades
                        disponibles para ese puesto. */}
                    {especialidadEditable ? (
                      <SearchableSelect
                        value={especialidad}
                        onChange={setEspecialidad}
                        options={especialidadesDisponibles}
                        placeholder="Elegí una especialidad"
                        className="text-sm"
                      />
                    ) : (
                      <ReadonlyInput value={especialidad} />
                    )}
                  </Field>
                  <Field label="Partida presupuestaria">
                    <input
                      type="text"
                      value={partida}
                      onChange={(e) => setPartida(e.target.value)}
                      disabled={['Ampliación', 'Cobertura Dotación'].includes(origen)}
                      className="input h-10 w-full"
                    />
                  </Field>
                </div>
              </Section>

              {/* Fechas */}
              <Section title="Fechas y expediente">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Field label={esRetencion ? 'Fecha de retención' : 'Fecha de baja'} required>
                    <input
                      type="date"
                      value={fechaBaja}
                      onChange={(e) => setFechaBaja(e.target.value)}
                      className="input h-10 w-full"
                    />
                  </Field>
                  <Field label="Carga horaria">
                    <input
                      type="text"
                      value={cargaHoraria}
                      onChange={(e) => setCargaHoraria(e.target.value.replace(/\D/g, '').slice(0, 2))}
                      placeholder="30"
                      className="input h-10 w-full"
                    />
                  </Field>
                  <Field label="Motivo" required>
                    <select
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      disabled={esRetencion || ['Cobertura Dotación', 'Ampliación', 'POU a POF'].includes(origen)}
                      className="input h-10 w-full disabled:bg-gray-100 disabled:text-gray-600 disabled:cursor-not-allowed"
                    >
                      <option value="">Seleccioná...</option>
                      {OPCIONES_MOTIVO_BAJA.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </Field>
                  {origen !== 'Cobertura Dotación' && (
                    <Field label="Doc. respaldatoria">
                      <input
                        type="text"
                        value={docRespaldatoria}
                        onChange={(e) => setDocRespaldatoria(e.target.value.replace(/\s/g, ''))}
                        className="input h-10 w-full"
                      />
                    </Field>
                  )}
                  <Field label="Fecha pase paralelo / GT">
                    <input
                      type="date"
                      value={fechaPaseParalelo}
                      onChange={(e) => setFechaPaseParalelo(e.target.value)}
                      className="input h-10 w-full"
                    />
                  </Field>
                </div>
              </Section>

              {/* Observaciones */}
              <Field label="Observaciones">
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={2}
                  placeholder="Notas adicionales..."
                  className="input w-full py-2"
                />
              </Field>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {puedeAnular && (
                  <button
                    type="button"
                    disabled={guardando}
                    onClick={anular}
                    className="px-4 h-10 rounded-lg border-2 border-danger text-danger text-sm font-semibold hover:bg-danger hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Anular baja
                  </button>
                )}
                <p className="text-xs text-gray-400">
                  {[!cargo && 'Asigná un cargo', !fechaBaja && 'Completá la fecha', !motivo && 'Seleccioná un motivo'].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {guardadoOk && <span className="text-sm text-green-600 font-medium">✓ Guardado</span>}
                {error && <span className="text-sm text-danger">{error}</span>}
                {modoEdicion && (
                  <button className="btn-outline" onClick={() => navigate(volverUrl)}>← Volver</button>
                )}
                <button className="btn-outline" disabled={!cargo || guardando} onClick={() => conAvisoDiferidos(guardarBorrador)}>
                  {guardando ? 'Guardando...' : 'Guardar borrador'}
                </button>
                <button className="btn-primary" disabled={!paso1Valido} onClick={() => conAvisoDiferidos(avanzar)}>
                  Continuar →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── PASO 2 ── */}
        {paso === 2 && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-primary text-lg font-bold text-gray-900">¿Esta baja genera concurso?</h2>
              {cargo && (
                <p className="text-sm text-gray-500 mt-0.5">
                  Cargo <strong className="font-mono">{cargo.codigo}</strong> — {cargo.hospital?.sigla} · {cargo.literalPuesto}
                </p>
              )}
            </div>
            <div className="p-6 space-y-3">
              {[
                { val: true,  titulo: 'Sí, genera concurso CPH', desc: `Se registra la baja y se abre el seguimiento del concurso para el cargo ${cargo?.codigo ?? ''}.` },
                { val: false, titulo: 'No, solo registrar la baja', desc: 'La baja queda registrada sin generar concurso. El cargo pasa a no vigente.' },
              ].map(({ val, titulo, desc }) => (
                <button
                  key={String(val)}
                  type="button"
                  onClick={() => setGeneraConcurso(val)}
                  className={[
                    'w-full text-left p-4 rounded-lg border-2 transition-colors',
                    generaConcurso === val
                      ? val ? 'border-secondary bg-blue-50' : 'border-gray-500 bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
                  ].join(' ')}
                >
                  <div className="flex items-start gap-3">
                    <span className={[
                      'w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center',
                      generaConcurso === val
                        ? val ? 'border-secondary bg-secondary' : 'border-gray-600 bg-gray-600'
                        : 'border-gray-300',
                    ].join(' ')}>
                      {generaConcurso === val && <span className="w-2 h-2 rounded-full bg-white" />}
                    </span>
                    <div>
                      <p className="font-semibold text-gray-900">{titulo}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
                    </div>
                  </div>
                </button>
              ))}
              {generaConcurso === true && (
                <div className="mt-2 pl-2">
                  <label className="label text-xs">Tipo de concurso</label>
                  <div className="flex gap-3 mt-1">
                    {(['cph', 'ceetps'] as TipoConcurso[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTipoConcursoSeleccionado(t)}
                        className={[
                          'px-4 py-2 rounded-lg border-2 text-sm font-semibold transition-colors uppercase',
                          tipoConcursoSeleccionado === t
                            ? 'border-secondary bg-secondary text-white'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300',
                        ].join(' ')}
                      >
                        {t.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <button className="btn-outline" onClick={() => setPaso(1)}>← Volver</button>
              <button className="btn-primary" disabled={generaConcurso === null} onClick={() => setPaso(3)}>
                Continuar →
              </button>
            </div>
          </div>
        )}

        {/* ── PASO 3 ── */}
        {paso === 3 && cargo && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-primary text-lg font-bold text-gray-900">Confirmación</h2>
              <p className="text-sm text-gray-500 mt-0.5">Revisá los datos antes de registrar</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-navy text-white rounded-lg px-4 py-3 flex items-center gap-3">
                <span className="text-2xl">📋</span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Cargo</p>
                  <p className="font-mono text-lg font-bold tracking-wider">{cargo.codigo}</p>
                  <p className="text-xs opacity-60 mt-0.5">
                    {cargo.hospital?.sigla} · {cargo.literalPuesto}
                    {cargo.especialidad ? ` · ${cargo.especialidad}` : ''} · {escalafonLabel(cargo.escalafon?.nombre ?? '')}
                  </p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <Row label="Origen"           value={origen} />
                <Row label="EX Baja"          value={exBaja} />
                <Row label="Partida presup."  value={partida} />
                <Row label="Agente"           value={nombreApellido} />
                <Row label="CUIL"             value={cuil} />
                <Row label="Código registro"  value={codigoRegistro} />
                <Row label="Carrera"          value={escalafon} />
                <Row label="POU/POF"          value={pouPof} />
                <Row label="Puesto"           value={puesto} />
                <Row label="Especialidad"     value={especialidad} />
                <Row label={esRetencion ? 'Fecha de retención' : 'Fecha de baja'} value={fechaBaja} />
                <Row label="Carga horaria"    value={cargaHoraria ? `${cargaHoraria} hs` : ''} />
                <Row label="Motivo"           value={motivo} />
                {docRespaldatoria && <Row label="Doc. respaldatoria" value={docRespaldatoria} />}
                {fechaPaseParalelo && <Row label="F. pase paralelo"  value={fechaPaseParalelo} />}
                {observaciones     && <Row label="Observaciones"     value={observaciones} />}
              </div>
              <div className={[
                'rounded-lg p-4 flex items-start gap-3',
                generaConcurso ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-gray-200',
              ].join(' ')}>
                <span className="text-xl">{generaConcurso ? '⚖️' : '📋'}</span>
                <p className={`font-semibold text-sm ${generaConcurso ? 'text-blue-800' : 'text-gray-700'}`}>
                  {generaConcurso
                    ? `Se registrará la baja y se abrirá el seguimiento del concurso ${tipoConcursoSeleccionado.toUpperCase()}`
                    : 'Se registrará la baja sin generar concurso. El cargo pasará a no vigente.'}
                </p>
              </div>

              {/* S18-8: alerta de cascada — cadena de retención activa sobre este cargo */}
              {cadenaRetencion && cadenaRetencion.nodos.length > 1 && (
                <div className="rounded-lg p-4 bg-amber-50 border border-amber-200">
                  <p className="font-semibold text-sm text-amber-800 flex items-center gap-2">
                    <span className="text-xl">⚠️</span>
                    Este cargo tiene una cadena de retención activa
                  </p>
                  <p className="text-xs text-amber-700 mt-1 mb-3">
                    Al confirmar la baja, los siguientes cargos quedan afectados. La cascada se
                    ejecuta paso a paso, con documentación en cada nivel — esta baja solo
                    registra el nivel actual.
                  </p>
                  <CadenaRetencionTree nodos={cadenaRetencion.nodos} />
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <button className="btn-outline" disabled={guardando} onClick={() => setPaso(sinConcurso ? 1 : 2)}>
                ← Volver
              </button>
              <div className="flex items-center gap-3">
                {error && <span className="text-sm text-danger">{error}</span>}
                <button className="btn-primary" disabled={guardando} onClick={() => confirmar(generaConcurso === true)}>
                  {guardando ? 'Registrando...' : generaConcurso ? `Registrar baja e iniciar concurso ${tipoConcursoSeleccionado.toUpperCase()} →` : 'Registrar baja'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
