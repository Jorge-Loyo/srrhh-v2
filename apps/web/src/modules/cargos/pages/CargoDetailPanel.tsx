import { Link, useLocation, useParams } from 'react-router-dom'
import { EstadoCargo, EstadoConcursoCph, EstadoConcursoCeetps } from '@srrhh/types'
import { useCargo } from '../hooks/useCargos'

function fechaCorta(v: string | null | undefined) {
  if (!v) return '—'
  return v.slice(0, 10)
}

export function CargoDetailPanel() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const { data: cargo, isLoading, isError } = useCargo(id)

  const volverHref = `/cargos${location.state?.from ? `?${location.state.from}` : ''}`

  if (isLoading) return <p className="text-sm text-gray-400 p-6">Cargando cargo...</p>
  if (isError || !cargo) return <p className="text-sm text-danger p-6">No se pudo cargar el cargo.</p>

  const ocup    = cargo.ocupacionActual
  const persona = ocup?.persona
  const vigente = cargo.estado === EstadoCargo.VIGENTE
  const ocupado = !!persona
  const retenido = ocup?.situacionRevista === 'Retencion de Cargo'

  const desdeOcup = ocup?.cargoDesdeFecha
    ? ocup.cargoDesdeFecha.slice(0, 10)
    : ocup?.desde
    ? ocup.desde.slice(0, 10)
    : null

  return (
    <div className="space-y-4">
      <Link to={volverHref} className="inline-flex items-center gap-1 text-sm text-secondary hover:underline">
        ← Volver a Cargos
      </Link>

      {/* Encabezado */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="bg-navy px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-white/60 text-xs font-mono mb-1">{cargo.idSial}</p>
              <h1 className="text-white text-xl font-bold leading-tight">{cargo.codigo ?? cargo.idSial}</h1>
              <p className="text-white/80 text-sm mt-1">{cargo.literalPuesto ?? 'Sin puesto asignado'}</p>
              {(cargo.especialidadLegacy ?? cargo.especialidad) && (
                <p className="text-white/55 text-xs mt-0.5">{cargo.especialidadLegacy ?? cargo.especialidad}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0 mt-1">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${vigente ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                {vigente ? 'Vigente' : 'No vigente'}
              </span>
              {vigente && (
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${ocupado ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-700'}`}>
                  {ocupado ? 'Ocupado' : 'Vacante'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          <Section title="Identificación">
            <Dato label="Código Cargo"      value={cargo.codigo} />
            <Dato label="ID SIAL"           value={cargo.idSial} />
            <Dato label="Régimen"           value={cargo.regimen} />
            <Dato label="Código de Registro"
              value={cargo.codigoRegistro ? `${cargo.codigoRegistro.codigo} — ${cargo.codigoRegistro.literal}` : null}
            />
          </Section>

          <Section title="Ubicación">
            <Dato label="Hospital"    value={`${cargo.hospital.sigla} — ${cargo.hospital.nombre}`} />
            <Dato label="Escalafón"   value={cargo.escalafon.nombre} />
            <Dato label="Repartición"
              value={cargo.codigoRepa ? `${cargo.codigoRepa} — ${cargo.descripcionRepa}` : cargo.descripcionRepa}
            />
          </Section>

          {/* Solo mostrar Clasificación si hay al menos un campo con dato */}
          {((cargo.especialidadLegacy ?? cargo.especialidad) || cargo.agrupador || cargo.unificadorPuesto || cargo.agrupamiento) && (
            <Section title="Clasificación">
              <Dato label="Especialidad"        value={cargo.especialidadLegacy ?? cargo.especialidad} />
              <Dato label="Agrupador"           value={cargo.agrupador} />
              <Dato label="Unificador de puesto" value={cargo.unificadorPuesto} />
              <Dato label="Agrupamiento"
                value={cargo.codAgrupamiento ? `${cargo.codAgrupamiento} — ${cargo.agrupamiento}` : cargo.agrupamiento}
              />
              <Dato label="Familia"
                value={cargo.codFamilia ? `${cargo.codFamilia} — ${cargo.litFamilia}` : cargo.litFamilia}
              />
              <Dato label="Puesto SIAL" value={cargo.puestoCodigoSial} />
            </Section>
          )}

          {/* S7-8: datos de alta manual — solo si tiene expediente o fechaDesde */}
          {(cargo.expediente || cargo.fechaDesde) && (
            <Section title="Alta">
              <Dato label="Expediente" value={cargo.expediente} />
              <Dato label="Vigente desde" value={cargo.fechaDesde ? cargo.fechaDesde.slice(0, 10) : null} />
            </Section>
          )}
        </div>
      </div>

      {/* Persona actual */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="bg-navy px-6 py-3">
          <h2 className="text-white font-semibold text-sm uppercase tracking-wide">Persona actual</h2>
        </div>

        {!vigente ? (
          <div className="p-6 text-center">
            <p className="text-gray-400 text-sm">Cargo no vigente.</p>
          </div>
        ) : !persona ? (
          <div className="p-6 text-center">
            <p className="text-gray-400 text-sm">Cargo vacante — sin persona asignada.</p>
          </div>
        ) : (
          <div className="p-6">
            {/* Cabecera de la persona */}
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <p className="font-bold text-gray-900 text-lg leading-tight">{persona.apellidoNombre}</p>
                <p className="text-sm text-gray-500 mt-0.5">CUIL {persona.cuil}</p>
                {persona.numeroDoc && (
                  <p className="text-xs text-gray-400 mt-0.5">DNI {persona.numeroDoc}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${persona.activo ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                  {persona.activo ? 'Activo' : 'Inactivo'}
                </span>
                <Link to={`/personas/${persona.id}`} className="btn-outline text-xs">
                  Ver persona
                </Link>
              </div>
            </div>

            {/* Datos de la ocupación */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 text-sm border-t border-gray-100 pt-4">
              <Dato label="En el cargo desde" value={desdeOcup} />
              <Dato label="Situación de revista" value={ocup?.situacionRevista} />
              <Dato label="Estado"               value={ocup?.estadoPersona} />
              <Dato label="Comisión"             value={ocup?.comision} />
              {ocup?.codigoJefaturas && (
                <Dato label="Jefatura" value={`${ocup.codigoJefaturas}${ocup.jefeEscalafon ? ` — ${ocup.jefeEscalafon}` : ''}`} />
              )}
            </div>

            {/* Cargo activo (cuando retiene este cargo y está activo en otro) */}
            {retenido && cargo.cargoActivo && (
              <div className="mt-4 pt-4 border-t border-amber-100 bg-amber-50 rounded-lg px-4 py-3">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Cubre en</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                  <Dato label="Cargo" value={cargo.cargoActivo.cargo.codigo ?? cargo.cargoActivo.cargo.idSial} />
                  <Dato label="Puesto" value={cargo.cargoActivo.cargo.literalPuesto} />
                  <Dato label="Hospital" value={`${cargo.cargoActivo.cargo.hospital.sigla} — ${cargo.cargoActivo.cargo.hospital.nombre}`} />
                </div>
                <div className="mt-2">
                  <Link to={`/cargos/${cargo.cargoActivo.cargoId}`} className="btn-outline text-xs">
                    Ver cargo activo
                  </Link>
                </div>
              </div>
            )}
            {retenido && !cargo.cargoActivo && (
              <p className="mt-3 text-xs text-amber-600 italic">Retiene este cargo — sin cargo activo registrado.</p>
            )}
          </div>
        )}
      </div>

      {/* Concursos CPH */}
      {cargo.concursosCph.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="bg-navy px-6 py-3 flex items-center justify-between">
            <h2 className="text-white font-semibold text-sm uppercase tracking-wide">Concursos CPH</h2>
            <span className="text-white/60 text-xs">{cargo.concursosCph.length} registro{cargo.concursosCph.length !== 1 ? 's' : ''}</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Sub-estado</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">EE Baja</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Persona designada</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Inicio</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cargo.concursosCph.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      c.estado === EstadoConcursoCph.FINALIZADO ? 'bg-green-100 text-green-800'
                      : c.estado === EstadoConcursoCph.DESIERTO ? 'bg-red-100 text-red-700'
                      : c.estado === EstadoConcursoCph.SUSPENDIDO ? 'bg-yellow-100 text-yellow-700'
                      : c.estado === EstadoConcursoCph.ACTIVO ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-600'
                    }`}>{c.estado}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{c.subEstado ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{c.eeBaja ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {c.personaDesignada
                      ? <Link to={`/personas/${c.personaDesignada.id}`} className="text-secondary hover:underline text-xs">{c.personaDesignada.apellidoNombre}</Link>
                      : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fechaCorta(c.concurso.fechaVacante)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/concursos-cph/${c.id}`} className="btn-outline">Ver</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Concursos CEETPS */}
      {cargo.concursosCeetps.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="bg-navy px-6 py-3 flex items-center justify-between">
            <h2 className="text-white font-semibold text-sm uppercase tracking-wide">Concursos CEETPS</h2>
            <span className="text-white/60 text-xs">{cargo.concursosCeetps.length} registro{cargo.concursosCeetps.length !== 1 ? 's' : ''}</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Escalafón</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Puesto solicitado</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Persona designada</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Inicio</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cargo.concursosCeetps.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      c.estado === EstadoConcursoCeetps.FINALIZADO ? 'bg-green-100 text-green-800'
                      : c.estado === EstadoConcursoCeetps.DESIERTO ? 'bg-red-100 text-red-700'
                      : c.estado === EstadoConcursoCeetps.EN_PROCESO ? 'bg-blue-100 text-blue-800'
                      : c.estado === EstadoConcursoCeetps.AUTORIZADO ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-gray-100 text-gray-600'
                    }`}>{c.estado}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{c.escalafon.nombre}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{c.puestoSolicitado ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {c.personaDesignada
                      ? <Link to={`/personas/${c.personaDesignada.id}`} className="text-secondary hover:underline text-xs">{c.personaDesignada.apellidoNombre}</Link>
                      : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fechaCorta(c.concurso.fechaVacante)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/concursos-ceetps/${c.id}`} className="btn-outline">Ver</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Historial de personas */}
      {cargo.historial.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="bg-navy px-6 py-3 flex items-center justify-between">
            <h2 className="text-white font-semibold text-sm uppercase tracking-wide">
              Historial de personas
            </h2>
            <span className="text-white/60 text-xs">{cargo.historial.length} registro{cargo.historial.length !== 1 ? 's' : ''}</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Persona</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">CUIL</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Desde</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Hasta</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Situación</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cargo.historial.map((h) => (
                <tr key={h.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{h.persona.apellidoNombre}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{h.persona.cuil}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {fechaCorta(h.cargoDesdeFecha ?? h.desde)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{fechaCorta(h.hasta)}</td>
                  <td className="px-4 py-3 text-gray-500">{h.situacionRevista ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/personas/${h.persona.id}`} className="btn-outline">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
