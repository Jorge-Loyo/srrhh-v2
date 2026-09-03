import { useState, useEffect } from 'react'
import { useNavigate, Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import { useHospitales } from '@/shared/hooks/useCatalogos'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import { hospitalLabel } from '@/shared/lib/hospitalLabel'
import type { Baja, Cargo, CargoDetail, PaginatedResponse, TipoConcurso } from '@srrhh/types'
import {
  OPCIONES_ORIGEN, OPCIONES_MOTIVO_BAJA,
  CEETPS_CODIGOS,
} from '../lib/bajasHelpers'
import { jsPDF } from 'jspdf'

type Paso = 1 | 2 | 3

function ModalBuscarCargo({
  onSeleccionar,
  onCerrar,
}: {
  onSeleccionar: (c: Cargo) => void
  onCerrar: () => void
}) {
  const [hospitalId, setHospitalId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [personaBusq, setPersonaBusq] = useState('')
  const { data: hospitales } = useHospitales()

  const activo = !!(hospitalId || busqueda.length >= 2 || personaBusq.length >= 2)

  const { data, isLoading } = useQuery({
    queryKey: ['cargo-modal-baja', hospitalId, busqueda, personaBusq],
    enabled: activo,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const [r1, r2] = await Promise.all([
        apiClient.get<PaginatedResponse<Cargo>>('/api/v1/cargos', {
          params: {
            limit: 30,
            estado: 'vigente',
            ...(hospitalId && { hospitalId }),
            ...(busqueda.length >= 2 && { search: busqueda }),
            ...(personaBusq.length >= 2 && { personaSearch: personaBusq }),
          },
        }),
        apiClient.get<PaginatedResponse<Cargo>>('/api/v1/cargos', {
          params: {
            limit: 10,
            estado: 'validacion_vacante',
            ...(hospitalId && { hospitalId }),
            ...(busqueda.length >= 2 && { search: busqueda }),
            ...(personaBusq.length >= 2 && { personaSearch: personaBusq }),
          },
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
            <p className="text-xs text-gray-500 mt-0.5">Filtrá por sigla, código, puesto, especialidad o persona</p>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-4 border-b border-gray-100 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Sigla</label>
            <select value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} className="input h-9 w-full text-sm">
              <option value="">Todas</option>
              {hospitales?.map((h) => <option key={h.id} value={h.id}>{hospitalLabel(h)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input autoFocus type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Código, ID SIAL, puesto, especialidad..." className="input h-9 w-full text-sm" />
            <input type="text" value={personaBusq} onChange={(e) => setPersonaBusq(e.target.value)} placeholder="Nombre o CUIL de la persona..." className="input h-9 w-full text-sm" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!activo && <p className="p-6 text-sm text-gray-400 text-center">Seleccioná una sigla o escribí al menos 2 caracteres</p>}
          {activo && isLoading && <p className="p-6 text-sm text-gray-400 text-center">Buscando...</p>}
          {activo && !isLoading && (data?.length ?? 0) === 0 && <p className="p-6 text-sm text-gray-400 text-center">Sin resultados.</p>}
          {activo && !isLoading && (data?.length ?? 0) > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">Código</th>
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
                    <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{c.hospital?.sigla ?? '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-800 max-w-[220px]">
                      <span className="font-medium leading-tight line-clamp-2">{c.literalPuesto ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[140px]">
                      {c.especialidadLegacy ?? c.especialidad ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[160px]">
                      {c.personaOcupante ? c.personaOcupante.apellidoNombre : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={c.estado === 'validacion_vacante' ? 'badge-warning' : c.ocupado ? 'badge-success' : 'badge-warning'}>
                        {c.estado === 'validacion_vacante' ? 'En validación' : c.ocupado ? 'Ocupado' : 'Vacante'}
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
    especialidad: det.especialidadLegacy ?? det.especialidad ?? '',
  }
}

// ── Página principal ──────────────────────────────────────────────────────────
export function NuevaBajaPage() {
  const navigate = useNavigate()
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

  // ── campos derivados del cargo (readonly) ──
  const [cuil, setCuil] = useState('')
  const [nombreApellido, setNombreApellido] = useState('')
  const [codigoRegistro, setCodigoRegistro] = useState('37')
  const [escalafon, setEscalfon] = useState('')
  const [pouPof, setPouPof] = useState('')
  const [puesto, setPuesto] = useState('')
  const [especialidad, setEspecialidad] = useState('')

  // ── campos editables ──
  const [origen, setOrigen] = useState('')
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

  // ── UI ──
  const [guardando, setGuardando] = useState(false)
  const [guardadoOk, setGuardadoOk] = useState(false)
  const [error, setError] = useState('')

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
    if (bajaExistente.cargoId) {
      setCargandoCargo(true)
      apiClient.get<{ data: CargoDetail }>(`/api/v1/cargos/${bajaExistente.cargoId}`)
        .then((res) => aplicarCargo(res.data.data))
        .finally(() => setCargandoCargo(false))
    }
  }, [bajaExistente])

  const codigoNum = Number(codigoRegistro)
  const esCeetps = CEETPS_CODIGOS.includes(codigoNum)

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
      ...(conConcurso && { tipoConcurso: 'cph' as TipoConcurso }),
    }
  }

  const mutCrear = useMutation({
    mutationFn: async (conConcurso: boolean) => {
      const body = buildBody(conConcurso)
      if (modoEdicion) {
        const res = await apiClient.patch<{ data: Baja }>(`/api/v1/bajas/${bajaId}`, { ...body, estado: 'pendiente' })
        return res.data.data
      }
      const res = await apiClient.post<{ data: Baja }>('/api/v1/bajas', body)
      return res.data.data
    },
  })

  const mutBorrador = useMutation({
    mutationFn: async () => {
      const body = { ...buildBody(false), estado: 'resolucion_a_la_firma' }
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
    } catch {
      setError('No se pudo registrar la baja. Intentá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  function generarPDF() {
    const doc = new jsPDF()
    const m = 20; let y = 20
    const line = (lbl: string, val: string) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
      doc.text(lbl + ':', m, y)
      doc.setFont('helvetica', 'normal')
      doc.text(val || '—', m + 52, y); y += 7
    }
    doc.setFillColor(30, 41, 59); doc.rect(0, 0, 210, 18, 'F')
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.text('GCBA — Dirección General de Administración y Desarrollo de RRHH', m, 12)
    doc.setTextColor(0, 0, 0); y = 28
    doc.setFontSize(13); doc.text('Formulario de Baja de Cargo', m, y); y += 4
    doc.setDrawColor(200, 200, 200); doc.line(m, y, 190, y); y += 8
    doc.setFontSize(10); doc.setFont('helvetica', 'bold')
    doc.text('CARGO', m, y); y += 6; doc.line(m, y, 190, y); y += 5
    line('Código', cargo?.codigo ?? '')
    line('Hospital', `${cargo?.hospital?.sigla ?? ''} — ${cargo?.hospital?.nombre ?? ''}`)
    line('Puesto', puesto); line('Escalafón', escalafon); line('POU/POF', pouPof)
    if (especialidad) line('Especialidad', especialidad); y += 3
    doc.setFont('helvetica', 'bold'); doc.text('AGENTE', m, y); y += 6; doc.line(m, y, 190, y); y += 5
    line('Apellido y Nombre', nombreApellido); line('CUIL', cuil); line('Código de Registro', codigoRegistro); y += 3
    doc.setFont('helvetica', 'bold'); doc.text('DATOS DE LA BAJA', m, y); y += 6; doc.line(m, y, 190, y); y += 5
    line('Origen', origen); line('EX Baja', exBaja); line('Partida Presupuestaria', partida)
    line('Fecha de Baja', fechaBaja); line('Motivo', motivo)
    if (docRespaldatoria) line('Doc. Respaldatoria', docRespaldatoria)
    if (fechaPaseParalelo) line('Fecha Pase Paralelo / GT', fechaPaseParalelo)
    if (cargaHoraria) line('Carga Horaria', `${cargaHoraria} hs`)
    if (observaciones) line('Observaciones', observaciones); y += 3
    doc.setFont('helvetica', 'bold'); doc.text('CONCURSO', m, y); y += 6; doc.line(m, y, 190, y); y += 5
    line('Genera Concurso', generaConcurso ? 'Sí — CPH' : 'No'); y += 10
    doc.setDrawColor(200, 200, 200); doc.line(m, y, 190, y); y += 6
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(120, 120, 120)
    doc.text(`Generado el ${new Date().toLocaleDateString('es-AR')} — Sistema SRRHH GCBA`, m, y)
    doc.save(`baja_${cargo?.codigo ?? 'cargo'}_${fechaBaja}.pdf`)
  }

  const volverUrl = sinConcurso ? '/cargos/baja' : '/cargos/alta-por-baja'

  return (
    <>
      {modalAbierto && (
        <ModalBuscarCargo
          onSeleccionar={seleccionarCargo}
          onCerrar={() => setModalAbierto(false)}
        />
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
                    <select value={origen} onChange={(e) => handleOrigenChange(e.target.value)} className="input h-10 w-full">
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
                ) : (
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
                  <Field label="Escalafón">
                    <ReadonlyInput value={escalafon} />
                  </Field>
                  <Field label="POU/POF">
                    <ReadonlyInput value={pouPof} />
                  </Field>
                  <Field label="Puesto" required>
                    <ReadonlyInput value={puesto} />
                  </Field>
                  <Field label="Especialidad">
                    <ReadonlyInput value={especialidad} />
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
                  <Field label="Fecha de baja" required>
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
                      placeholder="37"
                      className="input h-10 w-full"
                    />
                  </Field>
                  <Field label="Motivo" required>
                    <select
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      disabled={['Cobertura Dotación', 'Ampliación', 'POU a POF'].includes(origen)}
                      className="input h-10 w-full"
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
                        onChange={(e) => setDocRespaldatoria(e.target.value)}
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
              <p className="text-xs text-gray-400">
                {[!cargo && 'Asigná un cargo', !fechaBaja && 'Completá la fecha', !motivo && 'Seleccioná un motivo'].filter(Boolean).join(' · ')}
              </p>
              <div className="flex items-center gap-2">
                {guardadoOk && <span className="text-sm text-green-600 font-medium">✓ Guardado</span>}
                {error && <span className="text-sm text-danger">{error}</span>}
                {modoEdicion && (
                  <button className="btn-outline" onClick={() => navigate(volverUrl)}>← Volver</button>
                )}
                <button className="btn-outline" disabled={!cargo || guardando} onClick={guardarBorrador}>
                  {guardando ? 'Guardando...' : 'Guardar borrador'}
                </button>
                <button className="btn-primary" disabled={!paso1Valido} onClick={avanzar}>
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
                { val: false, titulo: 'No, solo registrar la baja', desc: 'La baja queda registrada. Se puede iniciar un concurso más adelante.' },
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
                <Row label="Escalafón"        value={escalafon} />
                <Row label="POU/POF"          value={pouPof} />
                <Row label="Puesto"           value={puesto} />
                <Row label="Especialidad"     value={especialidad} />
                <Row label="Fecha de baja"    value={fechaBaja} />
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
                    ? 'Se registrará la baja y se abrirá el seguimiento del concurso CPH'
                    : 'Se registrará la baja sin generar concurso'}
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <button className="btn-outline" disabled={guardando} onClick={() => setPaso(sinConcurso ? 1 : 2)}>
                ← Volver
              </button>
              <div className="flex items-center gap-3">
                {error && <span className="text-sm text-danger">{error}</span>}
                <button className="btn-outline" onClick={generarPDF}>⬇ Descargar PDF</button>
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
