import { useState } from 'react'
import { capitalizar } from '@/shared/lib/utils'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import {
  DOTACION_SIN_DATO, useDotacionDesglose, useDotacionCarreraTabla,
  type DotacionFilters, type DotacionCarreraTablaFila,
} from '../hooks/useDotacion'

// Panel por hospital: Nivel 1 = lista de Carreras. Al tocar una carrera se
// abre un MODAL con un explorador tipo árbol de archivos — cada fila con
// sub-niveles tiene una flechita que la va "sub-abriendo" con clicks (Planta/
// Guardia → Jefe/No jefe → Especialidad → Puesto), mostrando siempre la
// Situación de Revista como columnas. Los niveles que esa carrera no usa
// (ej. Enfermería no tiene guardia) se saltan solos. Doble click en
// cualquier número lleva al Listado con ese filtro puntual.

type NivelAgrupador = 'modalidad' | 'conduccion' | 'especialidad'
// Conducción antes que Modalidad: un puesto de jefatura (Jefe de Unidad,
// Director, etc.) supervisa tanto planta como guardia, así que su modalidad
// en el catálogo es "ambos" — no es un error ni una tercera opción real de
// Planta/Guardia. Abriendo primero por Jefe/No jefe, el "ambos" de los jefes
// ni siquiera llega a mostrarse como nivel (no divide nada ahí: es siempre
// "ambos"), y "No jefe" queda limpio con el binario Planta/Guardia real.
const ORDEN_NIVELES: NivelAgrupador[] = ['conduccion', 'modalidad', 'especialidad']

function valorParaFiltro(valor: string): string {
  return valor === 'Sin dato' ? DOTACION_SIN_DATO : valor
}

// "Sin dato" es el sentinel genérico que usa el backend para cualquier NULL
// (ver DOTACION_SIN_DATO) — acá se traduce a una etiqueta que diga QUÉ falta,
// sin tocar el valor que viaja al filtro (eso sigue siendo 'Sin dato' tal
// cual, ver valorParaFiltro).
function etiquetaSinDato(campo: 'puesto' | 'especialidad' | 'situación'): string {
  return `Sin ${campo}`
}

function etiquetaDeValor(nivel: NivelAgrupador, valor: string): string {
  if (nivel === 'modalidad') return valor === 'pof' ? 'Planta' : valor === 'pou' ? 'Guardia' : 'Ambos'
  if (valor === 'Sin dato') return nivel === 'especialidad' ? etiquetaSinDato('especialidad') : valor
  if (nivel === 'especialidad') return capitalizar(valor)
  return valor
}

function aplicarNivelAlFiltro(filtros: DotacionFilters, nivel: NivelAgrupador, valor: string): DotacionFilters {
  if (nivel === 'modalidad') return { ...filtros, modalidad: valor as 'pof' | 'pou' | 'ambos' }
  if (nivel === 'conduccion') return { ...filtros, conduccion: [valor] }
  return { ...filtros, especialidadNombre: [valorParaFiltro(valor)] }
}

function agruparPor<T>(filas: T[], campo: keyof T): Map<string, T[]> {
  const mapa = new Map<string, T[]>()
  for (const f of filas) {
    const key = String(f[campo])
    if (!mapa.has(key)) mapa.set(key, [])
    mapa.get(key)!.push(f)
  }
  return mapa
}

function contarPorSituacion(filas: DotacionCarreraTablaFila[], situaciones: string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  situaciones.forEach((s) => { counts[s] = 0 })
  filas.forEach((f) => { counts[f.situacion] = (counts[f.situacion] ?? 0) + f.total })
  return counts
}

function sumarCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((s, v) => s + v, 0)
}

function ordenarPorTotalDesc<T>(entradas: [string, T[]][], situaciones: string[]): [string, T[]][] {
  return [...entradas].sort((a, b) =>
    sumarCounts(contarPorSituacion(b[1] as DotacionCarreraTablaFila[], situaciones)) -
    sumarCounts(contarPorSituacion(a[1] as DotacionCarreraTablaFila[], situaciones)))
}

interface Props {
  sigla: string
  filters: DotacionFilters
  escalafonNombreToId: (nombre: string) => string
  onDrill: (filtros: DotacionFilters) => void
}

