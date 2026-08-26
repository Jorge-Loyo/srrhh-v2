import { Link, useParams } from 'react-router-dom'
import { EstadoCargo } from '@srrhh/types'
import { useCargo } from '../hooks/useCargos'

export function CargoDetailPanel() {
  const { id } = useParams<{ id: string }>()
  const { data: cargo, isLoading, isError } = useCargo(id)

  if (isLoading) return <p className="text-sm text-gray-400">Cargando cargo...</p>
  if (isError || !cargo) return <p className="text-sm text-danger">No se pudo cargar el cargo.</p>

  const ocup = cargo.ocupacionActual
  const persona = ocup?.persona

  return (
    <div className="space-y-6">
      <Link to="/cargos" className="text-sm text-secondary hover:underline">
        ← Volver a Cargos
      </Link>

      {/* Encabezado */}
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

        {/* Identificación */}
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Identificación</h3>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm mb-5">
          <Dato label="Código Cargo" value={cargo.codigo} />
          <Dato label="ID SIAL" value={cargo.idSial} />
          <Dato label="Régimen" value={cargo.regimen} />
        </dl>

        {/* Ubicación */}
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Ubicación</h3>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm mb-5">
          <Dato label="Hospital" value={`${cargo.hospital.sigla} — ${cargo.hospital.nombre}`} />
          <Dato label="Escalafón" value={cargo.escalafon.nombre} />
          <Dato label="Repartición" value={cargo.codigoRepa ? `${cargo.codigoRepa} — ${cargo.descripcionRepa}` : cargo.descripcionRepa} />
        </dl>

        {/* Clasificación */}
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Clasificación</h3>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm mb-5">
          <Dato label="Especialidad" value={cargo.especialidad} />
          <Dato label="Agrupador" value={cargo.agrupador} />
          <Dato label="Unificador de puesto" value={cargo.unificadorPuesto} />
          <Dato label="Agrupamiento" value={cargo.codAgrupamiento ? `${cargo.codAgrupamiento} — ${cargo.agrupamiento}` : cargo.agrupamiento} />
          <Dato label="Familia" value={cargo.codFamilia ? `${cargo.codFamilia} — ${cargo.litFamilia}` : cargo.litFamilia} />
          <Dato label="Puesto SIAL" value={cargo.puestoCodigoSial} />
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
          <div className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-800">{persona.apellidoNombre}</p>
                <p className="text-sm text-gray-500">
                  CUIL {persona.cuil} · {persona.activo ? 'Activo' : 'Inactivo'}
                </p>
              </div>
              <Link to={`/personas/${persona.id}`} className="btn-outline">Ver persona</Link>
            </div>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm pt-2 border-t border-gray-100">
              <Dato label="Situación de revista" value={ocup?.situacionRevista} />
              <Dato label="Estado" value={ocup?.estadoPersona} />
              <Dato label="Desde" value={ocup?.desde ? new Date(ocup.desde).toLocaleDateString('es-AR') : null} />
            </dl>
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
