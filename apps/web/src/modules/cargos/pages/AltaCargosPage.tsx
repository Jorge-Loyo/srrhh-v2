import { useState } from 'react'

type TipoAlta = 'pof' | 'pou' | 'estructura'

const HOSPITALES = ['HGAIP', 'HGATA', 'HGACD', 'CSMA', 'HGAVS', 'HGAON']

const CARRERAS = [
  { value: 'cph', label: 'CPH' },
  { value: 'eg',  label: 'EG' },
  { value: 'enf', label: 'Enfermería' },
  { value: 'tec', label: 'Técnico' },
  { value: 'as',  label: 'AS' },
]

const PUESTOS_MOCK: Record<string, string[]> = {
  cph: ['Médico de Planta', 'Jefe de Servicio', 'Director', 'Subdirector'],
  eg:  ['Gerente', 'Jefe de Departamento', 'Coordinador'],
  enf: ['Enfermero/a', 'Jefe de Enfermería'],
  tec: ['Técnico Radiólogo', 'Técnico de Laboratorio', 'Técnico Cardiólogo'],
  as:  ['Asistente Social'],
}

const ESPECIALIDADES_MOCK = [
  'Cardiología', 'Clínica Médica', 'Cirugía General', 'Pediatría',
  'Ginecología', 'Traumatología', 'Neurología', 'No aplica',
]

interface AltaRegistrada {
  id: number
  fecha: string
  tipo: TipoAlta
  hospital: string
  carrera: string
  puesto: string
  especialidad: string
  expediente: string
  cantidad: number
  estado: string
}

const MOCK_HISTORIAL: AltaRegistrada[] = [
  { id: 9, fecha: '2025-07-20', tipo: 'pof',       hospital: 'HGAIP', carrera: 'CPH', puesto: 'Médico de Planta',    especialidad: 'Cardiología',    expediente: 'EX-2025-44001122-GCABA-DGAYDRH', cantidad: 2, estado: 'Registrada' },
  { id: 8, fecha: '2025-07-15', tipo: 'estructura', hospital: 'HGATA', carrera: 'CPH', puesto: 'Director',            especialidad: '—',              expediente: 'DEC-541/MSGC/25',                cantidad: 1, estado: 'Registrada' },
  { id: 7, fecha: '2025-06-30', tipo: 'pou',        hospital: 'HGACD', carrera: 'CPH', puesto: 'Médico de Planta',    especialidad: 'Clínica Médica', expediente: 'EX-2025-39887654-GCABA-DGAYDRH', cantidad: 3, estado: 'Registrada' },
  { id: 6, fecha: '2025-06-10', tipo: 'pof',        hospital: 'CSMA',  carrera: 'ENF', puesto: 'Enfermero/a',         especialidad: '—',              expediente: 'EX-2025-37654321-GCABA-DGAYDRH', cantidad: 1, estado: 'Registrada' },
  { id: 5, fecha: '2025-05-22', tipo: 'pof',        hospital: 'HGAIP', carrera: 'TEC', puesto: 'Técnico Radiólogo',   especialidad: 'No aplica',      expediente: 'EX-2025-33112233-GCABA-DGAYDRH', cantidad: 1, estado: 'Registrada' },
  { id: 4, fecha: '2025-04-18', tipo: 'estructura', hospital: 'HGACD', carrera: 'EG',  puesto: 'Jefe de Departamento',especialidad: '—',              expediente: 'DEC-312/MSGC/25',                cantidad: 1, estado: 'Registrada' },
  { id: 3, fecha: '2025-03-05', tipo: 'pou',        hospital: 'HGATA', carrera: 'CPH', puesto: 'Médico de Planta',    especialidad: 'Pediatría',      expediente: 'EX-2025-28990011-GCABA-DGAYDRH', cantidad: 2, estado: 'Registrada' },
]

const TIPO_LABEL: Record<TipoAlta, string> = {
  pof:       'Ejecución POF',
  pou:       'Ejecución POU',
  estructura: 'Estructura',
}

const TIPO_BADGE: Record<TipoAlta, string> = {
  pof:       'badge-info',
  pou:       'badge-default',
  estructura: 'badge-warning',
}

// ── Formulario inline ──────────────────────────────────────────────────────────
interface FormAltaProps {
  tipo: TipoAlta
  onRegistrar: (alta: Omit<AltaRegistrada, 'id' | 'fecha' | 'estado'>) => void
  onCancelar: () => void
}

let nextId = MOCK_HISTORIAL.length + 1

