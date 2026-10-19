import { useEffect, useMemo, useState } from 'react'
import { usePeriodosDisponibles } from '../hooks/usePeriodosDisponibles'
import {
  armarPeriodo,
  nombreMes,
  ordenMesAnio,
  type Mes,
  type RangoComparativo,
} from '../data/periodo'

// ─────────────────────────────────────────────────────────────────────────────
// Selector de DOS períodos: el que se consulta y el que se compara contra él.
//
// Granularidad mensual: cada período se arma como (año, desdeMes) → (año,
// hastaMes) y el sistema completa los meses intermedios (ver armarPeriodo).
// Las opciones ofrecidas son SOLO los meses con snapshot de padrón APROBADO
// (usePeriodosDisponibles).
//
// Validación (criterio en periodo.ts):
//  - Dentro de cada rango: desde <= hasta.
//  - v1: cada rango dentro de un MISMO año (Periodo tiene un solo `anio`).
//  - El período de comparación debe EMPEZAR en un mes estrictamente posterior
//    al último mes del consultado → garantiza posterioridad y no-solapamiento.
//  - Todos los meses de ambos rangos deben existir en opciones disponibles.
//
// Emite por `onChange(RangoComparativo | null)`: null mientras esté incompleto
// o inválido. El gating (deshabilitar slides) lo aplica quien lo consume.
// ─────────────────────────────────────────────────────────────────────────────

interface SelectorPeriodosProps {
  /** Se llama con el rango válido, o null si está incompleto/inválido. */
  onChange: (rango: RangoComparativo | null) => void
}

// Valor de cada dropdown: "anio-mes" (ej. "2026-5") o "" cuando no se eligió.
type ValorSelect = string

function parseValor(v: ValorSelect): { anio: number; mes: Mes } | null {
  if (!v) return null
  const [anioStr, mesStr] = v.split('-')
  const anio = Number(anioStr)
  const mes = Number(mesStr) as Mes
  if (!anio || !mes) return null
  return { anio, mes }
}

