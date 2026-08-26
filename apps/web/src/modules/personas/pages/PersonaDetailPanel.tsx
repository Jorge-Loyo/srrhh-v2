import { Link, useParams } from 'react-router-dom'
import { usePersona } from '../hooks/usePersonas'

// Hallazgo de Agustin en su propia implementación de este panel (descartada
// en el merge de S3-6/S3-10, ver PLAN_SCRUM_2026.md): formatear con
// `new Date(iso)` + `toLocaleDateString()` corre la fecha un día para atrás
// en Argentina (UTC-3) — `new Date("2020-01-01")` es medianoche UTC, que en
// local es el 31/12/2019 a las 21hs. Se arma la fecha a mano desde los
// componentes del string ISO, sin pasar por el constructor de Date.
function formatFecha(iso: string | null | undefined): string | null {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : null
}

// S3-7: detalle de persona — datos personales + historial de ocupaciones
// (vigente primero, ver orderBy de getPersonaByIdService en el backend).
export function PersonaDetailPanel() {
  const { id } = useParams<{ id: string }>()
  const { data: persona, isLoading, isError } = usePersona(id)

  if (isLoading) return <p className="text-sm text-gray-400">Cargando persona...</p>
  if (isError || !persona) return <p className="text-sm text-danger">No se pudo cargar la persona.</p>

  return (
    <div className="space-y-6">
      <Link to="/personas" className="text-sm text-secondary hover:underline">
        ← Volver a Personas
      </Link>

      {/* Panel de datos personales */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-primary text-xl font-bold text-gray-900">{persona.apellidoNombre}</h1>
            <p className="text-sm text-gray-500">CUIL {persona.cuil}</p>
          </div>
          <span className={persona.activo ? 'badge-success' : 'badge-default'}>
            {persona.activo ? 'Activo' : 'Inactivo'}
          </span>
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <Dato label="Documento" value={persona.numeroDoc ? `${persona.tipoDoc ?? ''} ${persona.numeroDoc}`.trim() : null} />
          <Dato label="Sexo" value={persona.sexo} />
          <Dato label="Fecha de nacimiento" value={formatFecha(persona.fechaNacimiento)} />
          <Dato label="Especialidad principal" value={persona.especialidadPrincipal} />
          <Dato label="Teléfono" value={persona.telefono} />
          <Dato label="Mail personal" value={persona.mailPersonal} />
          <Dato label="Mail laboral" value={persona.mailLaboral} />
          <Dato label="Domicilio" value={persona.domicilio} />
          <Dato label="Localidad" value={persona.localidad} />
          <Dato label="Provincia" value={persona.provincia} />
          <Dato label="Antigüedad desde" value={formatFecha(persona.antiguedadDesde)} />
        </dl>
      </div>

      {/* Ocupaciones */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-primary text-lg font-bold text-gray-900">
            Ocupaciones ({persona.ocupaciones.length})
          </h2>
        </div>

        {persona.ocupaciones.length === 0 && (
          <p className="p-6 text-sm text-gray-400 text-center">Sin ocupaciones registradas.</p>
        )}

        {persona.ocupaciones.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Hospital</th>
                <th className="px-4 py-3 font-semibold">Escalafón</th>
                <th className="px-4 py-3 font-semibold">Puesto</th>
                <th className="px-4 py-3 font-semibold">Situación de revista</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {persona.ocupaciones.map((o) => (
                <tr key={o.id} className={o.hasta ? 'text-gray-400' : ''}>
                  <td className="px-4 py-3 text-gray-700">{o.cargo?.hospital?.sigla ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{o.cargo?.escalafon?.nombre ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{o.cargo?.literalPuesto ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{o.situacionRevista ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={o.hasta ? 'badge-default' : 'badge-success'}>
                      {o.hasta ? 'Histórica' : 'Vigente'}
                    </span>
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

function Dato({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-gray-400 text-xs uppercase tracking-wide">{label}</dt>
      <dd className="text-gray-800 font-medium">{value || '—'}</dd>
    </div>
  )
}