function FormAlta({ tipo, onRegistrar, onCancelar }: FormAltaProps) {
  const [expInput,      setExpInput]      = useState('')
  const [expConfirmado, setExpConfirmado] = useState(false)
  const [expediente,    setExpediente]    = useState('')
  const [hospital,      setHospital]      = useState('')
  const [carrera,       setCarrera]       = useState('')
  const [puesto,        setPuesto]        = useState('')
  const [especialidad,  setEspecialidad]  = useState('')
  const [desde,         setDesde]         = useState('')
  const [cantidad,      setCantidad]      = useState(1)

  function confirmarExp() {
    const v = expInput.trim()
    if (!v) return
    setExpediente(v)
    setExpConfirmado(true)
  }

  function handleRegistrar() {
    if (!hospital || !carrera || !puesto || !desde) return
    onRegistrar({ tipo, hospital, carrera: carrera.toUpperCase(), puesto, especialidad: especialidad || '—', expediente, cantidad })
  }

  const puestosDisponibles = carrera ? (PUESTOS_MOCK[carrera] ?? []) : []
  const mostrarEspecialidad = (carrera === 'cph' || carrera === 'tec') && !!puesto
  const formCompleto = expConfirmado && !!hospital && !!carrera && !!puesto && !!desde

  const expLabel = tipo === 'estructura' ? 'Decreto' : 'Expediente'
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

        {/* Hospital + Carrera */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Hospital <span className="text-danger">*</span></label>
            <select value={hospital} onChange={(e) => { setHospital(e.target.value); setPuesto(''); setEspecialidad('') }} className="h-10 input w-full">
              <option value="">Seleccionar...</option>
              {HOSPITALES.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Carrera <span className="text-danger">*</span></label>
            <div className="flex flex-wrap gap-2 pt-1">
              {CARRERAS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  disabled={!hospital}
                  onClick={() => { setCarrera(c.value === carrera ? '' : c.value); setPuesto(''); setEspecialidad('') }}
                  className={`px-3 py-1.5 rounded text-sm font-semibold border transition-colors ${
                    c.value === carrera
                      ? 'border-secondary bg-secondary text-white'
                      : 'border-gray-300 text-gray-600 bg-white hover:border-secondary hover:text-secondary'
                  } disabled:opacity-40 disabled:cursor-default`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Detalle condicional */}
        {carrera && (
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Puesto <span className="text-danger">*</span></label>
              <select value={puesto} onChange={(e) => { setPuesto(e.target.value); setEspecialidad('') }} className="h-10 input w-full">
                <option value="">Seleccionar...</option>
                {puestosDisponibles.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {mostrarEspecialidad && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Especialidad</label>
                <select value={especialidad} onChange={(e) => setEspecialidad(e.target.value)} className="h-10 input w-full">
                  <option value="">Seleccionar...</option>
                  {ESPECIALIDADES_MOCK.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
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
            <button type="button" onClick={handleRegistrar} disabled={!formCompleto} className="btn-primary flex-1 disabled:opacity-40">
              Registrar
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
  const [search,     setSearch]     = useState('')
  const [historial,  setHistorial]  = useState<AltaRegistrada[]>(MOCK_HISTORIAL)

  function handleTipoClick(tipo: TipoAlta) {
    setTipoActivo((prev) => (prev === tipo ? null : tipo))
  }

  function handleRegistrar(alta: Omit<AltaRegistrada, 'id' | 'fecha' | 'estado'>) {
    const nueva: AltaRegistrada = {
      ...alta,
      id: nextId++,
      fecha: new Date().toISOString().slice(0, 10),
      estado: 'Registrada',
    }
    setHistorial((prev) => [nueva, ...prev])
    setTipoActivo(null)
  }

  const filtrados = historial.filter((a) => {
    const q = search.toLowerCase()
    return (
      !q ||
      a.hospital.toLowerCase().includes(q) ||
      a.carrera.toLowerCase().includes(q) ||
      a.puesto.toLowerCase().includes(q) ||
      a.expediente.toLowerCase().includes(q) ||
      TIPO_LABEL[a.tipo].toLowerCase().includes(q)
    )
  })

  const BOTONES: { tipo: TipoAlta; label: string; cls: string }[] = [
    { tipo: 'pof',       label: 'Cargo de Ejecución POF', cls: 'btn-secondary' },
    { tipo: 'pou',       label: 'Cargo de Ejecución POU', cls: 'btn-outline'   },
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
                onClick={() => handleTipoClick(tipo)}
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

      {/* Historial */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <h2 className="font-primary text-base font-bold text-gray-700">Historial de altas</h2>
        <input
          type="text"
          placeholder="Buscar por hospital, carrera, puesto, expediente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 px-3 border border-gray-300 rounded w-full focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {filtrados.length === 0 && (
          <p className="p-6 text-sm text-gray-400 text-center">Sin resultados para la búsqueda.</p>
        )}
        {filtrados.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-navy text-white text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Hospital</th>
                <th className="px-4 py-3 font-semibold">Carrera</th>
                <th className="px-4 py-3 font-semibold">Puesto</th>
                <th className="px-4 py-3 font-semibold">Especialidad</th>
                <th className="px-4 py-3 font-semibold">Expediente</th>
                <th className="px-4 py-3 font-semibold">Cant.</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{a.fecha}</td>
                  <td className="px-4 py-3">
                    <span className={TIPO_BADGE[a.tipo]}>{TIPO_LABEL[a.tipo]}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{a.hospital}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{a.carrera}</td>
                  <td className="px-4 py-3 text-gray-600">{a.puesto}</td>
                  <td className="px-4 py-3 text-gray-600">{a.especialidad}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono">{a.expediente}</td>
                  <td className="px-4 py-3 text-gray-600 text-center">{a.cantidad}</td>
                  <td className="px-4 py-3">
                    <span className="badge-success">{a.estado}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="btn-outline">Ver</button>
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