export function DotacionHospitalPanel({ sigla, filters, escalafonNombreToId, onDrill }: Props) {
  const { data, isLoading } = useDotacionDesglose('escalafon', filters, { enabled: true })
  const [carreraModal, setCarreraModal] = useState<{ nombre: string; filtros: DotacionFilters } | null>(null)

  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{sigla} — Carreras</p>
      {isLoading && <p className="text-xs text-gray-400 py-2">Cargando...</p>}
      <div className="space-y-0.5">
        {(data?.rows ?? []).map((row) => (
          <button
            key={row.value}
            type="button"
            onClick={() => setCarreraModal({
              nombre: row.value,
              filtros: { ...filters, escalafonId: row.value === 'Sin dato' ? [] : [escalafonNombreToId(row.value)] },
            })}
            className="w-full flex items-center gap-2 text-left text-sm text-gray-800 hover:text-secondary hover:bg-secondary/5 rounded px-2 py-1.5 transition-colors"
          >
            <span className="font-semibold truncate flex-1 min-w-0">{row.value === 'Sin dato' ? row.value : escalafonLabel(row.value)}</span>
            <span className="text-gray-500 tabular-nums shrink-0">{row.total.toLocaleString('es-AR')}</span>
          </button>
        ))}
      </div>

      {carreraModal && (
        <ModalCarrera
          sigla={sigla}
          nombre={carreraModal.nombre}
          filtros={carreraModal.filtros}
          onDrill={onDrill}
          onClose={() => setCarreraModal(null)}
        />
      )}
    </div>
  )
}

function ModalCarrera({
  sigla, nombre, filtros, onDrill, onClose,
}: {
  sigla: string
  nombre: string
  filtros: DotacionFilters
  onDrill: (f: DotacionFilters) => void
  onClose: () => void
}) {
  const { data, isLoading, isError } = useDotacionCarreraTabla(filtros, { enabled: true })

  const situaciones = data ? [...new Set(data.map((f) => f.situacion))].sort() : []
  // Solo se ofrecen como niveles "abribles" las dimensiones que REALMENTE
  // dividen (2+ valores distintos) bajo esta carrera — una sin guardia (ej.
  // Enfermería) no muestra un nivel "Planta/Guardia" vacío.
  const niveles = data ? ORDEN_NIVELES.filter((n) => new Set(data.map((f) => f[n])).size >= 2) : []

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[82vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="font-primary text-base font-bold text-gray-900">
            {nombre === 'Sin dato' ? nombre : escalafonLabel(nombre)} — {sigla}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <div className="p-5">
          {isLoading && <p className="text-sm text-gray-400 py-4">Cargando...</p>}
          {isError && <p className="text-sm text-danger py-4">No se pudo cargar el detalle — reintentá o avisá a soporte.</p>}
          {!isLoading && !isError && (!data || data.length === 0) && <p className="text-sm text-gray-400 py-4">Sin datos para los filtros actuales.</p>}
          {!isLoading && !isError && data && data.length > 0 && (
            <TablaExplorador data={data} niveles={niveles} situaciones={situaciones} filtrosBase={filtros} onDrill={onDrill} />
          )}
        </div>
      </div>
    </div>
  )
}

function DrillCell({ value, onDrill }: { value: number; onDrill: () => void }) {
  return (
    <button
      type="button"
      disabled={!value}
      onDoubleClick={onDrill}
      title={value ? 'Doble click para ver el detalle en el Listado' : undefined}
      className={`w-full text-center tabular-nums ${value ? 'text-gray-800 hover:text-secondary hover:underline cursor-pointer' : 'text-gray-300 cursor-default'}`}
    >
      {value ? value.toLocaleString('es-AR') : '–'}
    </button>
  )
}

