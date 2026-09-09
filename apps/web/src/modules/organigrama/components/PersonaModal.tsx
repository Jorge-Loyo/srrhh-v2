import { UserCircleIcon, XMarkIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { useNavigate } from 'react-router-dom'
import { tipoColor } from '../lib/organigramaHelpers'
import type { PersonaSeleccionada } from './OrganigramaTreeNode'

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// Mismo cálculo que PersonaDetailPanel.tsx (personas/pages) — sin extraer a un
// helper compartido a propósito, ese archivo tampoco lo hace.
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

// Ficha rápida de una persona asignada a un puesto del organigrama, con los
// datos que ya vienen embebidos en la respuesta de /api/v1/organigrama (sin
// pedir nada nuevo al backend al hacer click).
export default function PersonaModal({ open, onClose, data }: Props) {
  const navigate = useNavigate()
  if (!open || !data) return null
  const { persona, nodeName, nodeTitle } = data
  const edad = calcAnios(persona.fechaNacimiento)
  const antiguedad = calcAnios(persona.antiguedadDesde)

  const campos = [
    { label: 'CUIL', value: formatCuil(persona.cuil) },
    { label: 'Fecha de nacimiento', value: formatFecha(persona.fechaNacimiento) },
    { label: 'Edad', value: edad != null ? `${edad} años` : '—' },
    { label: 'Antigüedad', value: antiguedad != null ? `${antiguedad} años` : '—' },
    { label: 'En el cargo desde', value: formatFecha(persona.cargoDesde) },
    { label: 'En el cargo hasta', value: persona.cargoHasta ? formatFecha(persona.cargoHasta) : 'Actual' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 rounded-t-2xl bg-gradient-to-r from-primary-700 to-primary-600 border-b-2 border-primary-800">
          <span className="text-white font-bold text-base tracking-wide flex items-center gap-2 min-w-0">
            <UserCircleIcon className="w-5 h-5 flex-shrink-0" />
            <span className="truncate">{persona.nombre}</span>
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => { onClose(); navigate(`/personas/${persona.personaId}`) }}
              title="Ver perfil completo"
              className="p-1 rounded text-white/80 hover:bg-white/15 hover:text-white flex items-center gap-1 text-xs"
            >
              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1 rounded text-white/80 hover:bg-white/15 hover:text-white">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {nodeName && (
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
              {nodeTitle && (
                <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${tipoColor(nodeTitle)}`}>{nodeTitle}</span>
              )}
              <span className="text-sm text-gray-600 font-medium">
                {persona.cargo ? `${persona.cargo} · ` : ''}
                {nodeName}
              </span>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-4">
            {campos.map((c) => (
              <div key={c.label}>
                <dt className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">{c.label}</dt>
                <dd className="text-sm text-gray-900 font-semibold mt-0.5">{c.value}</dd>
              </div>
            ))}
          </dl>
          {(persona.idSialRol || persona.codigoCargo) && (
            <p className="mt-3 pt-3 border-t border-gray-100 text-[11px] text-gray-400 font-mono space-x-4">
              {persona.codigoCargo && <span>Cargo: {persona.codigoCargo}</span>}
              {persona.idSialRol && <span>ID SIAL: {persona.idSialRol}</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
