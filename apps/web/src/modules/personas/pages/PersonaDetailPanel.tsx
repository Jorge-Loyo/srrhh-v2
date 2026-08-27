import { Link, useParams, useLocation } from 'react-router-dom'
import type { OcupacionConCargo } from '@srrhh/types'
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

// Regla de duplicados del sistema SIAL: cuando una persona tiene dos ocupaciones
// vigentes con el mismo codigo_repa + literal_puesto, y una tiene codigo_jefaturas
// con valor y la otra no, la que no tiene codigo_jefaturas es un fantasma del
// sistema — se oculta. Aplica a ~10 casos en la DB (ej: Directores con P60).
function filtrarDuplicados(ocupaciones: OcupacionConCargo[]): OcupacionConCargo[] {
  // Solo considerar vigentes (hasta == null) para la detección
  const vigentes = ocupaciones.filter((o) => !o.hasta)

  // Agrupar vigentes por (codigo_repa, literal_puesto)
  const grupos = new Map<string, OcupacionConCargo[]>()
  for (const o of vigentes) {
    const key = `${o.cargo.codigoRepa ?? ''}|${o.cargo.literalPuesto ?? ''}`
    const arr = grupos.get(key) ?? []
    arr.push(o)
    grupos.set(key, arr)
  }

  // IDs a ocultar: en grupos de 2+ donde hay al menos uno con jefatura y al
  // menos uno sin, ocultar los que no tienen jefatura
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

  if (isLoading) return <p className="text-sm text-gray-400 p-6">Cargando persona...</p>
  if (isError || !persona) return <p className="text-sm text-danger p-6">No se pudo cargar la persona.</p>

  const edad = calcEdad(persona.fechaNacimiento)
  const fechaNac = formatFecha(persona.fechaNacimiento)
  const ocupacionesVisibles = filtrarDuplicados(persona.ocupaciones)

  return (
    <div className="space-y-4">
      <Link to={volverHref} className="inline-flex items-center gap-1 text-sm text-secondary hover:underline">
        ← Volver a Personas
      </Link>

      {/* Datos personales */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="bg-navy px-6 py-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-white text-xl font-bold leading-tight">{persona.apellidoNombre}</h1>
            <p className="text-white/70 text-sm mt-0.5">CUIL {persona.cuil}</p>
            {(() => {
              const puestoVisible = ocupacionesVisibles.find((o) => !o.hasta && !o.situacionRevista?.toLowerCase().includes('retencion'))
                ?? ocupacionesVisibles.find((o) => !o.hasta)
              return puestoVisible?.cargo.literalPuesto
                ? <p className="text-white/90 text-sm font-medium mt-1">{puestoVisible.cargo.literalPuesto}</p>
                : null
            })()}
          </div>
          <span className={`mt-1 shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${persona.activo ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
            {persona.activo ? 'Activo' : 'Inactivo'}
          </span>
        </div>

        <div className="divide-y divide-gray-100">
          <Section title="Identificación">
            <Dato label="Documento" value={persona.numeroDoc ? `${persona.tipoDoc ?? ''} ${persona.numeroDoc}`.trim() : null} />
            <Dato label="Sexo" value={persona.sexo} />
            <Dato label="Fecha de nacimiento" value={fechaNac} />
            {edad !== null && <Dato label="Edad" value={`${edad} años`} />}
            <Dato label="Especialidad principal" value={persona.especialidadPrincipal} />
            <Dato label="Primer cargo en Salud" value={formatFecha(persona.antiguedadDesde)} />
            {persona.antiguedadDesde && calcEdad(persona.antiguedadDesde) !== null && (
              <Dato label="Años de antigüedad" value={`${calcEdad(persona.antiguedadDesde)} años`} />
            )}
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
            Ocupaciones ({ocupacionesVisibles.length})
          </h2>
        </div>

        {ocupacionesVisibles.length === 0 ? (
          <p className="p-6 text-sm text-gray-400 text-center">Sin ocupaciones registradas.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {ocupacionesVisibles.map((o) => {
              const esRetencion = o.situacionRevista?.toLowerCase().includes('retencion') || o.situacionRevista?.toLowerCase().includes('retención')
              return (
                <div key={o.id} className={`px-6 py-4 ${esRetencion ? 'bg-gray-50' : ''}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-semibold uppercase tracking-wide ${esRetencion ? 'text-gray-400' : 'text-navy'}`}>
                      {o.cargo.codigoRepa
                        ? `${o.cargo.codigoRepa} — ${o.cargo.descripcionRepa}`
                        : (o.cargo.descripcionRepa ?? o.cargo.hospital?.sigla ?? '—')}
                    </span>
                    <span className={o.hasta ? 'badge-default' : esRetencion ? 'badge-warning' : 'badge-success'}>
                      {o.hasta ? 'Histórica' : esRetencion ? 'Retención' : 'Vigente'}
                    </span>
                  </div>
                  <dl className={`grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm ${esRetencion ? 'opacity-60' : ''}`}>
                    <Dato label="Escalafón" value={o.cargo.escalafon?.nombre} />
                    <Dato label="Régimen" value={o.cargo.codigoRegistro ? `${o.cargo.codigoRegistro.codigo} — ${o.cargo.codigoRegistro.literal}` : null} />
                    <Dato label="Puesto" value={o.cargo.literalPuesto} />
                    <Dato label="Especialidad" value={o.cargo.especialidad} />
                    <Dato label="Situación de revista" value={o.situacionRevista} />
                    <Dato label="Estado" value={o.estadoPersona} />
                    <Dato label="Cód. situación" value={o.codSituacion} />
                    {o.documentacionDelRol && <Dato label="Documentación del rol" value={o.documentacionDelRol} />}
                    {o.comision && <Dato label="Comisión" value={o.comision} />}
                    {o.cargoDesdeFecha && <Dato label="Cargo desde" value={formatFecha(o.cargoDesdeFecha)} />}
                    {o.cargoHastaFecha && <Dato label="Cargo hasta" value={formatFecha(o.cargoHastaFecha)} />}
                  </dl>
                </div>
              )
            })}
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
