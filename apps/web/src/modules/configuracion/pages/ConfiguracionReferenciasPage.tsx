import { useState } from 'react'
import { getApiErrorMessage } from '@/shared/lib/utils'
import {
  agrupadoresHooks,
  unificadoresPuestoHooks,
  especialidadesCuilHooks,
  abreviaturasTecnicasHooks,
  abreviaturasTituloHooks,
  correccionesLitPuestoHooks,
  correccionesEspecialidadHooks,
  especialidadPorPuestoHooks,
  conectoresMinusculaHooks,
  sufijosOrdinalesHooks,
} from '../hooks/useReferencias'

// Administración de las 10 tablas de referencia que alimentan el cruce de
// Dotaneitor (Doc/Dotaneitor_Analisis.md). Antes de esta página, la única forma
// de tocarlas era correr a mano services/dotaneitor/scripts/seed_referencias.py
// contra el Excel de origen — acá quedan editables sin salir de la app.
//
// A diferencia de la vieja TablasAdminPage (que pedía el schema en runtime vía
// GET /erd y armaba columnas dinámicamente), acá las columnas son una
// configuración fija en el código: el backend (referencias.routes.ts) solo
// expone estas 10 tablas puntuales, cada una con su propio endpoint tipado —
// no hay forma de pedir una tabla arbitraria de la base.

type ColumnaTipo = 'text' | 'number' | 'boolean'

interface Columna {
  key: string
  label: string
  tipo: ColumnaTipo
  requerido?: boolean
  maxLength?: number
}

interface RowGenerica {
  id: string
  [key: string]: unknown
}

interface HooksReferencia {
  useList: (params: { page?: number; limit?: number; search?: string }) => {
    data?: { rows: RowGenerica[]; total: number; page: number; limit: number }
    isLoading: boolean
    isError: boolean
  }
  useCreate: () => { mutateAsync: (body: Record<string, unknown>) => Promise<unknown>; isPending: boolean }
  useUpdate: () => {
    mutateAsync: (args: { id: string; body: Record<string, unknown> }) => Promise<unknown>
    isPending: boolean
  }
  useDelete: () => { mutateAsync: (id: string) => Promise<unknown>; isPending: boolean }
}

interface TablaConfig {
  key: string
  label: string
  columnas: Columna[]
  conBusqueda?: boolean
  hooks: HooksReferencia
}

const LIMIT = 50

