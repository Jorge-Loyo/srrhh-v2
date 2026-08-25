import { Link, useParams } from 'react-router-dom'
import { EstadoCargo } from '@srrhh/types'
import { useCargo } from '../hooks/useCargos'

export function CargoDetailPanel() {
  const { id } = useParams<{ id: string }>()
  const { data: cargo, isLoading, isError } = useCargo(id)

  if (isLoading) {
    return <p className="text-sm text-gray-400">Cargando cargo...</p>
  }

  if (isError || !cargo) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-danger">No se pudo cargar este cargo.</p>
        <Link to="/cargos" className="btn-outline inline-block">
          Volver a Cargos
        </Link>
      </div>
    )
  }

  const ocupante = cargo.ocupacionActual

  return (
    <div className="space-y-6">
      <div>
        <Link to="/cargos" className="text-sm text-secondary hover:underline">
          ← Volver a Cargos
        </Link>
      </div>

      {/* Datos del cargo */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-primary text-xl font-bold text-gray-900">
            {cargo.literalPuesto ?? 'Cargo sin puesto asignado'}
          </h1>
          <span className={cargo.estado === EstadoCargo.VIGENTE ? 'badge-success' : 'badge-default'}>
            {cargo.estado === EstadoCargo.VIGENTE ? 'Vigente' : 'No vigente'}
          </span>
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">ID SIAL</dt>
            <dd className="text-gray-800 font-medium">{cargo.idSial}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Hospital</dt>
            <dd className="text-gray-800 font-medium">{cargo.hospital.sigla}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Escalafón</dt>
            <dd className="text-gray-800 font-medium">{cargo.escalafon.nombre}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Régimen</dt>
            <dd className="text-gray-800 font-medium">{cargo.regimen ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Especialidad</dt>
            <dd className="text-gray-800 font-medium">{cargo.especialidad ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Agrupador</dt>
            <dd className="text-gray-800 font-medium">{cargo.agrupador ?? '—'}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-gray-500">Unificador de puesto</dt>
            <dd className="text-gray-800 font-medium">{cargo.unificadorPuesto ?? '—'}</dd>
          </div>
        </dl>
      </div>

      {/* Ocupación actual */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="font-primary text-lg font-bold text-gray-900 mb-4">Ocupación actual</h2>

        {!ocupante ? (
          <p className="text-sm text-gray-400">Cargo vacante — sin persona asignada actualmente.</p>
        ) : (
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="col-span-2">
              <dt className="text-gray-500">Persona</dt>
              <dd className="text-gray-800 font-medium">
                <Link to={`/personas/${ocupante.persona.id}`} className="text-secondary hover:underline">
                  {ocupante.persona.apellidoNombre}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">CUIL</dt>
              <dd className="text-gray-800 font-medium">{ocupante.persona.cuil}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Situación de revista</dt>
              <dd className="text-gray-800 font-medium">{ocupante.situacionRevista ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Estado</dt>
              <dd className="text-gray-800 font-medium">{ocupante.estadoPersona ?? '—'}</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  )
}
