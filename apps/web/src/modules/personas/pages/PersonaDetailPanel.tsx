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

function calcEdad(iso: string | null | undefined): number | null {
  if (!iso) return null
  const parts = iso.slice(0, 10).split('-').map(Number)
  const y = parts[0], m = parts[1], d = parts[2]
  if (!y || !m || !d) return null
  const hoy = new Date()
  let edad = hoy.getFullYear() - y
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) edad--
  return edad
}

export function PersonaDetailPanel() {
  const { id } = useParams<{ id: string }>()
  const { data: persona, isLoading, isError } = usePersona(id)

  if (isLoading) return <p className="text-sm text-gray-400 p-6">Cargando persona...</p>
  if (isError || !persona) return <p className="text-sm text-danger p-6">No se pudo cargar la persona.</p>

  const edad = calcEdad(persona.fechaNacimiento)
  const fechaNac = formatFecha(persona.fechaNacimiento)

  return (
    <div className="space-y-4">
      <Link to="/personas" className="inline-flex items-center gap-1 text-sm text-secondary hover:underline">
        ← Volver a Personas
      </Link>

      {/* Datos personales */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="bg-navy px-6 py-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-white text-xl font-bold leading-tight">{persona.apellidoNombre}</h1>
            <p className="text-white/70 text-sm mt-0.5">CUIL {persona.cuil}</p>
          </div>
          <span className={`mt-1 shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${persona.activo ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
            {persona.activo ? 'Activo' : 'Inactivo'}
          </span>
        </div>

        <div className="divide-y divide-gray-100">
          <Section title="Identificación">
            <Dato label="Documento" value={persona.numeroDoc ? `${persona.tipoDoc ?? ''} ${persona.numeroDoc}`.trim() : null} />
            <Dato label="Sexo" value={persona.sexo} />
            <Dato label="Fecha de nacimiento" value={fechaNac ? `${fechaNac}${edad !== null ? ` (${edad} años)` : ''}` : null} />
            <Dato label="Especialidad principal" value={persona.especialidadPrincipal} />
            <Dato label="Antigüedad desde" value={formatFecha(persona.antiguedadDesde)} />
          </Section>

          <Section title="Contacto">
            <Dato label="Teléfono" value={persona.telefono} />
            <Dato label="Mail personal" value={persona.mailPersonal} />
            <Dato label="Mail laboral" value={persona.mailLaboral} />
          </Section>

          <Section title="Domicilio">
            <Dato label="Domicilio" value={persona.domicilio} />
            <Dato label="Localidad" value={persona.localidad} />
            <Dato label="Provincia" value={persona.provincia} />
          </Section>
        </div>
      </div>

      {/* Ocupaciones */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="bg-navy px-6 py-3">
          <h2 className="text-white font-semibold text-sm uppercase tracking-wide">
            Ocupaciones ({persona.ocupaciones.length})
          </h2>
        </div>

        {persona.ocupaciones.length === 0 ? (
          <p className="p-6 text-sm text-gray-400 text-center">Sin ocupaciones registradas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-navy text-white text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Repartición</th>
                <th className="px-4 py-3 font-semibold">Escalafón</th>
                <th className="px-4 py-3 font-semibold">Puesto</th>
                <th className="px-4 py-3 font-semibold">Unificador de puesto</th>
                <th className="px-4 py-3 font-semibold">Situación de revista</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {persona.ocupaciones.map((o) => (
                <tr key={o.id} className={o.hasta ? 'text-gray-400' : ''}>
                  <td className="px-4 py-3">
                    {o.cargo?.codigoRepa
                      ? `${o.cargo.codigoRepa} — ${o.cargo.descripcionRepa}`
                      : (o.cargo?.descripcionRepa ?? o.cargo?.hospital?.sigla ?? '—')}
                  </td>
                  <td className="px-4 py-3">{o.cargo?.escalafon?.nombre ?? '—'}</td>
                  <td className="px-4 py-3">{o.cargo?.literalPuesto ?? '—'}</td>
                  <td className="px-4 py-3">{o.cargo?.unificadorPuesto ?? '—'}</td>
                  <td className="px-4 py-3">{o.situacionRevista ?? '—'}</td>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-4">
      <h3 className="text-xs font-semibold text-navy uppercase tracking-wide mb-3">{title}</h3>
      <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">{children}</dl>
    </div>
  )
}

function Dato({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className="text-gray-800 font-medium">{value || '—'}</dd>
    </div>
  )
}
