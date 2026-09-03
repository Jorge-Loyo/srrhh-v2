import { useState } from 'react'
import { Link, useParams, useLocation } from 'react-router-dom'
import type { OcupacionConCargo, PersonaDetail } from '@srrhh/types'
import { usePersona, usePersonaBajasSial } from '../hooks/usePersonas'

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

function filtrarDuplicados(ocupaciones: OcupacionConCargo[]): OcupacionConCargo[] {
  const vigentes = ocupaciones.filter((o) => !o.hasta)
  const grupos = new Map<string, OcupacionConCargo[]>()
  for (const o of vigentes) {
    const key = `${o.cargo.codigoRepa ?? ''}|${o.cargo.literalPuesto ?? ''}`
    const arr = grupos.get(key) ?? []
    arr.push(o)
    grupos.set(key, arr)
  }
  const ocultar = new Set<string>()
  for (const grupo of grupos.values()) {
    if (grupo.length < 2) continue
    const conJefatura = grupo.filter((o) => o.codigoJefaturas)
    const sinJefatura = grupo.filter((o) => !o.codigoJefaturas)
    if (conJefatura.length > 0 && sinJefatura.length > 0) {
      for (const o of sinJefatura) ocultar.add(o.id)
    }
  }
  if (ocultar.size === 0) return ocupaciones
  return ocupaciones.filter((o) => !ocultar.has(o.id))
}

