import { UserCircleIcon, XMarkIcon, BriefcaseIcon, IdentificationIcon, EnvelopeIcon, PhoneIcon, BuildingOffice2Icon } from '@heroicons/react/24/outline'
import { useNavigate } from 'react-router-dom'
import { tipoColor, stripRedundantPrefix } from '../lib/organigramaHelpers'
import type { PersonaSeleccionada } from './OrganigramaTreeNode'

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function calcAnios(iso: string | null): number | null {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  const hoy = new Date()
  let anios = hoy.getFullYear() - y
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) anios--
  return anios
}

function formatCuil(cuil: string | undefined): string {
  const digits = String(cuil ?? '').replace(/\D/g, '')
  if (digits.length !== 11) return cuil ? String(cuil) : '—'
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`
}

function toTitleCase(s: string | null): string | null {
  if (!s) return null
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

interface Props {
  open: boolean
  onClose: () => void
  data: PersonaSeleccionada | null
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400 font-medium shrink-0">{label}</span>
      <span className="text-xs text-gray-800 font-semibold text-right">{value}</span>
    </div>
  )
}

export default function PersonaModal({ open, onClose, data }: Props) {
  const navigate = useNavigate()
  if (!open || !data) return null
  const { persona, nodeName, nodeTitle } = data

  const edad = calcAnios(persona.fechaNacimiento)
  const antiguedad = calcAnios(persona.antiguedadDesde)
  const idSialCorto = persona.idSialRol ? persona.idSialRol.split('-').slice(0, 2).join('-') : null
  const go = (path: string) => { onClose(); navigate(path) }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>

        {/* ── Header azul navy ── */}
        <div className="relative bg-navy px-6 pt-5 pb-5">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg text-white/50 hover:bg-white/10 hover:text-white transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-secondary/30 border border-white/20 flex items-center justify-center flex-shrink-0">
              <UserCircleIcon className="w-8 h-8 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-lg leading-tight">{persona.nombre}</p>
              {persona.especialidadPersona && (
                <p className="text-secondary-light text-sm mt-0.5">{toTitleCase(persona.especialidadPersona)}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full font-mono">
                  CUIL {formatCuil(persona.cuil)}
                </span>
                {persona.sexo && (
                  <span className="text-xs bg-white/10 text-white/80 px-2 py-0.5 rounded-full">
                    {persona.sexo === 'M' ? 'Masculino' : persona.sexo === 'F' ? 'Femenino' : persona.sexo}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Puesto en el organigrama */}
          <div className="mt-4 bg-white/10 border border-white/15 rounded-xl px-3 py-2 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              {nodeTitle && (
                <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${tipoColor(nodeTitle)}`}>
                  {nodeTitle}
                </span>
              )}
              <p className="text-white/90 text-sm font-medium">{stripRedundantPrefix(nodeName)}</p>
            </div>
            {persona.hospital && (
              <p className="text-white/60 text-xs flex items-center gap-1">
                <BuildingOffice2Icon className="w-3.5 h-3.5 flex-shrink-0" />
                {persona.hospital}
              </p>
            )}
          </div>
        </div>

        <div className="p-5 space-y-4">

          {/* ── Datos personales ── */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-secondary mb-2">Datos personales</p>
            <div className="bg-gray-50 rounded-xl px-4 py-1">
              <Row label="Fecha de nacimiento" value={edad != null ? `${formatFecha(persona.fechaNacimiento)} (${edad} años)` : formatFecha(persona.fechaNacimiento)} />
              <Row label="Antigüedad en Salud" value={persona.antiguedadDesde ? `Desde ${formatFecha(persona.antiguedadDesde)}${antiguedad != null ? ` (${antiguedad} años)` : ''}` : null} />
              {persona.mailLaboral && (
                <div className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-100">
                  <span className="text-xs text-gray-400 font-medium flex items-center gap-1.5 shrink-0">
                    <EnvelopeIcon className="w-3.5 h-3.5" /> Mail laboral
                  </span>
                  <a href={`mailto:${persona.mailLaboral}`} className="text-xs text-secondary font-semibold hover:underline text-right truncate">
                    {persona.mailLaboral}
                  </a>
                </div>
              )}
              {persona.telefono && (
                <div className="flex items-center justify-between gap-3 py-1.5">
                  <span className="text-xs text-gray-400 font-medium flex items-center gap-1.5 shrink-0">
                    <PhoneIcon className="w-3.5 h-3.5" /> Teléfono
                  </span>
                  <span className="text-xs text-gray-800 font-semibold">{persona.telefono}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Datos del cargo ── */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-secondary mb-2">Cargo en el organigrama</p>
            <div className="bg-gray-50 rounded-xl px-4 py-1">
              <Row label="Puesto" value={persona.cargo} />
              <Row label="Especialidad" value={toTitleCase(persona.especialidadCargo)} />
              <Row label="Escalafón" value={persona.escalafon} />
              <Row label="En el cargo desde" value={formatFecha(persona.cargoDesde)} />
              <Row label="En el cargo hasta" value={persona.cargoHasta ? formatFecha(persona.cargoHasta) : 'Actual'} />
              {persona.codigoCargo && <Row label="Código de cargo" value={persona.codigoCargo} />}
              {idSialCorto && <Row label="ID SIAL Rol" value={idSialCorto} />}
            </div>
          </div>

          {/* ── Botones ── */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={() => go(`/personas/${persona.personaId}`)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-navy hover:bg-navy/90 text-white text-sm font-semibold transition-colors shadow-sm"
            >
              <IdentificationIcon className="w-4 h-4" />
              Ver persona
            </button>
            <button
              onClick={() => persona.cargoId && go(`/cargos/${persona.cargoId}`)}
              disabled={!persona.cargoId}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-secondary/30 bg-secondary/5 hover:bg-secondary/10 text-secondary text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <BriefcaseIcon className="w-4 h-4" />
              Ver cargo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
