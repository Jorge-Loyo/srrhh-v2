import { Link, useParams } from 'react-router-dom'
import { usePersona } from '../hooks/usePersonas'

// `fechaNacimiento`/`desde`/`hasta` son columnas @db.Date (sin hora) que
// llegan serializadas como "YYYY-MM-DD..." (medianoche UTC). `new Date(iso)`
// las parsea como UTC y `toLocaleDateString` las vuelve a mostrar en la
// timezone local — en cualquier timezone con offset negativo (Argentina,
// UTC-3) eso corre la fecha un día para atrás (ej. "2020-01-01" se mostraba
// "31/12/2019"). Se arma la fecha a mano con los componentes de calendario,
// sin pasar por UTC en ningún momento.
function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return '—'
  return new Date(y, m - 1, d).toLocaleDateString('es-AR')
}

export function PersonaDetailPanel() {
  const { id } = useParams<{ id: string }>()
  const { data: persona, isLoading, isError } = usePersona(id)

  if (isLoading) {
    return <p className="text-sm text-gray-400">Cargando persona...</p>
  }

  if (isError || !persona) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-danger">No se pudo cargar esta persona.</p>
        <Link to="/personas" className="btn-outline inline-block">
          Volver a Personas
        </Link>
      </div>
    )
  }

  // Ya vienen ordenadas vigentes primero (hasta ASC pone los null adelante),
  // pero se separan en dos listas para no depender de ese orden en el render.
  const vigentes = persona.ocupaciones.filter((o) => !o.hasta)
  const historicas = persona.ocupaciones.filter((o) => o.hasta)

  return (
    <div className="space-y-6">
      <div>
        <Link to="/personas" className="text-sm text-secondary hover:underline">
          ← Volver a Personas
        </Link>
      </div>

      {/* Datos de la persona */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-primary text-xl font-bold text-gray-900">{persona.apellidoNombre}</h1>
          <span className={persona.activo ? 'badge-success' : 'badge-default'}>
            {persona.activo ? 'Activo' : 'Inactivo'}
          </span>
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">CUIL</dt>
            <dd className="text-gray-800 font-medium">{persona.cuil}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Documento</dt>
            <dd className="text-gray-800 font-medium">
              {persona.tipoDoc ?? 'DNI'} {persona.numeroDoc ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Sexo</dt>
            <dd className="text-gray-800 font-medium">{persona.sexo ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Fecha de nacimiento</dt>
            <dd className="text-gray-800 font-medium">{formatFecha(persona.fechaNacimiento)}</dd>
          </div>
          <div className="col-span-2 md:col-span-4">
            <dt className="text-gray-500">Especialidad principal</dt>
            <dd className="text-gray-800 font-medium">{persona.especialidadPrincipal ?? '—'}</dd>
          </div>
        </dl>
      </div>

      {/* Ocupaciones vigentes */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-primary text-lg font-bold text-gray-900">
            Ocupaciones vigentes <span className="text-gray-400 font-normal">({vigentes.length})</span>
          </h2>
        </div>
        {vigentes.length === 0 ? (
          <p className="p-6 text-sm text-gray-400 text-center">Sin ocupaciones vigentes.</p>
        ) : (
          <OcupacionesTable ocupaciones={vigentes} />
        )}
      </div>

      {/* Histórico */}
      {historicas.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-primary text-lg font-bold text-gray-900">
              Histórico <span className="text-gray-400 font-normal">({historicas.length})</span>
            </h2>
          </div>
          <OcupacionesTable ocupaciones={historicas} />
        </div>
      )}
    </div>
  )
}

function OcupacionesTable({ ocupaciones }: { ocupaciones: NonNullable<ReturnType<typeof usePersona>['data']>['ocupaciones'] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-gray-500 text-left">
        <tr>
          <th className="px-4 py-3 font-semibold">Hospital</th>
          <th className="px-4 py-3 font-semibold">Escalafón</th>
          <th className="px-4 py-3 font-semibold">Puesto</th>
          <th className="px-4 py-3 font-semibold">Situación</th>
          <th className="px-4 py-3 font-semibold">Desde</th>
          <th className="px-4 py-3 font-semibold">Hasta</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {ocupaciones.map((o) => (
          <tr key={o.id}>
            <td className="px-4 py-3 text-gray-600">{o.cargo?.hospital?.sigla ?? '—'}</td>
            <td className="px-4 py-3 text-gray-600">{o.cargo?.escalafon?.nombre ?? '—'}</td>
            <td className="px-4 py-3 font-medium text-gray-800">{o.cargo?.literalPuesto ?? '—'}</td>
            <td className="px-4 py-3 text-gray-600">{o.situacionRevista ?? '—'}</td>
            <td className="px-4 py-3 text-gray-600">{formatFecha(o.desde)}</td>
            <td className="px-4 py-3 text-gray-600">
              {o.hasta ? formatFecha(o.hasta) : <span className="badge-success">Vigente</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