const TABLAS: TablaConfig[] = [
  {
    key: 'agrupadores',
    label: 'Agrupadores',
    hooks: agrupadoresHooks as unknown as HooksReferencia,
    columnas: [
      { key: 'cruce', label: 'Cruce', tipo: 'text', requerido: true, maxLength: 300 },
      { key: 'escalafon', label: 'Escalafón', tipo: 'text', requerido: true, maxLength: 150 },
      { key: 'litPuesto', label: 'Literal de puesto', tipo: 'text', requerido: true, maxLength: 200 },
      { key: 'agrupador', label: 'Agrupador', tipo: 'text', requerido: true, maxLength: 150 },
      { key: 'activo', label: 'Activo', tipo: 'boolean' },
    ],
  },
  {
    key: 'unificadores-puesto',
    label: 'Unificadores de puesto',
    hooks: unificadoresPuestoHooks as unknown as HooksReferencia,
    columnas: [
      { key: 'cruce', label: 'Cruce', tipo: 'text', requerido: true, maxLength: 400 },
      { key: 'litCodReg', label: 'Literal cód. registro', tipo: 'text', requerido: true, maxLength: 150 },
      { key: 'litPuesto', label: 'Literal de puesto', tipo: 'text', requerido: true, maxLength: 200 },
      { key: 'unificador', label: 'Unificador', tipo: 'text', requerido: true, maxLength: 200 },
      { key: 'activo', label: 'Activo', tipo: 'boolean' },
    ],
  },
  {
    key: 'especialidades-cuil',
    label: 'Especialidades por CUIL',
    conBusqueda: true,
    hooks: especialidadesCuilHooks as unknown as HooksReferencia,
    columnas: [
      { key: 'tipo', label: 'Tipo', tipo: 'text', requerido: true, maxLength: 20 },
      { key: 'cuil', label: 'CUIL', tipo: 'text', requerido: true, maxLength: 11 },
      { key: 'cuilYRol', label: 'CUIL y rol', tipo: 'text', maxLength: 50 },
      { key: 'especialidad', label: 'Especialidad', tipo: 'text', requerido: true, maxLength: 200 },
      { key: 'activo', label: 'Activo', tipo: 'boolean' },
    ],
  },
  {
    key: 'abreviaturas-tecnicas',
    label: 'Abreviaturas técnicas',
    hooks: abreviaturasTecnicasHooks as unknown as HooksReferencia,
    columnas: [
      { key: 'sigla', label: 'Sigla', tipo: 'text', requerido: true, maxLength: 50 },
      { key: 'activo', label: 'Activo', tipo: 'boolean' },
    ],
  },
  {
    key: 'abreviaturas-titulo',
    label: 'Abreviaturas de título',
    hooks: abreviaturasTituloHooks as unknown as HooksReferencia,
    columnas: [
      { key: 'titulo', label: 'Título', tipo: 'text', requerido: true, maxLength: 50 },
      { key: 'activo', label: 'Activo', tipo: 'boolean' },
    ],
  },
  {
    key: 'correcciones-lit-puesto',
    label: 'Correcciones de literal de puesto',
    hooks: correccionesLitPuestoHooks as unknown as HooksReferencia,
    columnas: [
      { key: 'codReg', label: 'Cód. registro', tipo: 'text', maxLength: 10 },
      { key: 'original', label: 'Original', tipo: 'text', requerido: true, maxLength: 200 },
      { key: 'correccion', label: 'Corrección', tipo: 'text', requerido: true, maxLength: 200 },
      { key: 'activo', label: 'Activo', tipo: 'boolean' },
    ],
  },
  {
    key: 'correcciones-especialidad',
    label: 'Correcciones de especialidad',
    hooks: correccionesEspecialidadHooks as unknown as HooksReferencia,
    columnas: [
      { key: 'original', label: 'Original', tipo: 'text', requerido: true, maxLength: 200 },
      { key: 'correccion', label: 'Corrección', tipo: 'text', requerido: true, maxLength: 200 },
      { key: 'activo', label: 'Activo', tipo: 'boolean' },
    ],
  },
  {
    key: 'especialidad-por-puesto',
    label: 'Especialidad por puesto',
    hooks: especialidadPorPuestoHooks as unknown as HooksReferencia,
    columnas: [
      { key: 'agrupador', label: 'Agrupador', tipo: 'text', requerido: true, maxLength: 150 },
      { key: 'especialidad', label: 'Especialidad', tipo: 'text', requerido: true, maxLength: 200 },
      { key: 'purezaPct', label: 'Pureza (%)', tipo: 'number' },
      { key: 'activo', label: 'Activo', tipo: 'boolean' },
    ],
  },
  {
    key: 'conectores-minuscula',
    label: 'Conectores en minúscula',
    hooks: conectoresMinusculaHooks as unknown as HooksReferencia,
    columnas: [
      { key: 'conector', label: 'Conector', tipo: 'text', requerido: true, maxLength: 30 },
      { key: 'activo', label: 'Activo', tipo: 'boolean' },
    ],
  },
  {
    key: 'sufijos-ordinales',
    label: 'Sufijos ordinales',
    hooks: sufijosOrdinalesHooks as unknown as HooksReferencia,
    columnas: [
      { key: 'sufijo', label: 'Sufijo', tipo: 'text', requerido: true, maxLength: 10 },
      { key: 'activo', label: 'Activo', tipo: 'boolean' },
    ],
  },
]

