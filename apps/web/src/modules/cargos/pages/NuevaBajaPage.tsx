import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import { useHospitales, useEscalafones } from '@/shared/hooks/useCatalogos'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import type { Baja, Cargo, CargoDetail, PaginatedResponse, TipoConcurso } from '@srrhh/types'
import {
  OPCIONES_ORIGEN, OPCIONES_MOTIVO_BAJA,
  CEETPS_CODIGOS,
  evaluarCph,
  formatDateMask, dmyToIso,
} from '../lib/bajasHelpers'

const ESCALAFONES_CONCURSABLES = ['Médicos', 'CEETPS', 'Carrera de Enfermería', 'Carrera de Técnicos de la Salud']

type Paso = 1 | 2 | 3

// ── Modal búsqueda de cargo ──────────────────────────────────────────────────
function ModalBuscarCargo({ onSeleccionar, onCerrar }: { onSeleccionar: (c: Cargo) => void; onCerrar: () => void }) {
  const [hospitalId, setHospitalId]   = useState('')
  const [escalafonId, setEscalafonId] = useState('')
  const [busqueda, setBusqueda]       = useState('')
  const [personaBusq, setPersonaBusq] = useState('')
  const { data: hospitales }  = useHospitales()
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
          limit: 30, estado: 'vigente',
          ...(hospitalId              && { hospitalId }),
          ...(escalafonId             && { escalafonId }),
          ...(busqueda.length >= 2    && { search: busqueda }),
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
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-primary text-base font-bold text-gray-900">Buscar cargo</h2>
            <p className="text-xs text-gray-500 mt-0.5">Cargos vigentes — filtrá por sigla, escalafón, cargo o persona</p>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-4 border-b border-gray-100 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Sigla</label>
              <select value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} className="input h-9 w-full text-sm">
                <option value="">Todas</option>
                {hospitales?.map((h) => <option key={h.id} value={h.id}>{h.sigla}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Escalafón</label>
              <select value={escalafonId} onChange={(e) => setEscalafonId(e.target.value)} className="input h-9 w-full text-sm">
                <option value="">Todos</option>
                {escalafonesParaBaja.map((e) => <option key={e.id} value={e.id}>{escalafonLabel(e.nombre)}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Código, puesto o especialidad..." className="input h-9 w-full text-sm" autoFocus />
            <input type="text" value={personaBusq} onChange={(e) => setPersonaBusq(e.target.value)} placeholder="Nombre, CUIL o ID SIAL de la persona..." className="input h-9 w-full text-sm" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!activo && <p className="p-6 text-sm text-gray-400 text-center">Usá los filtros o el buscador para encontrar el cargo</p>}
          {activo && isLoading && <p className="p-6 text-sm text-gray-400 text-center">Buscando...</p>}
          {activo && !isLoading && (data?.data.length ?? 0) === 0 && <p className="p-6 text-sm text-gray-400 text-center">Sin resultados. Probá con otros filtros.</p>}
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
                  <tr key={c.id} onClick={() => onSeleccionar(c)} className="cursor-pointer hover:bg-blue-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{c.codigo ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.hospital?.sigla ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-800">{c.literalPuesto ?? '—'}</span>
                      {c.especialidad && <span className="text-gray-400 ml-1">· {c.especialidad}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.personaOcupante
                        ? <span>{c.personaOcupante.apellidoNombre}<span className="text-gray-400 ml-1 text-xs">{c.personaOcupante.cuil}</span><span className="text-gray-300 ml-1 text-xs font-mono">{c.personaOcupante.idSialRol?.split('-')[0]}</span></span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={c.ocupado ? 'badge-success' : 'badge-warning'}>{c.ocupado ? 'Ocupado' : 'Vacante'}</span>
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
  const [cargo, setCargo] = useState<CargoDetail | null>(null)
  const [cargandoCargo, setCargandoCargo] = useState(false)

  // ── Campos del formulario ──
  const [origen, setOrigen]                     = useState('')
  const [exBaja, setExBaja]                     = useState('')
  const [cuil, setCuil]                         = useState('')
  const [nombreApellido, setNombreApellido]     = useState('')
  const [codigoRegistro, setCodigoRegistro]     = useState('37')
  const [unificador, setUnificador]             = useState('')
  const [escalafon, setEscalfon]                = useState('')
  const [pouPof, setPouPof]                     = useState('')
  const [puesto, setPuesto]                     = useState('')
  const [especialidad, setEspecialidad]         = useState('')
  const [partida, setPartida]                   = useState('')
  const [fechaBaja, setFechaBaja]               = useState('')
  const [cargaHoraria, setCargaHoraria]         = useState('')
  const [motivo, setMotivo]                     = useState('')
  const [docRespaldatoria, setDocRespaldatoria] = useState('')
  const [fechaPaseParalelo, setFechaPaseParalelo] = useState('')
  const [explicacionCese, setExplicacionCese]   = useState('')
  const [generaConcurso, setGeneraConcurso]     = useState<boolean | null>(null)
  const [expedienteConcurso, setExpedienteConcurso] = useState('')
  const [fechaCaratulacion, setFechaCaratulacion] = useState('')
  const [observaciones, setObservaciones]       = useState('')
  const [guardando, setGuardando]               = useState(false)
  const [error, setError]                       = useState('')
  const [camposVacios, setCamposVacios]         = useState<string[]>([])

  const codigoNum = Number(codigoRegistro)
  const esCeetps  = CEETPS_CODIGOS.includes(codigoNum)

  const previewEsCph = evaluarCph(true, puesto, codigoNum)

  // ── Cascade: origen cambia ──
  const handleOrigenChange = (v: string) => {
    setOrigen(v)
    if (v === 'Cobertura Dotación') {
      setNombreApellido(''); setCuil(''); setPartida(''); setDocRespaldatoria('')
      setMotivo('Cobertura Dotación')
    }
  }

  const paso1Valido = !!(cargo && fechaBaja && motivo && origen)

  async function seleccionarCargo(c: Cargo) {
    setModalAbierto(false); setCargandoCargo(true)
    try {
      const res = await apiClient.get<{ data: CargoDetail }>(`/api/v1/cargos/${c.id}`)
      const det = res.data.data
      setCargo(det)
      if (det.ocupacionActual?.persona) {
        setNombreApellido(det.ocupacionActual.persona.apellidoNombre)
        setCuil(det.ocupacionActual.persona.cuil)
      }
      if (det.codigoRegistro?.codigo) setCodigoRegistro(det.codigoRegistro.codigo)
      setUnificador(det.unificadorPuesto ?? '')
      const escForm = det.codigoRegistro?.literal ?? ''
      setEscalfon(escForm)
      const uni = (det.unificadorPuesto ?? '').toLowerCase()
      const codigoCargo = (det.codigo ?? '').toUpperCase()
      const pouPofVal = codigoCargo.includes('POF') ? 'POF'
        : codigoCargo.includes('POU') ? 'POU'
        : uni.includes('planta') ? 'POF'
        : uni.includes('guardia') ? 'POU' : ''
      setPouPof(pouPofVal)
      setPuesto(det.literalPuesto ?? '')
      setEspecialidad(det.especialidad ?? '')
    } finally { setCargandoCargo(false) }
  }

  const crearBaja = useMutation({
    mutationFn: async (conConcurso: boolean) => {
      const body: Record<string, unknown> = {
        cargoId:      cargo!.id,
        hospitalId:   cargo!.hospitalId,
        personaId:    cargo!.ocupacionActual?.personaId ?? undefined,
        fechaBaja:    dmyToIso(fechaBaja) ?? fechaBaja,
        motivo,
        tipoBaja:     motivo,
        tipificadorOrigen: origen,
        eeBaja:       exBaja || undefined,
        observaciones: observaciones || undefined,
        generaConcurso: conConcurso,
        ...(conConcurso && { tipoConcurso: 'cph' as TipoConcurso }),
      }
      const res = await apiClient.post<{ data: Baja }>('/api/v1/bajas', body)
      return res.data.data
    },
  })

  async function confirmar(conConcurso: boolean) {
    if (!cargo) return
    setGuardando(true); setError('')
    try {
      const baja = await crearBaja.mutateAsync(conConcurso)
      if (conConcurso) {
        const res = await apiClient.get<{ data: { id: string }[] }>('/api/v1/concursos-cph', {
          params: { cargoId: baja.cargoId, limit: 1 },
        })
        const id = res.data.data[0]?.id
        navigate(id ? `/concursos/cph/${id}/wizard` : '/concursos/cph')
      } else {
        navigate('/cargos/alta-por-baja')
      }
    } catch { setError('No se pudo registrar la baja. Intentá de nuevo.') }
    finally { setGuardando(false) }
  }

  function validarYAvanzar() {
    const vacios: string[] = []
    if (!origen)   vacios.push('Origen')
    if (!exBaja)   vacios.push('EX Baja')
    if (!cargo)    vacios.push('Cargo')
    if (!fechaBaja) vacios.push('Fecha de baja')
    if (!motivo)   vacios.push('Motivo')
    if (!escalafon) vacios.push('Escalafón')
    if (!pouPof && !esCeetps) vacios.push('POU/POF')
    if (!puesto)   vacios.push('Puesto')
    if (vacios.length > 0) { setCamposVacios(vacios); return }
    setPaso(2)
  }

  return (
    <>
      {modalAbierto && <ModalBuscarCargo onSeleccionar={seleccionarCargo} onCerrar={() => setModalAbierto(false)} />}

      {/* Modal campos vacíos */}
      {camposVacios.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h3 className="font-primary text-base font-bold text-gray-900">Campos sin completar</h3>
            <p className="text-sm text-gray-500">¿Deseas guardar de todas formas?</p>
            <ul className="space-y-1">
              {camposVacios.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-amber-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />{f}
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-outline" onClick={() => setCamposVacios([])}>Volver a revisar</button>
              <button className="btn-primary" onClick={() => { setCamposVacios([]); setPaso(2) }}>Guardar igual</button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-2 text-sm">
          <Link to="/cargos/alta-por-baja" className="text-secondary hover:underline">← Alta por Baja</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-500">Nueva Baja</span>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-0">
          {(['Datos de la baja', '¿Genera concurso?', 'Confirmación'] as const).map((label, i) => {
            const num = (i + 1) as Paso
            const activo = paso === num; const completo = paso > num
            return (
              <div key={label} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className={['w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors', activo ? 'bg-navy text-white border-navy' : completo ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-400 border-gray-300'].join(' ')}>
                    {completo ? '✓' : num}
                  </div>
                  <span className={`text-xs mt-1 text-center leading-tight ${activo ? 'font-bold text-navy' : 'text-gray-400'}`}>{label}</span>
                </div>
                {i < 2 && <div className={`h-0.5 flex-1 mb-5 ${completo ? 'bg-green-400' : 'bg-gray-200'}`} />}
              </div>
            )
          })}
        </div>

        {/* ── PASO 1 ── */}
        {paso === 1 && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h1 className="font-primary text-lg font-bold text-gray-900">Datos de la baja</h1>
              <p className="text-sm text-gray-500 mt-0.5">Completá todos los campos del formulario consolidado</p>
            </div>
            <div className="p-6 space-y-6">

              {/* Sección 1: Identificación */}
              <Section title="Identificación">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Origen <span className="text-danger">*</span></label>
                    <select value={origen} onChange={(e) => handleOrigenChange(e.target.value)} className="input h-10 w-full">
                      <option value="">Seleccioná...</option>
                      {OPCIONES_ORIGEN.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">EX Baja</label>
                    <input type="text" value={exBaja} onChange={(e) => setExBaja(e.target.value)} placeholder="EX-2026-12345678-GCABA-HGAP" className="input h-10 w-full font-mono text-sm" />
                  </div>
                </div>
              </Section>

              {/* Sección 2: Cargo */}
              <Section title="Cargo">
                {cargo ? (
                  <div className="flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-3 bg-gray-50">
                    <div className="flex-1">
                      <span className="font-mono text-sm font-bold text-gray-800">{cargo.codigo}</span>
                      <span className="text-gray-400 mx-2">·</span>
                      <span className="text-sm text-gray-600">{cargo.hospital?.sigla} — {cargo.literalPuesto}{cargo.especialidad ? ` · ${cargo.especialidad}` : ''}</span>
                      {cargo.ocupacionActual?.persona && (
                        <p className="text-xs text-gray-400 mt-1">Ocupado por: <span className="font-medium text-gray-600">{cargo.ocupacionActual.persona.apellidoNombre}</span> · {cargo.ocupacionActual.persona.cuil}</p>
                      )}
                    </div>
                    <button onClick={() => setModalAbierto(true)} className="text-xs text-secondary hover:underline shrink-0">Cambiar</button>
                  </div>
                ) : cargandoCargo ? (
                  <div className="h-10 border border-gray-200 rounded-lg px-4 flex items-center text-sm text-gray-400">Cargando datos del cargo...</div>
                ) : (
                  <button onClick={() => setModalAbierto(true)} className="w-full h-10 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-400 hover:border-secondary hover:text-secondary transition-colors">
                    + Asignar cargo de baja
                  </button>
                )}
              </Section>

              {/* Sección 3: Datos funcionales */}
              <Section title="Datos funcionales">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="label">CUIL</label>
                    <input type="text" value={cuil} onChange={(e) => setCuil(e.target.value.replace(/\D/g,'').slice(0,11))} placeholder="20123456789" className="input h-10 w-full" disabled={['Ampliación','Cobertura Dotación','POU a POF'].includes(origen)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">Apellido y Nombre</label>
                    <input type="text" value={nombreApellido} onChange={(e) => setNombreApellido(e.target.value)} className="input h-10 w-full" disabled={['Ampliación','Cobertura Dotación','POU a POF'].includes(origen)} />
                  </div>
                  <div>
                    <label className="label">Código de registro</label>
                    <select value={codigoRegistro} onChange={(e) => setCodigoRegistro(e.target.value)} className="input h-10 w-full">
                      {(origen === 'Cobertura Dotación' ? ['37','23'] : ['37','23','87','85','83']).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Escalafón</label>
                    <input type="text" value={escalafon} readOnly className="input h-10 w-full bg-gray-50 text-gray-600" placeholder="Se completa al seleccionar cargo" />
                  </div>
                  <div>
                    <label className="label">POU/POF</label>
                    <input type="text" value={pouPof} readOnly className="input h-10 w-full bg-gray-50 text-gray-600" placeholder="Se completa al seleccionar cargo" />
                  </div>
                  <div>
                    <label className="label">Puesto <span className="text-danger">*</span></label>
                    <input type="text" value={puesto} readOnly className="input h-10 w-full bg-gray-50 text-gray-600" placeholder="Se completa al seleccionar cargo" />
                  </div>
                  <div>
                    <label className="label">Especialidad</label>
                    <input type="text" value={especialidad} readOnly className="input h-10 w-full bg-gray-50 text-gray-600" placeholder="Se completa al seleccionar cargo" />
                  </div>
                  <div>
                    <label className="label">Partida presupuestaria</label>
                    <input type="text" value={partida} onChange={(e) => setPartida(e.target.value)} className="input h-10 w-full" disabled={['Ampliación','Cobertura Dotación'].includes(origen)} />
                  </div>
                </div>
              </Section>

              {/* Sección 4: Fechas */}
              <Section title="Fechas y expediente">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="label">Fecha de baja <span className="text-danger">*</span></label>
                    <input type="text" value={fechaBaja} onChange={(e) => setFechaBaja(formatDateMask(e.target.value))} placeholder="DD/MM/AAAA" maxLength={10} className="input h-10 w-full font-mono" />
                  </div>
                  <div>
                    <label className="label">Carga horaria</label>
                    <input type="text" value={cargaHoraria} onChange={(e) => setCargaHoraria(e.target.value.replace(/\D/g,'').slice(0,2))} placeholder="37" className="input h-10 w-full" />
                  </div>
                  <div>
                    <label className="label">Motivo <span className="text-danger">*</span></label>
                    <select value={motivo} onChange={(e) => { setMotivo(e.target.value); if (e.target.value !== 'Cese de Cargo') setExplicacionCese('') }} className="input h-10 w-full" disabled={['Cobertura Dotación','Ampliación','POU a POF'].includes(origen)}>
                      <option value="">Seleccioná...</option>
                      {(['Cobertura Dotación','Ampliación','POU a POF'].includes(origen) ? [motivo] : OPCIONES_MOTIVO_BAJA).map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  {motivo === 'Cese de Cargo' && (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <label className="label">Explicación del cese de cargo</label>
                      <textarea value={explicacionCese} onChange={(e) => setExplicacionCese(e.target.value)} rows={2} className="input w-full py-2" placeholder="Detallá el motivo del cese..." />
                    </div>
                  )}
                  {origen !== 'Cobertura Dotación' && (
                    <div>
                      <label className="label">Doc. respaldatoria</label>
                      <input type="text" value={docRespaldatoria} onChange={(e) => setDocRespaldatoria(e.target.value)} className="input h-10 w-full" />
                    </div>
                  )}
                  <div>
                    <label className="label">Fecha pase paralelo / GT</label>
                    <input type="text" value={fechaPaseParalelo} onChange={(e) => setFechaPaseParalelo(formatDateMask(e.target.value))} placeholder="DD/MM/AAAA" maxLength={10} className="input h-10 w-full font-mono" />
                  </div>
                </div>
              </Section>

              {/* Preview regla CPH/CEETPS — solo informativo, sin checkbox */}
              {(esCeetps || previewEsCph) && (
                <Section title="Concurso">
                  <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs border ${esCeetps ? 'bg-teal-50 border-teal-200 text-teal-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
                    <span className="mt-0.5">ℹ️</span>
                    {esCeetps
                      ? `Código ${codigoNum} (${CEETPS_ESCALAFON[codigoNum]}): si genera concurso, se creará seguimiento CEETPS automáticamente.`
                      : 'Este puesto cumple la regla CPH — en el paso siguiente podrás indicar si genera concurso.'}
                  </div>
                </Section>
              )}

              {/* Observaciones */}
              <div>
                <label className="label">Observaciones</label>
                <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} className="input w-full py-2" placeholder="Notas adicionales..." />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-400">{!cargo && 'Asigná un cargo · '}{!fechaBaja && 'Completá la fecha · '}{!motivo && 'Seleccioná un motivo'}</p>
              <button className="btn-primary" disabled={!paso1Valido} onClick={validarYAvanzar}>Continuar →</button>
            </div>
          </div>
        )}

        {/* ── PASO 2 ── */}
        {paso === 2 && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-primary text-lg font-bold text-gray-900">¿Esta baja genera concurso?</h2>
              {cargo && <p className="text-sm text-gray-500 mt-0.5">Cargo <strong className="font-mono">{cargo.codigo}</strong> — {cargo.hospital?.sigla} · {cargo.literalPuesto}</p>}
            </div>
            <div className="p-6 space-y-3">
              {[{ val: true, titulo: 'Sí, genera concurso CPH', desc: `Se registra la baja y se abre el seguimiento del concurso para el cargo ${cargo?.codigo ?? ''}.` }, { val: false, titulo: 'No, solo registrar la baja', desc: 'La baja queda registrada. Se puede iniciar un concurso más adelante.' }].map(({ val, titulo, desc }) => (
                <button key={String(val)} type="button" onClick={() => setGeneraConcurso(val)}
                  className={['w-full text-left p-4 rounded-lg border-2 transition-colors', generaConcurso === val ? (val ? 'border-secondary bg-blue-50' : 'border-gray-500 bg-gray-50') : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'].join(' ')}>
                  <div className="flex items-start gap-3">
                    <span className={['w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center', generaConcurso === val ? (val ? 'border-secondary bg-secondary' : 'border-gray-600 bg-gray-600') : 'border-gray-300'].join(' ')}>
                      {generaConcurso === val && <span className="w-2 h-2 rounded-full bg-white" />}
                    </span>
                    <div><p className="font-semibold text-gray-900">{titulo}</p><p className="text-sm text-gray-500 mt-0.5">{desc}</p></div>
                  </div>
                </button>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <button className="btn-outline" onClick={() => setPaso(1)}>← Volver</button>
              <button className="btn-primary" disabled={generaConcurso === null} onClick={() => setPaso(3)}>Continuar →</button>
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
                  <p className="text-xs opacity-60 mt-0.5">{cargo.hospital?.sigla} · {cargo.literalPuesto}{cargo.especialidad ? ` · ${cargo.especialidad}` : ''} · {escalafonLabel(cargo.escalafon?.nombre ?? '')}</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                <Row label="Origen"          value={origen} />
                <Row label="EX Baja"         value={exBaja || '—'} />
                <Row label="Agente"          value={nombreApellido || '—'} />
                <Row label="CUIL"            value={cuil || '—'} />
                <Row label="Código registro" value={codigoRegistro} />
                <Row label="Unificador"      value={unificador || '—'} />
                <Row label="Escalafón"       value={escalafon || '—'} />
                <Row label="POU/POF"         value={pouPof || '—'} />
                <Row label="Puesto"          value={puesto || '—'} />
                <Row label="Especialidad"    value={especialidad || '—'} />
                <Row label="Fecha de baja"   value={fechaBaja} />
                <Row label="Carga horaria"   value={cargaHoraria ? `${cargaHoraria} hs` : '—'} />
                <Row label="Motivo"          value={motivo} />
                {docRespaldatoria && <Row label="Doc. respaldatoria" value={docRespaldatoria} />}
                {fechaPaseParalelo && <Row label="F. pase paralelo" value={fechaPaseParalelo} />}
                {expedienteConcurso && <Row label="Expediente concurso" value={expedienteConcurso} />}
              </div>
              <div className={['rounded-lg p-4 flex items-start gap-3', generaConcurso ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-gray-200'].join(' ')}>
                <span className="text-xl">{generaConcurso ? '⚖️' : '📋'}</span>
                <p className={`font-semibold text-sm ${generaConcurso ? 'text-blue-800' : 'text-gray-700'}`}>
                  {generaConcurso ? 'Se registrará la baja y se abrirá el seguimiento del concurso CPH' : 'Se registrará la baja sin generar concurso'}
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <button className="btn-outline" disabled={guardando} onClick={() => setPaso(2)}>← Volver</button>
              <div className="flex items-center gap-3">
                {error && <p className="text-sm text-danger">{error}</p>}
                <button className="btn-primary" disabled={guardando} onClick={() => confirmar(generaConcurso === true)}>
                  {guardando ? 'Registrando...' : generaConcurso ? 'Registrar baja e iniciar concurso →' : 'Registrar baja'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
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
    <div className="flex gap-2">
      <span className="text-gray-500 w-40 flex-shrink-0">{label}:</span>
      <span className="text-gray-800 font-medium">{value}</span>
    </div>
  )
}
