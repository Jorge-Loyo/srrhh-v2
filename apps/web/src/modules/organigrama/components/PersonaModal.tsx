import { UserCircleIcon, XMarkIcon, BriefcaseIcon, IdentificationIcon } from '@heroicons/react/24/outline'
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

interface Props {
  open: boolean
  onClose: () => void
  data: PersonaSeleccionada | null
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>

        {/* Header — persona */}
        <div className="bg-gradient-to-br from-primary-800 to-primary-600 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <UserCircleIcon className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-white font-bold text-base leading-tight truncate">{persona.nombre}</p>
                <p className="text-primary-200 text-xs mt-0.5">CUIL {formatCuil(persona.cuil)}</p>
              </div>
            </div>
            <button onClick={onClose} className="flex-shrink-0 p-1 rounded-lg text-white/70 hover:bg-white/15 hover:text-white transition-colors">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Puesto en el organigrama */}
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
          {nodeTitle && (
            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${tipoColor(nodeTitle)}`}>
              {nodeTitle}
            </span>
          )}
          <p className="text-sm text-gray-700 font-medium truncate">{stripRedundantPrefix(nodeName)}</p>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Datos personales */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Persona</p>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Fecha de nac." value={formatFecha(persona.fechaNacimiento)} />
              <Stat label="Edad" value={edad != null ? `${edad} años` : '—'} />
              <Stat label="Antigüedad en Salud" value={antiguedad != null ? `${antiguedad} años` : '—'} />
              <Stat label="En el cargo desde" value={formatFecha(persona.cargoDesde)} />
            </div>
          </div>

          {/* Datos del cargo */}
          {(persona.cargo || persona.codigoCargo || idSialCorto) && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Cargo</p>
              <div className="bg-gray-50 rounded-lg px-3 py-2.5 space-y-1.5">
                {persona.cargo && (
                  <p className="text-sm font-semibold text-gray-900">{persona.cargo}</p>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  {persona.codigoCargo && (
                    <span className="font-mono text-xs text-primary-700 bg-primary-50 px-2 py-0.5 rounded">
                      {persona.codigoCargo}
                    </span>
                  )}
                  {idSialCorto && (
                    <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      SIAL {idSialCorto}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Botones de navegación */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => go(`/personas/${persona.personaId}`)}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold transition-colors"
            >
              <IdentificationIcon className="w-4 h-4" />
              Ver persona
            </button>
            <button
              onClick={() => persona.cargoId && go(`/cargos/${persona.cargoId}`)}
              disabled={!persona.cargoId}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