function RowModal({
  tabla,
  row,
  onClose,
}: {
  tabla: TablaConfig
  row: RowGenerica | 'new'
  onClose: () => void
}) {
  const isEdit = row !== 'new'
  const create = tabla.hooks.useCreate()
  const update = tabla.hooks.useUpdate()
  const [form, setForm] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {}
    tabla.columnas.forEach((c) => {
      if (isEdit) init[c.key] = row[c.key] ?? (c.tipo === 'boolean' ? true : '')
      else init[c.key] = c.tipo === 'boolean' ? true : ''
    })
    return init
  })
  const [error, setError] = useState('')
  const saving = create.isPending || update.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const body: Record<string, unknown> = {}
    tabla.columnas.forEach((c) => {
      const value = form[c.key]
      if (c.tipo === 'number') {
        body[c.key] = value === '' ? undefined : Number(value)
      } else if (c.tipo === 'boolean') {
        body[c.key] = !!value
      } else {
        body[c.key] = typeof value === 'string' && value.trim() === '' ? undefined : value
      }
    })
    try {
      if (isEdit) await update.mutateAsync({ id: row.id, body })
      else await create.mutateAsync(body)
      onClose()
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <span className="font-semibold text-gray-800 text-sm">
            {isEdit ? 'Editar' : 'Nuevo'} — {tabla.label}
          </span>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {tabla.columnas.map((c) => (
            <div key={c.key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {c.label} {c.requerido && <span className="text-danger">*</span>}
              </label>
              {c.tipo === 'boolean' ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, [c.key]: !f[c.key] }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      form[c.key] ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        form[c.key] ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className={`text-sm font-medium ${form[c.key] ? 'text-green-600' : 'text-gray-400'}`}>
                    {form[c.key] ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              ) : (
                <input
                  type={c.tipo === 'number' ? 'number' : 'text'}
                  maxLength={c.maxLength}
                  required={c.requerido}
                  className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                  value={form[c.key] as string | number}
                  onChange={(e) => setForm((f) => ({ ...f, [c.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-primary text-sm h-8 px-4">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TablaPanel({ tabla }: { tabla: TablaConfig }) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<RowGenerica | 'new' | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data, isLoading, isError } = tabla.hooks.useList({
    page,
    limit: LIMIT,
    search: tabla.conBusqueda && search.trim() ? search.trim() : undefined,
  })
  const del = tabla.hooks.useDelete()

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  async function handleDelete(row: RowGenerica) {
    if (!confirm('¿Eliminar este registro? No se puede deshacer.')) return
    setDeletingId(row.id)
    try {
      await del.mutateAsync(row.id)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden min-h-0">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-gray-800 text-sm truncate">{tabla.label}</span>
          <span className="text-xs text-gray-400 shrink-0">{total.toLocaleString('es-AR')} registros</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {tabla.conBusqueda && (
            <input
              placeholder="Buscar por CUIL o especialidad..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="h-8 px-3 text-xs border border-gray-300 rounded w-64 focus:outline-none focus:border-secondary"
            />
          )}
          <button
            onClick={() => setModal('new')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-700 text-white rounded-lg hover:bg-primary-800"
          >
            + Agregar
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading && <p className="text-sm text-gray-400 text-center py-12">Cargando...</p>}
        {isError && <p className="text-sm text-danger text-center py-12">No se pudo cargar la tabla.</p>}
        {data && (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr>
                {tabla.columnas.map((c) => (
                  <th
                    key={c.key}
                    className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap border-b border-gray-200"
                  >
                    {c.label}
                  </th>
                ))}
                <th className="px-3 py-2 border-b border-gray-200 w-16" />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} className="group hover:bg-blue-50/40 transition-colors">
                  {tabla.columnas.map((c) => (
                    <td
                      key={c.key}
                      className="px-3 py-1.5 text-gray-700 whitespace-nowrap border-b border-gray-50 max-w-[280px] truncate"
                    >
                      {c.tipo === 'boolean' ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            row[c.key] ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                          }`}
                        >
                          {row[c.key] ? 'Activo' : 'Inactivo'}
                        </span>
                      ) : row[c.key] === null || row[c.key] === undefined || row[c.key] === '' ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        String(row[c.key])
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 border-b border-gray-50">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setModal(row)} title="Editar" className="p-1 rounded hover:bg-blue-100 text-blue-500">
                        ✎
                      </button>
                      <button
                        onClick={() => handleDelete(row)}
                        title="Eliminar"
                        disabled={deletingId === row.id}
                        className="p-1 rounded hover:bg-red-100 text-red-400 disabled:opacity-40"
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!data.rows.length && (
                <tr>
                  <td colSpan={tabla.columnas.length + 1} className="text-center py-10 text-gray-400 text-xs">
                    Sin registros
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 shrink-0">
        <span className="text-xs text-gray-400">
          {total > 0 ? `${(page - 1) * LIMIT + 1}–${Math.min(page * LIMIT, total)} de ${total.toLocaleString('es-AR')}` : '0 registros'}
        </span>
        <div className="flex items-center gap-1">
          <button disabled={page === 1} onClick={() => setPage(1)} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50">«</button>
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50">‹</button>
          <span className="px-2 text-xs text-gray-500">{page} / {totalPages}</span>
          <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50">›</button>
          <button disabled={page === totalPages} onClick={() => setPage(totalPages)} className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-50">»</button>
        </div>
      </div>

      {modal && <RowModal tabla={tabla} row={modal} onClose={() => setModal(null)} />}
    </div>
  )
}

export function ConfiguracionReferenciasPage() {
  const [selected, setSelected] = useState<TablaConfig>(TABLAS[0])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-primary text-2xl font-bold text-gray-900">Tablas de referencia — Dotaneitor</h1>
        <p className="text-sm text-gray-500 mt-1">
          Mapeos que usa el cruce del padrón semanal (agrupadores, unificadores de puesto,
          especialidades por CUIL, correcciones de texto). Editar acá reemplaza tener que correr
          el script de carga contra el Excel de origen.
        </p>
      </div>
      <div className="flex gap-3" style={{ height: 'calc(100vh - 220px)' }}>
        <div className="w-56 shrink-0 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-700">Tablas administrables</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{TABLAS.length} tablas</p>
          </div>
          <div className="overflow-y-auto flex-1 py-1">
            {TABLAS.map((t) => (
              <button
                key={t.key}
                onClick={() => setSelected(t)}
                className={`w-full flex items-center px-3 py-2 text-xs text-left transition-colors ${
                  selected.key === t.key ? 'bg-primary-50 text-primary-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
        <TablaPanel key={selected.key} tabla={selected} />
      </div>
    </div>
  )
}