export function SelectorPeriodos({ onChange }: SelectorPeriodosProps) {
  const { anios, mesesPorAnio, isLoading, isError } = usePeriodosDisponibles()

  // Estado de los 4 dropdowns (consulta desde/hasta, comparación desde/hasta).
  const [consultaDesde, setConsultaDesde] = useState<ValorSelect>('')
  const [consultaHasta, setConsultaHasta] = useState<ValorSelect>('')
  const [comparacionDesde, setComparacionDesde] = useState<ValorSelect>('')
  const [comparacionHasta, setComparacionHasta] = useState<ValorSelect>('')

  // Set de "anio-mes" disponibles, para validar existencia de todos los meses.
  const clavesDisponibles = useMemo(() => {
    const set = new Set<string>()
    for (const anio of anios) {
      for (const mes of mesesPorAnio[anio]) {
        set.add(`${anio}-${mes}`)
      }
    }
    return set
  }, [anios, mesesPorAnio])

  // Opciones planas (año-mes) ascendentes para poblar cada dropdown.
  const opciones = useMemo(
    () =>
      anios.flatMap((anio) =>
        mesesPorAnio[anio].map((mes) => ({
          valor: `${anio}-${mes}`,
          etiqueta: `${nombreMes(mes)} ${anio}`,
          anio,
          mes,
        })),
      ),
    [anios, mesesPorAnio],
  )

  // ── Validación + derivación del rango ──────────────────────────────────────
  // Devuelve { rango, error } donde rango es null si incompleto o inválido.
  const { rango, error } = useMemo<{
    rango: RangoComparativo | null
    error: string | null
  }>(() => {
    const cd = parseValor(consultaDesde)
    const ch = parseValor(consultaHasta)
    const kd = parseValor(comparacionDesde)
    const kh = parseValor(comparacionHasta)

    // Incompleto: todavía no hay nada que validar ni emitir (sin mensaje).
    if (!cd || !ch || !kd || !kh) return { rango: null, error: null }

    // v1: cada rango dentro de un mismo año.
    if (cd.anio !== ch.anio || kd.anio !== kh.anio) {
      return { rango: null, error: 'Por ahora cada período debe estar dentro de un mismo año.' }
    }

    // desde <= hasta dentro de cada rango.
    if (ordenMesAnio(cd.anio, cd.mes) > ordenMesAnio(ch.anio, ch.mes)) {
      return {
        rango: null,
        error: 'En el período consultado, el "hasta" no puede ser anterior al "desde".',
      }
    }
    if (ordenMesAnio(kd.anio, kd.mes) > ordenMesAnio(kh.anio, kh.mes)) {
      return {
        rango: null,
        error: 'En el período de comparación, el "hasta" no puede ser anterior al "desde".',
      }
    }

    // Posterioridad + no-solapamiento: comparación empieza estrictamente después
    // del último mes del consultado.
    if (ordenMesAnio(kd.anio, kd.mes) <= ordenMesAnio(ch.anio, ch.mes)) {
      return {
        rango: null,
        error: 'El período de comparación debe ser posterior al consultado (sin solaparse).',
      }
    }

    // Existencia: todos los meses de ambos rangos deben tener padrón aprobado.
    const consulta = armarPeriodo(cd.anio, cd.mes, ch.mes)
    const comparacion = armarPeriodo(kd.anio, kd.mes, kh.mes)
    const faltaAlguno = [
      ...consulta.meses.map((m) => `${consulta.anio}-${m}`),
      ...comparacion.meses.map((m) => `${comparacion.anio}-${m}`),
    ].some((clave) => !clavesDisponibles.has(clave))
    if (faltaAlguno) {
      return {
        rango: null,
        error:
          'Algún mes del rango elegido no tiene padrón aprobado. Elegí meses con datos registrados.',
      }
    }

    return { rango: { consulta, comparacion }, error: null }
  }, [consultaDesde, consultaHasta, comparacionDesde, comparacionHasta, clavesDisponibles])

  // Notifica hacia arriba cada vez que cambia el rango resultante.
  useEffect(() => {
    onChange(rango)
  }, [rango, onChange])

  // ── Estados loading / error / vacío del hook ───────────────────────────────
  if (isLoading) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
        Cargando períodos disponibles…
      </div>
    )
  }
  if (isError) {
    return (
      <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
        No se pudieron cargar los padrones para elegir período.
      </div>
    )
  }
  if (opciones.length === 0) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
        No hay padrones aprobados para elegir período.
      </div>
    )
  }

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-4">
      {/* ── Período a consultar ──────────────────────────────────────────── */}
      <fieldset className="space-y-2">
        <legend className="font-primary text-sm font-bold text-gray-900">
          Período a consultar
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CampoSelect
            id="consulta-desde"
            label="Desde"
            value={consultaDesde}
            opciones={opciones}
            onChange={setConsultaDesde}
          />
          <CampoSelect
            id="consulta-hasta"
            label="Hasta"
            value={consultaHasta}
            opciones={opciones}
            onChange={setConsultaHasta}
          />
        </div>
      </fieldset>

      {/* ── Período de comparación ───────────────────────────────────────── */}
      <fieldset className="space-y-2">
        <legend className="font-primary text-sm font-bold text-gray-900">
          Período de comparación (posterior)
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CampoSelect
            id="comparacion-desde"
            label="Desde"
            value={comparacionDesde}
            opciones={opciones}
            onChange={setComparacionDesde}
          />
          <CampoSelect
            id="comparacion-hasta"
            label="Hasta"
            value={comparacionHasta}
            opciones={opciones}
            onChange={setComparacionHasta}
          />
        </div>
      </fieldset>

      {/* ── Mensaje de validación (si corresponde) ───────────────────────── */}
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

// ── Dropdown accesible: <label> asociado + <select> nativo con tokens Obelisco ─
interface CampoSelectProps {
  id: string
  label: string
  value: ValorSelect
  opciones: { valor: string; etiqueta: string }[]
  onChange: (v: ValorSelect) => void
}

function CampoSelect({ id, label, value, opciones, onChange }: CampoSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-primary text-xs font-semibold text-gray-600">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-gray-300 bg-white px-3 py-2 font-primary text-sm text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
      >
        <option value="">Elegí un mes…</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    </div>
  )
}
