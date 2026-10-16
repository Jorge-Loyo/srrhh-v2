import { useMemo } from 'react'
import { EstadoSnapshot } from '@srrhh/types'
import { useSnapshots } from '@/modules/padron/hooks/usePadron'
import type { Mes } from '../data/periodo'

// ─────────────────────────────────────────────────────────────────────────────
// Períodos disponibles para el selector de Reportes.
//
// Los "meses con datos" son los meses que tienen un snapshot de padrón APROBADO.
// Este hook reutiliza el `useSnapshots()` existente (GET /padron/snapshots),
// filtra por estado aprobado, parsea `fechaAsignada` (ISO date) a { anio, mes },
// deduplica y ordena ascendente. Expone, por año, los meses disponibles — que
// es lo que el SelectorPeriodos ofrece en sus dropdowns.
// ─────────────────────────────────────────────────────────────────────────────

export interface PeriodosDisponibles {
  /** Años con al menos un mes aprobado, ascendente. */
  anios: number[]
  /** Meses aprobados por año (clave = año), cada lista ascendente y sin duplicados. */
  mesesPorAnio: Record<number, Mes[]>
}

export interface UsePeriodosDisponiblesResult extends PeriodosDisponibles {
  isLoading: boolean
  isError: boolean
}

/**
 * Parsea una `fechaAsignada` ISO (ej. "2026-05-01" o "2026-05-01T00:00:00.000Z")
 * a { anio, mes } sin depender de la zona horaria local: toma los primeros
 * componentes de la fecha tal como vienen en el string.
 */
function parsearAnioMes(fechaAsignada: string): { anio: number; mes: Mes } | null {
  const match = /^(\d{4})-(\d{2})/.exec(fechaAsignada)
  if (!match) return null
  const anio = Number(match[1])
  const mes = Number(match[2])
  if (mes < 1 || mes > 12) return null
  return { anio, mes: mes as Mes }
}

export function usePeriodosDisponibles(): UsePeriodosDisponiblesResult {
  const { data, isLoading, isError } = useSnapshots()

  const disponibles = useMemo<PeriodosDisponibles>(() => {
    const snapshots = data ?? []
    // Set de "anio-mes" aprobados (deduplica cuando hay varios padrones en el
    // mismo mes).
    const claves = new Set<string>()
    for (const snap of snapshots) {
      if (snap.estado !== EstadoSnapshot.APROBADO) continue
      const parsed = parsearAnioMes(snap.fechaAsignada)
      if (!parsed) continue
      claves.add(`${parsed.anio}-${parsed.mes}`)
    }

    const mesesPorAnio: Record<number, Mes[]> = {}
    for (const clave of claves) {
      const [anioStr, mesStr] = clave.split('-')
      const anio = Number(anioStr)
      const mes = Number(mesStr) as Mes
      ;(mesesPorAnio[anio] ??= []).push(mes)
    }

    for (const anio of Object.keys(mesesPorAnio)) {
      mesesPorAnio[Number(anio)].sort((a, b) => a - b)
    }

    const anios = Object.keys(mesesPorAnio)
      .map(Number)
      .sort((a, b) => a - b)

    return { anios, mesesPorAnio }
  }, [data])

  return { ...disponibles, isLoading, isError }
}
