import { Link, useParams } from 'react-router-dom'
import { EstadoCargo } from '@srrhh/types'
import { useCargo } from '../hooks/useCargos'

// S3-9: detalle de cargo — datos del cargo + persona que lo ocupa (si está
// vacante, ocupacionActual viene null desde getCargoByIdService).
export function CargoDetailPanel() {
  const { id } = useParams<{ id: string }>()
  const { data: cargo, isLoading, isError } = useCargo(id)

  if (isLoading) return <p className="text-sm text-gray-400">Cargando cargo...</p>
  if (isError || !cargo) return <p className="text-sm text-danger">No se pudo cargar el cargo.</p>

  const persona = cargo.ocupacionActual?.persona

  return (
    <div className="space-y-6">
      <Link to="/cargos" className="text-sm text-secondary hover:underline">
        ← Volver a Cargos
      </Link>

      {/* Panel del cargo */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-primary text-xl font-bold text-gray-900">{cargo.idSial}</h1>
            <p className="text-sm text-gray-500">{cargo.literalPuesto ?? 'Sin puesto asignado'}</p>
          </div>
          <span className={cargo.estado === EstadoCargo.VIGENTE ? 'badge-success' : 'badge-default'}>
            {cargo.estado === EstadoCargo.VIGENTE ? 'Vigente' : 'No vigente'}
          </span>
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <Dato label="Hospital" value={`${cargo.hospital.sigla} — ${cargo.hospital.nombre}`} />
          <Dato label="Escalafón" value={cargo.escalafon.nombre} />
          <Dato label="Especialidad" value={cargo.especialidad} />
          <Dato label="Agrupador" value={cargo.agrupador} />
          <Dato label="Unificador de puesto" value={cargo.unificadorPuesto} />
          <Dato label="Régimen" value={cargo.regimen} />
        </dl>
      </div>

      {/* Ocupación actual */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-primary text-lg font-bold text-gray-900">Persona actual</h2>
        </div>

        {!persona && (
          <p className="p-6 text-sm text-gray-400 text-center">Cargo vacante — sin persona asignada.</p>
        )}

        {persona && (
          <div className="p-6 flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-800">{persona.apellidoNombre}</p>
              <p className="text-sm text-gray-500">
                CUIL {persona.cuil} · {cargo.ocupacionActual?.situacionRevista ?? 'Sin situación de revista'}
              </p>
            </div>
            <Link to={`/personas/${persona.id}`} className="btn-outline">
              Ver persona
            </Link>
          </div>
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
