// Pestaña "Jurados" de la página de concursos CPH. Lista los jurados
// confirmados y vigentes (6 meses desde la fecha de sorteo) que pueden
// reutilizarse en otros concursos compatibles (mismas 3 reglas del sorteo).
import { Link } from 'react-router-dom'
import type { JuradoVigente, MiembroJuradoSorteado } from '@srrhh/types'
import { useJuradosVigentes } from '../hooks/useConcursosCph'

// Formatea una fecha ISO a DD/MM/AAAA (o '—').
function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—'
  return iso.slice(0, 10).split('-').reverse().join('/')
}

// Días restantes hasta el vencimiento (negativo = vencido, no debería pasar
// porque el backend ya filtra por vigencia).
function diasRestantes(vencimientoIso: string): number {
  const venc = new Date(vencimientoIso).getTime()
  const hoy = Date.now()
  return Math.ceil((venc - hoy) / (24 * 60 * 60 * 1000))
}

function MiembroChip({ m }: { m: MiembroJuradoSorteado }) {
  return (
    <li className="flex flex-wrap items-center gap-1.5 py-0.5 text-xs text-gray-700">
      <span className="font-medium">{m.apellidoNombre}</span>
      {m.especialidad && <span className="text-gray-400">· {m.especialidad}</span>}
      {m.hospitalNombre && <span className="text-gray-400">· {m.hospitalNombre}</span>}
      {m.esConduccion && (
        <span className="rounded bg-indigo-50 px-1.5 text-[10px] text-indigo-600">conducción</span>
      )}
      {m.reglaAplicada != null && (
        <span className="rounded bg-gray-100 px-1.5 text-[10px] text-gray-500">
          regla {m.reglaAplicada}
        </span>
      )}
    </li>
  )
}

function JuradoCard({ j }: { j: JuradoVigente }) {
  const cargo = j.concursoCph?.concurso?.cargo
  const titulares = j.miembros.filter((m) => m.rol === 'titular')
  const suplentes = j.miembros.filter((m) => m.rol === 'suplente')
  const especialidad =
    j.concursoCph?.especialidadSolicitada ??
    cargo?.especialidadLegacy ??
    j.criterios?.especialidadConcurso ??
    '—'
  const dias = diasRestantes(j.fechaVencimiento)

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-primary text-sm font-bold text-gray-900">
            {cargo?.codigo ?? cargo?.literalPuesto ?? 'Concurso'}
          </p>
          <p className="text-xs text-gray-500">
            {especialidad}
            {cargo?.hospital?.sigla && ` · ${cargo.hospital.sigla}`}
          </p>
        </div>
        <div className="text-right text-xs">
          <span
            className={`inline-block rounded-full px-2 py-0.5 font-medium ${
              dias <= 30 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
            }`}
          >
            Vence {fechaCorta(j.fechaVencimiento)}
          </span>
          <p className="mt-1 text-gray-400">Sorteo {fechaCorta(j.fechaSorteo)}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Titulares
          </p>
          <ul>
            {titulares.map((m) => (
              <MiembroChip key={m.id} m={m} />
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Suplentes
          </p>
          <ul>
            {suplentes.map((m) => (
              <MiembroChip key={m.id} m={m} />
            ))}
          </ul>
        </div>
      </div>

      {j.concursoCph?.id && (
        <div className="mt-3 border-t border-gray-100 pt-2 text-right">
          <Link
            to={`/concursos/cph/${j.concursoCph.id}/wizard`}
            className="text-xs text-secondary hover:underline"
          >
            Ver concurso de origen →
          </Link>
        </div>
      )}
    </div>
  )
}

export function JuradosTab() {
  const { data: jurados = [], isLoading, isError } = useJuradosVigentes()

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="font-primary text-lg font-bold text-gray-900">Jurados vigentes</h2>
        <p className="text-sm text-gray-500">
          Jurados confirmados dentro de los últimos 6 meses, disponibles para reutilizar en
          concursos compatibles (mismo escalafón, especialidad y las reglas del sorteo).
        </p>
      </div>

      {isLoading && <p className="p-6 text-sm text-gray-400">Cargando jurados…</p>}
      {isError && (
        <p className="p-6 text-sm text-danger">No se pudo cargar el listado de jurados vigentes.</p>
      )}
      {!isLoading && !isError && jurados.length === 0 && (
        <p className="rounded-lg bg-white p-6 text-center text-sm text-gray-400 shadow-sm">
          No hay jurados confirmados vigentes en este momento.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {jurados.map((j) => (
          <JuradoCard key={j.id} j={j} />
        ))}
      </div>
    </div>
  )
}
