import { Fragment, useState } from 'react'
import { downloadExcel } from '@/shared/lib/exportExcel'
import { useEvolutivoEspecialidad, type EvolutivoEspecialidadFila } from '../hooks/useReportes'

const COLUMNS: { key: Exclude<keyof EvolutivoEspecialidadFila, 'especialidad'>; label: string; headerClass?: string }[] = [
  { key: 'dic2023', label: 'diciembre 2023' },
  { key: 'ene2025', label: 'enero 2025' },
  { key: 'jun2025', label: 'junio 2025' },
  { key: 'ene2026', label: 'enero 2026' },
  { key: 'actual', label: 'Actual (en vivo)' },
  { key: 'crecimiento', label: 'Crecimiento', headerClass: 'bg-rose-400' },
  { key: 'concurso', label: 'Concurso a Septiembre 2026', headerClass: 'bg-amber-400' },
  { key: 'activosConcursos', label: 'Activos + Concursos', headerClass: 'bg-[#0f1b30]' },
]

function fmt(n: number) {
  return n.toLocaleString('es-AR')
}

// Calca la solapa "Evolutivo por Especialidad" del Excel de presupuesto:
// Universo + Especialidad como filas (Universo con celda combinada, como en
// el Excel), columnas históricas + Crecimiento + Concurso + Cargos totales.
// Solo "Actual" se recalcula en vivo — el resto son valores fijos copiados
// del Excel (ver reportes.schema.ts::EVOLUTIVO_ESPECIALIDAD_HISTORICO en el
// backend), porque el sistema no tiene guardado ese historial ni concursos
// conectados a Dotación todavía.
export function EvolutivoEspecialidadTab() {
  const [exportando, setExportando] = useState(false)
  const { data, isLoading, isFetching, isError } = useEvolutivoEspecialidad()

  function handleExport() {
    if (!data) return
    setExportando(true)
    try {
      const filename = `evolutivo_especialidad_${new Date().toISOString().slice(0, 10)}.xlsx`
      const rows: Record<string, unknown>[] = []
      for (const u of data.universos) {
        for (const fila of u.filas) {
          const row: Record<string, unknown> = { Universo: u.label, Especialidad: fila.especialidad }
          for (const col of COLUMNS) row[col.label] = fila[col.key]
          rows.push(row)
        }
        const subRow: Record<string, unknown> = { Universo: u.label, Especialidad: u.subtotal.especialidad }
        for (const col of COLUMNS) subRow[col.label] = u.subtotal[col.key]
        rows.push(subRow)
      }
      const totalRow: Record<string, unknown> = { Universo: '', Especialidad: data.total.especialidad }
      for (const col of COLUMNS) totalRow[col.label] = data.total[col.key]
      rows.push(totalRow)
      downloadExcel(filename, rows)
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500 max-w-2xl">
          Dotación Activa por Especialidad — Código de Registro 37, Planta y Guardia, Sin Jefes.
          Solo la columna <strong>Actual</strong> se recalcula en vivo; el resto son valores del Excel de
          presupuesto (no hay historial ni concursos conectados a Dotación todavía).
        </p>
        {data && (
          <button
            onClick={handleExport}
            disabled={exportando}
            className="inline-flex items-center gap-1.5 btn-outline text-sm h-10 px-4 disabled:opacity-50 shrink-0"
          >
            {exportando ? 'Exportando...' : 'Exportar a Excel'}
          </button>
        )}
      </div>

      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 flex-1 overflow-auto min-h-0 ${isFetching ? 'opacity-60' : ''}`}>
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando...</p>}
        {isError && <p className="p-6 text-sm text-danger">No se pudo cargar el reporte.</p>}

        {data && (
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="text-white text-right sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2.5 font-semibold text-left bg-navy">Universo</th>
                <th className="px-3 py-2.5 font-semibold text-left bg-navy">Especialidad</th>
                {COLUMNS.map((col) => (
                  <th key={col.key} className={`px-3 py-2.5 font-semibold whitespace-nowrap ${col.headerClass ?? 'bg-navy'}`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.universos.map((u) => (
                <Fragment key={u.universo}>
                  {u.filas.map((fila, idx) => (
                    <tr key={`${u.universo}-${fila.especialidad}`} className="hover:bg-gray-50">
                      {idx === 0 && (
                        <td rowSpan={u.filas.length} className="px-3 py-1.5 text-gray-800 font-semibold align-top bg-secondary/10">
                          {u.label}
                        </td>
                      )}
                      <td className="px-3 py-1.5 text-gray-800">{fila.especialidad}</td>
                      {COLUMNS.map((col) => (
                        <td key={col.key} className="px-3 py-1.5 text-right text-gray-800">{fmt(fila[col.key])}</td>
                      ))}
                    </tr>
                  ))}
                  <tr key={`${u.universo}-subtotal`} className="font-semibold bg-gray-100">
                    <td className="px-3 py-1.5" />
                    <td className="px-3 py-1.5">{u.subtotal.especialidad}</td>
                    {COLUMNS.map((col) => (
                      <td key={col.key} className="px-3 py-1.5 text-right">{fmt(u.subtotal[col.key])}</td>
                    ))}
                  </tr>
                </Fragment>
              ))}
              <tr className="font-bold bg-navy/10">
                <td className="px-3 py-1.5" colSpan={2}>{data.total.especialidad}</td>
                {COLUMNS.map((col) => (
                  <td key={col.key} className="px-3 py-1.5 text-right">{fmt(data.total[col.key])}</td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
