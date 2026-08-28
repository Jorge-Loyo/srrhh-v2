import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import { useHospitales, useEscalafones } from '@/shared/hooks/useCatalogos'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import type { Baja, Cargo, CargoDetail, PaginatedResponse, TipoConcurso } from '@srrhh/types'

const MOTIVOS = [
  'Jubilacion Ordinaria', 'Renuncia', 'Cese de cargo', 'Defuncion',
  'Cesantia', 'Ampliacion', 'Sin efecto', 'Cese',
]

const ESCALAFONES_CONCURSABLES = ['Médicos', 'CEETPS', 'Carrera de Enfermería', 'Carrera de Técnicos de la Salud']

type Paso = 1 | 2 | 3

// ── Modal búsqueda de cargo ──────────────────────────────────────────────────
function ModalBuscarCargo({
  onSeleccionar,
  onCerrar,
}: {
  onSeleccionar: (c: Cargo) => void
  onCerrar: () => void
}) {
  const [hospitalId, setHospitalId]     = useState('')
  const [escalafonId, setEscalafonId]   = useState('')
  const [busqueda, setBusqueda]         = useState('')
  const [personaBusq, setPersonaBusq]   = useState('')

  const { data: hospitales } = useHospitales()
  const { data: escalafones } = useEscalafones()

  const escalafonesParaBaja = [...(escalafones ?? [])]
    .filter((e) => ESCALAFONES_CONCURSABLES.includes(e.nombre))
    .sort((a, b) => escalafonLabel(a.nombre).localeCompare(escalafonLabel(b.nombre), 'es'))

  const activo = !!(hospitalId || escalafonId || busqueda.length >= 2 || personaBusq.length >= 2)

  const { data, isLoading } = useQuery({
    queryKey: ['cargo-modal', hospitalId, escalafonId, busqueda, personaBusq],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<Cargo>>('/api/v1/cargos', {
        params: {
          limit: 30,
          estado: 'vigente',
          ...(hospitalId             && { hospitalId }),
          ...(escalafonId            && { escalafonId }),
          ...(busqueda.length >= 2   && { search: busqueda }),
          ...(personaBusq.length >= 2 && { personaSearch: personaBusq }),
        },
      })
      return res.data
    },
    enabled: activo,
    placeholderData: (prev) => prev,
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />

      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-primary text-base font-bold text-gray-900">Buscar cargo</h2>
            <p className="text-xs text-gray-500 mt-0.5">Cargos vigentes — filtrá por sigla, escalafón, cargo o persona</p>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* Filtros */}
        <div className="px-6 py-4 border-b border-gray-100 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Sigla</label>
              <select
                value={hospitalId}
                onChange={(e) => setHospitalId(e.target.value)}
                className="input h-9 w-full text-sm"
              >
                <option value="">Todas</option>
                {hospitales?.map((h) => (
                  <option key={h.id} value={h.id}>{h.sigla}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Escalafón</label>
              <select
                value={escalafonId}
                onChange={(e) => setEscalafonId(e.target.value)}
                className="input h-9 w-full text-sm"
              >
                <option value="">Todos</option>
                {escalafonesParaBaja.map((e) => (
                  <option key={e.id} value={e.id}>{escalafonLabel(e.nombre)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Código, puesto o especialidad..."
              className="input h-9 w-full text-sm"
              autoFocus
            />
            <input
              type="text"
              value={personaBusq}
              onChange={(e) => setPersonaBusq(e.target.value)}
              placeholder="Nombre o CUIL de la persona..."
              className="input h-9 w-full text-sm"
            />
          </div>
        </div>

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto">
          {!activo && (
            <p className="p-6 text-sm text-gray-400 text-center">
              Usá los filtros o el buscador para encontrar el cargo
            </p>
          )}
          {activo && isLoading && (
            <p className="p-6 text-sm text-gray-400 text-center">Buscando...</p>
          )}
          {activo && !isLoading && (data?.data.length ?? 0) === 0 && (
            <p className="p-6 text-sm text-gray-400 text-center">Sin resultados. Probá con otros filtros.</p>
          )}
          {activo && !isLoading && (data?.data.length ?? 0) > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Código</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Sigla</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Puesto / Especialidad</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Persona</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Ocupación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.data.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => onSeleccionar(c)}
                    className="cursor-pointer hover:bg-blue-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{c.codigo ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.hospital?.sigla ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-800">{c.literalPuesto ?? '—'}</span>
                      {c.especialidad && <span className="text-gray-400 ml-1">· {c.especialidad}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.personaOcupante
                        ? <span>{c.personaOcupante.apellidoNombre}<span className="text-gray-400 ml-1 text-xs">{c.personaOcupante.cuil}</span></span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className={c.ocupado ? 'badge-success' : 'badge-warning'}>
                        {c.ocupado ? 'Ocupado' : 'Vacante'}
                      </span>
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

// ── Página principal ─────────────────────────────────────────────────────────
export function NuevaBajaPage() {
  const navigate = useNavigate()
  const [paso, setPaso] = useState<Paso>(1)
  const [modalAbierto, setModalAbierto] = useState(false)

  // Cargo seleccionado
  const [cargo, setCargo] = useState<CargoDetail | null>(null)
  const [cargandoCargo, setCargandoCargo] = useState(false)

  // Campos baja
  const [expediente, setExpediente]         = useState('')
  const [nombreApellido, setNombreApellido] = useState('')
  const [cuil, setCuil]                     = useState('')
  const [fechaBaja, setFechaBaja]           = useState('')
  const [motivo, setMotivo]                 = useState('')
  const [cargaHoraria, setCargaHoraria]     = useState('37')
  const [observaciones, setObservaciones]   = useState('')
  const [generaConcurso, setGeneraConcurso] = useState<boolean | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const crearBaja = useMutation({
    mutationFn: async (generaConcursoFinal: boolean) => {
      const body: Record<string, unknown> = {
        cargoId:      cargo!.id,
        hospitalId:   cargo!.hospitalId,
        personaId:    cargo!.ocupacionActual?.personaId ?? undefined,
        fechaBaja,
        motivo,
        tipoBaja:     motivo,
        observaciones: observaciones || undefined,
        generaConcurso: generaConcursoFinal,
        ...(generaConcursoFinal && { tipoConcurso: 'cph' as TipoConcurso }),
      }
      const res = await apiClient.post<{ data: Baja }>('/api/v1/bajas', body)
      return res.data.data
    },
  })

  const paso1Valido = !!(cargo && fechaBaja && motivo)

  async function seleccionarCargo(c: Cargo) {
    setModalAbierto(false)
    setCargandoCargo(true)
    try {
      const res = await apiClient.get<{ data: CargoDetail }>(`/api/v1/cargos/${c.id}`)
      const detalle = res.data.data
      setCargo(detalle)
      // Pre-cargar datos de la persona que ocupa el cargo
      if (detalle.ocupacionActual?.persona) {
        const p = detalle.ocupacionActual.persona
        setNombreApellido(p.apellidoNombre)
        setCuil(p.cuil)
      }
    } finally {
      setCargandoCargo(false)
    }
  }

  async function confirmar(conConcurso: boolean) {
    if (!cargo) return
    setGuardando(true)
    setError('')
    try {
      const baja = await crearBaja.mutateAsync(conConcurso)
      if (conConcurso) {
        // Buscar el concurso CPH recién creado para este cargo
        const res = await apiClient.get<{ data: { id: string }[] }>('/api/v1/concursos-cph', {
          params: { cargoId: baja.cargoId, limit: 1 },
        })
        const concursoCphId = res.data.data[0]?.id
        if (concursoCphId) {
          navigate(`/concursos/cph/${concursoCphId}/wizard`)
        } else {
          navigate('/concursos/cph')
        }
      } else {
        navigate('/cargos/alta-por-baja')
      }
    } catch {
      setError('No se pudo registrar la baja. Intentá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      {modalAbierto && (
        <ModalBuscarCargo
          onSeleccionar={seleccionarCargo}
          onCerrar={() => setModalAbierto(false)}
        />
      )}

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link to="/cargos/alta-por-baja" className="text-secondary hover:underline">
            ← Alta por Baja
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-500">Nueva Baja</span>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-0">
          {(['Datos de la baja', '¿Genera concurso?', 'Confirmación'] as const).map((label, i) => {
            const num = (i + 1) as Paso
            const activo   = paso === num
            const completo = paso > num
            return (
              <div key={label} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className={[
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors',
                    activo   ? 'bg-navy text-white border-navy' :
                    completo ? 'bg-green-500 text-white border-green-500' :
                               'bg-white text-gray-400 border-gray-300',
                  ].join(' ')}>
                    {completo ? '✓' : num}
                  </div>
                  <span className={`text-xs mt-1 text-center leading-tight ${activo ? 'font-bold text-navy' : 'text-gray-400'}`}>
                    {label}
                  </span>
                </div>
                {i < 2 && (
                  <div className={`h-0.5 flex-1 mb-5 ${completo ? 'bg-green-400' : 'bg-gray-200'}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* ── PASO 1 ─────────────────────────────────────────────────────── */}
        {paso === 1 && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h1 className="font-primary text-lg font-bold text-gray-900">Datos de la baja</h1>
              <p className="text-sm text-gray-500 mt-0.5">Completá los datos del agente y el cargo que queda vacante</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Cargo de baja */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Cargo <span className="text-danger">*</span>
                </label>
                {cargo ? (
                  <div className="flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-3 bg-gray-50">
                    <div className="flex-1">
                      <span className="font-mono text-sm font-bold text-gray-800">{cargo.codigo}</span>
                      <span className="text-gray-400 mx-2">·</span>
                      <span className="text-sm text-gray-600">
                        {cargo.hospital?.sigla} — {cargo.literalPuesto}
                        {cargo.especialidad ? ` · ${cargo.especialidad}` : ''}
                      </span>
                      {cargo.ocupacionActual?.persona && (
                        <p className="text-xs text-gray-400 mt-1">
                          Ocupado por: <span className="font-medium text-gray-600">{cargo.ocupacionActual.persona.apellidoNombre}</span>
                          {' · '}{cargo.ocupacionActual.persona.cuil}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setModalAbierto(true)}
                      className="text-xs text-secondary hover:underline shrink-0"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : cargandoCargo ? (
                  <div className="h-10 border border-gray-200 rounded-lg px-4 flex items-center text-sm text-gray-400">
                    Cargando datos del cargo...
                  </div>
                ) : (
                  <button
                    onClick={() => setModalAbierto(true)}
                    className="w-full h-10 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-400 hover:border-secondary hover:text-secondary transition-colors"
                  >
                    + Asignar cargo de baja
                  </button>
                )}
              </div>

              {/* Expediente */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Expediente de baja <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={expediente}
                  onChange={(e) => setExpediente(e.target.value)}
                  placeholder="EX-2024-12345678-GCABA-HGAP"
                  className="input h-10 w-full"
                />
              </div>

              {/* Agente */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Apellido y nombre</label>
                  <input
                    type="text"
                    value={nombreApellido}
                    onChange={(e) => setNombreApellido(e.target.value)}
                    placeholder="Ej: GARCIA, MARIA"
                    className="input h-10 w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">CUIL</label>
                  <input
                    type="text"
                    value={cuil}
                    onChange={(e) => setCuil(e.target.value)}
                    placeholder="27-12345678-9"
                    className="input h-10 w-full"
                  />
                </div>
              </div>

              {/* Fecha + Motivo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Fecha de baja <span className="text-danger">*</span>
                  </label>
                  <input
                    type="date"
                    value={fechaBaja}
                    onChange={(e) => setFechaBaja(e.target.value)}
                    className="input h-10 w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Motivo <span className="text-danger">*</span>
                  </label>
                  <select
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    className="input h-10 w-full"
                  >
                    <option value="">Seleccioná un motivo...</option>
                    {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {/* Carga horaria */}
              <div className="w-40">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Carga horaria (hs)</label>
                <input
                  type="number"
                  value={cargaHoraria}
                  onChange={(e) => setCargaHoraria(e.target.value)}
                  min={1} max={48}
                  className="input h-10 w-full"
                />
              </div>

              {/* Observaciones */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Observaciones</label>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={2}
                  className="input w-full py-2"
                  placeholder="Notas adicionales sobre la baja..."
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              {!paso1Valido && (
                <p className="text-xs text-gray-400">
                  {!cargo && 'Asigná un cargo · '}
                  {!fechaBaja && 'Completá la fecha de baja · '}
                  {!motivo && 'Seleccioná un motivo'}
                </p>
              )}
              <div className="ml-auto">
                <button className="btn-primary" disabled={!paso1Valido} onClick={() => setPaso(2)}>
                  Continuar →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── PASO 2 ─────────────────────────────────────────────────────── */}
        {paso === 2 && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-primary text-lg font-bold text-gray-900">¿Esta baja genera concurso?</h2>
              {cargo && (
                <p className="text-sm text-gray-500 mt-0.5">
                  Cargo <strong className="font-mono">{cargo.codigo}</strong> — {cargo.hospital?.sigla} · {cargo.literalPuesto}
                  {cargo.especialidad ? ` · ${cargo.especialidad}` : ''}
                </p>
              )}
            </div>

            <div className="p-6 space-y-3">
              {[
                {
                  val: true,
                  titulo: 'Sí, genera concurso CPH',
                  desc: `Se registra la baja y se abre el seguimiento del concurso para el cargo ${cargo?.codigo ?? ''}.`,
                },
                {
                  val: false,
                  titulo: 'No, solo registrar la baja',
                  desc: 'La baja queda registrada. Se puede iniciar un concurso más adelante desde el listado.',
                },
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
                      'w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center',
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
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <button className="btn-outline" onClick={() => setPaso(1)}>← Volver</button>
              <button className="btn-primary" disabled={generaConcurso === null} onClick={() => setPaso(3)}>
                Continuar →
              </button>
            </div>
          </div>
        )}

        {/* ── PASO 3 ─────────────────────────────────────────────────────── */}
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
                    {cargo.especialidad ? ` · ${cargo.especialidad}` : ''}
                    {' · '}{escalafonLabel(cargo.escalafon?.nombre ?? '')}
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                <Row label="Expediente"    value={expediente || '—'} />
                <Row label="Agente"        value={nombreApellido || '—'} />
                <Row label="CUIL"          value={cuil || '—'} />
                <Row label="Fecha de baja" value={fechaBaja} />
                <Row label="Motivo"        value={motivo} />
                <Row label="Carga horaria" value={`${cargaHoraria} hs`} />
                {observaciones && <Row label="Observaciones" value={observaciones} />}
              </div>

              <div className={[
                'rounded-lg p-4 flex items-start gap-3',
                generaConcurso ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-gray-200',
              ].join(' ')}>
                <span className="text-xl">{generaConcurso ? '⚖️' : '📋'}</span>
                <p className={`font-semibold text-sm ${generaConcurso ? 'text-blue-800' : 'text-gray-700'}`}>
                  {generaConcurso
                    ? 'Se registrará la baja y se abrirá el seguimiento del concurso CPH'
                    : 'Se registrará la baja sin generar concurso'}
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <button className="btn-outline" disabled={guardando} onClick={() => setPaso(2)}>← Volver</button>
              <div className="flex items-center gap-3">
                {error && <p className="text-sm text-danger">{error}</p>}
                {generaConcurso
                  ? <button className="btn-primary" disabled={guardando} onClick={() => confirmar(true)}>
                      {guardando ? 'Registrando...' : 'Registrar baja e iniciar concurso →'}
                    </button>
                  : <button className="btn-primary" disabled={guardando} onClick={() => confirmar(false)}>
                      {guardando ? 'Registrando...' : 'Registrar baja'}
                    </button>
                }
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-500 w-36 flex-shrink-0">{label}:</span>
      <span className="text-gray-800 font-medium">{value}</span>
    </div>
  )
}
