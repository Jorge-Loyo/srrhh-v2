import { Link, useParams } from 'react-router-dom'
import { EstadoCargo } from '@srrhh/types'
import { useCargo } from '../hooks/useCargos'

export function CargoDetailPanel() {
  const { id } = useParams<{ id: string }>()
  const { data: cargo, isLoading, isError } = useCargo(id)

  if (isLoading) return <p className="text-sm text-gray-400 p-6">Cargando cargo...</p>
  if (isError || !cargo) return <p className="text-sm text-danger p-6">No se pudo cargar el cargo.</p>

  const ocup = cargo.ocupacionActual
  const persona = ocup?.persona
  const vigente = cargo.estado === EstadoCargo.VIGENTE

  return (
    <div className="space-y-4">
      <Link to="/cargos" className="inline-flex items-center gap-1 text-sm text-secondary hover:underline">
        ← Volver a Cargos
      </Link>

      {/* Encabezado */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="bg-navy px-6 py-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-white text-xl font-bold leading-tight">{cargo.idSial}</h1>
            <p className="text-white/70 text-sm mt-0.5">{cargo.literalPuesto ?? 'Sin puesto asignado'}</p>
          </div>
          <span className={`mt-1 shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${vigente ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
            {vigente ? 'Vigente' : 'No vigente'}
          </span>
        </div>

        <div className="divide-y divide-gray-100">
          {/* Identificación */}
          <Section title="Identificación">
            <Dato label="Código Cargo" value={cargo.codigo} />
            <Dato label="ID SIAL" value={cargo.idSial} />
            <Dato label="Régimen" value={cargo.regimen} />
          </Section>

          {/* Ubicación */}
          <Section title="Ubicación">
            <Dato label="Hospital" value={`${cargo.hospital.sigla} — ${cargo.hospital.nombre}`} />
            <Dato label="Escalafón" value={cargo.escalafon.nombre} />
            <Dato
              label="Repartición"
              value={cargo.codigoRepa ? `${cargo.codigoRepa} — ${cargo.descripcionRepa}` : cargo.descripcionRepa}
            />
          </Section>

          {/* Clasificación */}
          <Section title="Clasificación">
            <Dato label="Especialidad" value={cargo.especialidad} />
            <Dato label="Agrupador" value={cargo.agrupador} />
            <Dato label="Unificador de puesto" value={cargo.unificadorPuesto} />
            <Dato
              label="Agrupamiento"
              value={cargo.codAgrupamiento ? `${cargo.codAgrupamiento} — ${cargo.agrupamiento}` : cargo.agrupamiento}
            />
            <Dato label="Familia" value={cargo.codFamilia ? `${cargo.codFamilia} — ${cargo.litFamilia}` : cargo.litFamilia} />
            <Dato label="Puesto SIAL" value={cargo.puestoCodigoSial} />
          </Section>
        </div>
      </div>

      {/* Persona actual */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="bg-navy px-6 py-3">
          <h2 className="text-white font-semibold text-sm uppercase tracking-wide">Persona actual</h2>
        </div>

        {!persona ? (
          <p className="p-6 text-sm text-gray-400 text-center">Cargo vacante — sin persona asignada.</p>
        ) : (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-gray-900 text-base">{persona.apellidoNombre}</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  CUIL {persona.cuil} · {persona.activo ? 'Activo' : 'Inactivo'}
                </p>
              </div>
              <Link to={`/personas/${persona.id}`} className="btn-outline shrink-0">
                Ver persona
              </Link>
            </div>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm pt-4 border-t border-gray-100">
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