export function PersonaDetailPanel() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const fromParams = (location.state as { from?: string } | null)?.from
  const volverHref = fromParams ? `/personas?${fromParams}` : '/personas'
  const { data: persona, isLoading, isError } = usePersona(id)
  const { data: bajasSial = [] } = usePersonaBajasSial(id)

  if (isLoading) return <p className="text-sm text-gray-400 p-6">Cargando persona...</p>
  if (isError || !persona) return <p className="text-sm text-danger p-6">No se pudo cargar la persona.</p>

  const p = persona as PersonaDetail

  const edad = calcEdad(p.fechaNacimiento)
  const fechaNac = formatFecha(p.fechaNacimiento)
  const ocupacionesVisibles = filtrarDuplicados(p.ocupaciones).sort((a, b) => {
    const orden = (o: OcupacionConCargo) => {
      if (o.hasta) return 2
      if (o.situacionRevista?.toLowerCase().includes('retencion')) return 1
      return 0
    }
    return orden(a) - orden(b)
  })

  const idSialPersona = p.ocupaciones[0]?.idSialRol?.split('-')[0] ?? null

  const idSialesEnSistema = new Set(p.ocupaciones.map((o) => o.idSialRol?.split('-').slice(0, 2).join('-')))
  const bajasNoEnSistema = bajasSial.filter((b) => !idSialesEnSistema.has(b.cargo))
  const bajasPorIdSial = new Map(bajasSial.map((b) => [b.cargo, b]))

  const totalSinCodigo =
    p.ocupaciones.filter((o) => !o.cargo.codigo).length +
    bajasNoEnSistema.filter((b) => !b.codigo_cargo).length

  return (
    <div className="space-y-4">
      <Link to={volverHref} className="inline-flex items-center gap-1 text-sm text-secondary hover:underline">
        &larr; Volver a Personas
      </Link>

      {/* Datos personales */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="bg-secondary/10 px-6 py-2">
          <p className="text-xs font-semibold text-secondary uppercase tracking-widest">Datos de la persona</p>
        </div>
        <div className="bg-navy px-6 py-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-white text-xl font-bold leading-tight">{p.apellidoNombre}</h1>
            <p className="text-white/70 text-sm mt-0.5">CUIL {p.cuil}</p>
            {(() => {
              const puestoVisible = ocupacionesVisibles.find((o) => !o.hasta && !o.situacionRevista?.toLowerCase().includes('retencion'))
                ?? ocupacionesVisibles.find((o) => !o.hasta)
              if (!puestoVisible) return null
              return (
                <>
                  {puestoVisible.cargo.literalPuesto && (
                    <p className="text-white/90 text-sm font-medium mt-1">
                      <span className="text-white/50 font-normal">Rol actual: </span>{puestoVisible.cargo.literalPuesto}
                    </p>
                  )}
                  {puestoVisible.cargo.especialidadLegacy ?? puestoVisible.cargo.especialidad ? (
                    <p className="text-white/70 text-xs mt-0.5">
                      <span className="text-white/40 font-normal">Especialidad: </span>{puestoVisible.cargo.especialidadLegacy ?? puestoVisible.cargo.especialidad}
                    </p>
                  ) : null}
                </>
              )
            })()}
          </div>
          <span className={`mt-1 shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${p.activo ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
            {p.activo ? 'Activo' : 'Inactivo'}
          </span>
        </div>

        <div className="divide-y divide-gray-100">
          <Section title="Identificacion">
            <Dato label="Documento" value={p.numeroDoc ? `${p.tipoDoc ?? ''} ${p.numeroDoc}`.trim() : null} />
            <Dato label="Fecha de nacimiento" value={fechaNac} />
            {edad !== null && <Dato label="Edad" value={`${edad} anos`} />}
            <Dato label="ID SIAL" value={idSialPersona} />
            <Dato label="Primer cargo en Salud" value={formatFecha(p.antiguedadDesde)} />
            {p.antiguedadDesde && calcEdad(p.antiguedadDesde) !== null && (
              <Dato label="Anos de antiguedad" value={`${calcEdad(p.antiguedadDesde)} anos`} />
            )}
            <Dato label="Sexo" value={p.sexo} />
            <Dato label="Especialidad principal" value={p.especialidadPrincipal} />
          </Section>

          <Section title="Contacto">
            <Dato label="Telefono" value={p.telefono} />
            <Dato label="Mail personal" value={p.mailPersonal} />
            <Dato label="Mail laboral" value={p.mailLaboral} />
          </Section>

          <Section title="Domicilio">
            <Dato label="Domicilio" value={p.domicilio} />
            <Dato label="Localidad" value={p.localidad} />
            <Dato label="Provincia" value={p.provincia} />
          </Section>
        </div>
      </div>

      {/* Ocupaciones */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="bg-secondary/10 px-6 py-2">
          <p className="text-xs font-semibold text-secondary uppercase tracking-widest">Detalle de cargos</p>
        </div>
        <div className="bg-navy px-6 py-3">
          <h2 className="text-white font-semibold text-sm uppercase tracking-wide">
            Cargos ({ocupacionesVisibles.length})
          </h2>
        </div>

        {ocupacionesVisibles.length === 0 ? (
          <p className="p-6 text-sm text-gray-400 text-center">Sin ocupaciones registradas.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {ocupacionesVisibles.map((o) => {
              const idSialBase = o.idSialRol?.split('-').slice(0, 2).join('-')
              const bajaMatch = idSialBase ? bajasPorIdSial.get(idSialBase) : undefined
              const esRetencion = o.situacionRevista?.toLowerCase().includes('retencion')
              const esHistorico = !!o.hasta
              const esBaja = !!bajaMatch
              const borderColor = esBaja ? 'cargo-historico' : esHistorico ? 'cargo-historico' : esRetencion ? 'cargo-retenido' : 'cargo-activo'
              return (
                <div key={o.id} className={`px-6 py-4 ${borderColor}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div />
                    <div className="flex items-center gap-2">
                      <span className={esBaja ? 'badge-default' : esHistorico ? 'badge-default' : esRetencion ? 'badge-amber' : 'badge-success'}>
                        {esBaja ? 'Baja' : esHistorico ? 'Historica' : esRetencion ? 'Retencion' : 'Vigente'}
                      </span>
                      <Link to={`/cargos/${o.cargo.id}`} className="btn-outline text-xs">
                        Ver cargo
                      </Link>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-x-6 gap-y-3 text-sm">
                    <dl className="space-y-3">
                      <Dato label="Cod. Cargo" value={o.cargo.codigo} />
                      <Dato label="ID SIAL" value={idSialBase} />
                      <Dato label="Escalafon" value={o.cargo.escalafon?.nombre} />
                      <Dato label="Cod. Registro" value={o.cargo.codigoRegistro ? `${o.cargo.codigoRegistro.codigo} - ${o.cargo.codigoRegistro.literal}` : null} />
                    </dl>
                    <dl className="space-y-3">
                      <Dato label="Sigla" value={o.cargo.hospital ? `${o.cargo.hospital.sigla} - ${o.cargo.hospital.nombre}` : null} />
                      <Dato label="Puesto" value={o.cargo.literalPuesto} />
                      <Dato label="Situacion de revista" value={esBaja ? 'Baja' : o.situacionRevista} />
                      <Dato label="Documentacion del rol" value={o.documentacionDelRol} />
                    </dl>
                    <dl className="space-y-3">
                      <Dato label="Reparticion" value={o.cargo.codigoRepa ? `${o.cargo.codigoRepa} - ${o.cargo.descripcionRepa}` : o.cargo.descripcionRepa} />
                      <Dato label="Especialidad" value={o.cargo.especialidadLegacy ?? o.cargo.especialidad} />
                      <Dato label="Desde" value={formatFecha(o.cargoDesdeFecha)} />
                      {!esBaja && <Dato label="Hasta" value={formatFecha(o.cargoHastaFecha)} />}
                    </dl>
                  </div>
                  {esBaja && (
                    <div className="mt-3 pt-3 border-t border-red-100 grid grid-cols-3 gap-x-6 gap-y-3 text-sm">
                      <Dato label="Fecha de baja" value={formatFecha(bajaMatch.cargo_hasta)} />
                      <Dato label="Motivo de baja" value={bajaMatch.mot_baja} />
                      {bajaMatch.doc_resp_baja && <Dato label="Doc. baja" value={bajaMatch.doc_resp_baja} />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Historial de roles SIAL — collapsible */}
      <CollapsibleSection
        label="Historial de roles SIAL"
        title={`Id SIAL Rol (${p.ocupaciones.length + bajasNoEnSistema.length})`}
        badge={totalSinCodigo > 0 ? `⚠ ${totalSinCodigo} sin codigo de cargo asignado` : undefined}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 font-semibold">Id SIAL Rol</th>
                <th className="px-4 py-3 font-semibold">Cod. Cargo</th>
                <th className="px-4 py-3 font-semibold">Puesto</th>
                <th className="px-4 py-3 font-semibold">Escalafon</th>
                <th className="px-4 py-3 font-semibold">Hospital</th>
                <th className="px-4 py-3 font-semibold">Especialidad</th>
                <th className="px-4 py-3 font-semibold">Desde</th>
                <th className="px-4 py-3 font-semibold">Hasta</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {p.ocupaciones
                .sort((a, b) => (!a.hasta && b.hasta ? -1 : a.hasta && !b.hasta ? 1 : 0))
                .map((o) => {
                  const sinCodigo = !o.cargo.codigo
                  const idSialBase = o.idSialRol?.split('-').slice(0, 2).join('-')
                  const bajaRol = idSialBase ? bajasPorIdSial.get(idSialBase) : undefined
                  return (
                    <tr key={o.id} className={sinCodigo ? 'bg-amber-50 hover:bg-amber-100' : bajaRol ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{o.idSialRol ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {sinCodigo
                          ? <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">&#9888; Sin asignar</span>
                          : <Link to={`/cargos/${o.cargo.id}`} className="text-secondary hover:underline font-semibold">{o.cargo.codigo}</Link>
                        }
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{o.cargo.literalPuesto ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{o.cargo.escalafon?.nombre ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{o.cargo.hospital?.sigla ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{o.cargo.especialidadLegacy ?? o.cargo.especialidad ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatFecha(o.cargoDesdeFecha) ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatFecha(o.cargoHastaFecha) ?? '—'}</td>
                      <td className="px-4 py-3">
                        {bajaRol ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                              Baja — {bajaRol.mot_baja ?? 'sin motivo'}
                            </span>
                            {bajaRol.cargo_hasta && (
                              <span className="text-xs text-gray-500 pl-1">{formatFecha(bajaRol.cargo_hasta)}</span>
                            )}
                          </div>
                        ) : o.hasta ? (
                          <span className="badge-default text-xs">Historica</span>
                        ) : (
                          <span className="badge-success text-xs">Vigente</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              {bajasNoEnSistema.map((b) => {
                const sinCodigo = !b.codigo_cargo
                return (
                  <tr key={b.cargo} className={sinCodigo ? 'bg-amber-50 hover:bg-amber-100' : 'bg-red-50 hover:bg-red-100'}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{b.cargo}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {sinCodigo
                        ? <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">&#9888; Sin asignar</span>
                        : <span className="text-gray-700 font-semibold">{b.codigo_cargo}</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{b.lit_puesto ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{b.escalafon ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">—</td>
                    <td className="px-4 py-3 text-xs text-gray-400">—</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatFecha(b.cargo_desde) ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatFecha(b.cargo_hasta) ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                        Baja — {b.mot_baja ?? 'sin motivo'}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {p.ocupaciones.length === 0 && bajasNoEnSistema.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-sm text-gray-400">Sin roles registrados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      {/* S8C-2: Historial padrón semanal — collapsible */}
      {p.padronHistorico.length > 0 && (
        <CollapsibleSection
          label="Historial padrón semanal"
          title={`Apariciones en padrón (${p.padronHistorico.length})`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left text-xs uppercase tracking-wide border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">ID SIAL Rol</th>
                  <th className="px-4 py-3 font-semibold">Hospital</th>
                  <th className="px-4 py-3 font-semibold">Escalafón</th>
                  <th className="px-4 py-3 font-semibold">Puesto</th>
                  <th className="px-4 py-3 font-semibold">Especialidad</th>
                  <th className="px-4 py-3 font-semibold">Situación</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {p.padronHistorico.map((h) => (
                  <tr key={h.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-xs text-gray-700 font-medium whitespace-nowrap">
                      {formatFecha(h.snapshot.fechaAsignada) ?? h.snapshot.fechaAsignada.slice(0, 10)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{h.idSialRol}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{h.hospitalSigla ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{h.escalafon ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{h.literalPuesto ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{h.especialidad ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{h.situacionRevista ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{h.estadoPersona ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>
      )}
    </div>
  )
}

function CollapsibleSection({
  label, title, badge, children,
}: {
  label: string
  title: string
  badge?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="bg-secondary/10 px-6 py-2">
        <p className="text-xs font-semibold text-secondary uppercase tracking-widest">{label}</p>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full bg-navy px-6 py-3 flex items-center justify-between cursor-pointer hover:bg-navy/90 transition-colors"
      >
        <h2 className="text-white font-semibold text-sm uppercase tracking-wide">{title}</h2>
        <div className="flex items-center gap-3">
          {badge && <span className="text-xs font-semibold text-amber-300">{badge}</span>}
          <span className="text-white/70 text-xs">{open ? '▲ Cerrar' : '▼ Ver'}</span>
        </div>
      </button>
      {open && children}
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