function TablaExplorador({
  data, niveles, situaciones, filtrosBase, onDrill,
}: {
  data: DotacionCarreraTablaFila[]
  niveles: NivelAgrupador[]
  situaciones: string[]
  filtrosBase: DotacionFilters
  onDrill: (f: DotacionFilters) => void
}) {
  const totalesColumna = contarPorSituacion(data, situaciones)
  const granTotal = sumarCounts(totalesColumna)

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr className="bg-navy text-white">
            <th className="px-3 py-2 text-left text-xs font-semibold whitespace-nowrap border-r border-white/20 min-w-[220px]">Puesto</th>
            {situaciones.map((s) => (
              <th key={s} className="px-3 py-2 text-center text-xs font-semibold whitespace-nowrap border-r border-white/20">
                {s === 'Sin dato' ? etiquetaSinDato('situación') : s}
              </th>
            ))}
            <th className="px-3 py-2 text-center text-xs font-semibold whitespace-nowrap">Total</th>
          </tr>
        </thead>
        <tbody>
          <NodoNivel filas={data} niveles={niveles} situaciones={situaciones} profundidad={0} filtrosBase={filtrosBase} onDrill={onDrill} />
          <tr className="bg-gray-200 font-semibold">
            <td className="px-3 py-2 text-xs text-gray-800 border-r border-gray-300">Total</td>
            {situaciones.map((s) => (
              <td key={s} className="px-2 py-2 border-r border-gray-300">
                <DrillCell value={totalesColumna[s] ?? 0} onDrill={() => onDrill({ ...filtrosBase, situacionRevista: [valorParaFiltro(s)] })} />
              </td>
            ))}
            <td className="px-2 py-2">
              <DrillCell value={granTotal} onDrill={() => onDrill(filtrosBase)} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// Recorre los niveles restantes: si no queda ninguno, muestra directo las
// filas de Puesto (nivel final, siempre "abierto" porque ya es la unidad más
// chica antes de Situación en columnas); si queda alguno, agrupa por él y
// delega cada grupo a <FilaGrupo>, que es quien maneja el toggle de abrir/
// cerrar sus propias sub-filas.
function NodoNivel({
  filas, niveles, situaciones, profundidad, filtrosBase, onDrill,
}: {
  filas: DotacionCarreraTablaFila[]
  niveles: NivelAgrupador[]
  situaciones: string[]
  profundidad: number
  filtrosBase: DotacionFilters
  onDrill: (f: DotacionFilters) => void
}) {
  if (niveles.length === 0) {
    const porPuesto = ordenarPorTotalDesc([...agruparPor(filas, 'puesto').entries()], situaciones)
    return (
      <>
        {porPuesto.map(([puesto, filasPuesto]) => {
          const counts = contarPorSituacion(filasPuesto, situaciones)
          const total = sumarCounts(counts)
          const filtrosFila = { ...filtrosBase, puestoNombre: [valorParaFiltro(puesto)] }
          return (
            <tr key={puesto}>
              <td className="px-3 py-1.5 text-xs text-gray-800 border-r border-gray-100 whitespace-nowrap" style={{ paddingLeft: 12 + profundidad * 16 }}>
                {puesto === 'Sin dato' ? etiquetaSinDato('puesto') : capitalizar(puesto)}
              </td>
              {situaciones.map((s) => (
                <td key={s} className="px-2 py-1.5 border-r border-gray-100">
                  <DrillCell value={counts[s] ?? 0} onDrill={() => onDrill({ ...filtrosFila, situacionRevista: [valorParaFiltro(s)] })} />
                </td>
              ))}
              <td className="px-2 py-1.5 font-semibold">
                <DrillCell value={total} onDrill={() => onDrill(filtrosFila)} />
              </td>
            </tr>
          )
        })}
      </>
    )
  }

  const [nivel, ...resto] = niveles
  const grupos = ordenarPorTotalDesc([...agruparPor(filas, nivel).entries()], situaciones)
  return (
    <>
      {grupos.map(([valor, filasGrupo]) => (
        <FilaGrupo
          key={valor}
          nivel={nivel}
          valor={valor}
          filas={filasGrupo}
          resto={resto}
          situaciones={situaciones}
          profundidad={profundidad}
          filtrosBase={filtrosBase}
          onDrill={onDrill}
        />
      ))}
    </>
  )
}

function FilaGrupo({
  nivel, valor, filas, resto, situaciones, profundidad, filtrosBase, onDrill,
}: {
  nivel: NivelAgrupador
  valor: string
  filas: DotacionCarreraTablaFila[]
  resto: NivelAgrupador[]
  situaciones: string[]
  profundidad: number
  filtrosBase: DotacionFilters
  onDrill: (f: DotacionFilters) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const counts = contarPorSituacion(filas, situaciones)
  const total = sumarCounts(counts)
  const filtrosGrupo = aplicarNivelAlFiltro(filtrosBase, nivel, valor)

  return (
    <>
      <tr className="bg-gray-100">
        <td className="px-3 py-1.5 border-r border-gray-100 whitespace-nowrap" style={{ paddingLeft: 12 + profundidad * 16 }}>
          <button type="button" onClick={() => setAbierto((v) => !v)} className="flex items-center gap-1.5 text-xs font-bold text-gray-900 hover:text-secondary">
            <span className="text-gray-400 w-3 shrink-0">{abierto ? '▾' : '▸'}</span>
            {etiquetaDeValor(nivel, valor)}
          </button>
        </td>
        {situaciones.map((s) => (
          <td key={s} className="px-2 py-1.5 border-r border-gray-100">
            <DrillCell value={counts[s] ?? 0} onDrill={() => onDrill({ ...filtrosGrupo, situacionRevista: [valorParaFiltro(s)] })} />
          </td>
        ))}
        <td className="px-2 py-1.5 font-bold">
          <DrillCell value={total} onDrill={() => onDrill(filtrosGrupo)} />
        </td>
      </tr>
      {abierto && (
        <NodoNivel filas={filas} niveles={resto} situaciones={situaciones} profundidad={profundidad + 1} filtrosBase={filtrosGrupo} onDrill={onDrill} />
      )}
    </>
  )
}
