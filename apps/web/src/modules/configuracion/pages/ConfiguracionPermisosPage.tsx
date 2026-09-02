import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { Permiso, Role } from '@srrhh/types'
import { getApiErrorMessage } from '@/shared/lib/utils'
import {
  useRoles,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  useSetRolePermisos,
} from '../hooks/useRoles'
import { usePermisosCatalogo } from '../hooks/usePermisosCatalogo'

const nuevoRolSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres').max(100),
  descripcion: z.string().max(255).optional(),
})
// Tipado a mano en vez de z.infer<typeof nuevoRolSchema>: con `strict:false`
// (apps/web/tsconfig.json) esta versión de zod (3.25.x, más nueva de lo que
// pide el rango `^3.23.0` del package.json) infiere todos los campos como
// opcionales — bug conocido de esa combinación, no específico de este schema.
// El schema se sigue usando igual para la validación real vía zodResolver.
interface NuevoRolValues {
  nombre: string
  descripcion?: string
}

function agruparPorModulo(permisos: Permiso[]) {
  const grupos = new Map<string, Permiso[]>()
  for (const p of permisos) {
    if (!grupos.has(p.modulo)) grupos.set(p.modulo, [])
    grupos.get(p.modulo)!.push(p)
  }
  return [...grupos.entries()]
}

export function ConfiguracionPermisosPage() {
  const { data: roles, isLoading: cargandoRoles } = useRoles()
  const { data: catalogo, isLoading: cargandoCatalogo } = usePermisosCatalogo()
  const createRole = useCreateRole()
  const updateRole = useUpdateRole()
  const deleteRole = useDeleteRole()
  const setPermisos = useSetRolePermisos()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNuevoRol, setShowNuevoRol] = useState(false)
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState('')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NuevoRolValues>({ resolver: zodResolver(nuevoRolSchema) })

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    reset: resetEdit,
    formState: { isSubmitting: editSubmitting },
  } = useForm<NuevoRolValues>({ resolver: zodResolver(nuevoRolSchema) })

  // Selecciona el primer rol automáticamente en cuanto cargan (dropdown nunca
  // arranca vacío si hay roles).
  useEffect(() => {
    if (!selectedId && roles && roles.length > 0) setSelectedId(roles[0].id)
  }, [roles, selectedId])

  const selected = useMemo(
    () => roles?.find((r) => r.id === selectedId) ?? null,
    [roles, selectedId]
  )
  const grupos = useMemo(() => agruparPorModulo(catalogo ?? []), [catalogo])
  const totalPermisos = catalogo?.length ?? 0
  const otorgados = selected?.slug === 'admin' ? totalPermisos : selected?.permisos?.length ?? 0

  async function onCrearRol(values: NuevoRolValues) {
    setError('')
    try {
      const role = await createRole.mutateAsync(values)
      reset()
      setShowNuevoRol(false)
      setSelectedId(role.id)
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  function onEmpezarEdicion(role: Role) {
    resetEdit({ nombre: role.nombre, descripcion: role.descripcion ?? undefined })
    setEditando(true)
  }

  async function onGuardarEdicion(values: NuevoRolValues) {
    if (!selected) return
    setError('')
    try {
      await updateRole.mutateAsync({ id: selected.id, ...values })
      setEditando(false)
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  async function onEliminarRol(role: Role) {
    setError('')
    if (!confirm(`¿Eliminar el rol "${role.nombre}"? Esta acción no se puede deshacer.`)) return
    try {
      await deleteRole.mutateAsync(role.id)
      setSelectedId(null)
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  function tienePermiso(role: Role, permisoId: string) {
    return role.slug === 'admin' || !!role.permisos?.some((rp) => rp.permiso.id === permisoId)
  }

  async function onTogglePermiso(role: Role, permiso: Permiso) {
    if (role.slug === 'admin') return // protegido — siempre acceso total
    setError('')
    const idsActuales = (role.permisos ?? []).map((rp) => rp.permiso.id)
    const yaLoTiene = idsActuales.includes(permiso.id)
    const nuevosIds = yaLoTiene
      ? idsActuales.filter((id) => id !== permiso.id)
      : [...idsActuales, permiso.id]
    try {
      await setPermisos.mutateAsync({ id: role.id, permisoIds: nuevosIds })
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-primary text-2xl font-bold text-gray-900">Permisos</h1>
        <button className="btn-primary" onClick={() => setShowNuevoRol((v) => !v)}>
          {showNuevoRol ? 'Cancelar' : '+ Nuevo rol'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-danger text-danger text-sm px-3 py-2 rounded">{error}</div>
      )}

      {showNuevoRol && (
        <form
          onSubmit={handleSubmit(onCrearRol)}
          className="bg-white rounded-lg shadow-sm p-6 grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Nombre <span className="text-danger">*</span>
            </label>
            <input
              {...register('nombre')}
              className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
              placeholder="Ej: Supervisor de Guardia"
            />
            {errors.nombre && <p className="text-xs text-danger mt-1">{errors.nombre.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Descripción <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              {...register('descripcion')}
              className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Creando...' : 'Crear rol'}
            </button>
          </div>
        </form>
      )}

      {/* ── Barra de selección de rol — a todo el ancho, arriba de la tabla ── */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        {cargandoRoles ? (
          <p className="text-sm text-gray-400">Cargando roles...</p>
        ) : editando && selected ? (
          <form onSubmit={handleSubmitEdit(onGuardarEdicion)} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre</label>
              <input
                {...registerEdit('nombre')}
                className="h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Descripción</label>
              <input
                {...registerEdit('descripcion')}
                className="h-10 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
              />
            </div>
            <button type="submit" disabled={editSubmitting} className="btn-primary h-10">
              Guardar
            </button>
            <button type="button" onClick={() => setEditando(false)} className="btn-outline h-10">
              Cancelar
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="rol-select" className="text-sm font-semibold text-gray-700 shrink-0">
                Rol
              </label>
              <select
                id="rol-select"
                value={selectedId ?? ''}
                onChange={(e) => setSelectedId(e.target.value)}
                className="h-10 min-w-[220px] px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary font-semibold text-gray-800"
              >
                {roles?.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.nombre}
                    {!role.activo ? ' (inactivo)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {selected && (
              <>
                {selected.slug === 'admin' && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 border border-gray-300 rounded-full px-2 py-0.5">
                    Protegido — acceso total siempre
                  </span>
                )}
                {selected.esSistema && selected.slug !== 'admin' && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 border border-gray-300 rounded-full px-2 py-0.5">
                    Rol de sistema
                  </span>
                )}
                {selected.descripcion && (
                  <span className="text-sm text-gray-500 truncate">{selected.descripcion}</span>
                )}

                <span className="text-sm text-gray-400 ml-auto">
                  {otorgados} / {totalPermisos} permisos
                </span>

                {selected.slug !== 'admin' && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => onEmpezarEdicion(selected)} className="btn-outline">
                      Editar
                    </button>
                    {!selected.esSistema && (
                      <button
                        onClick={() => onEliminarRol(selected)}
                        disabled={deleteRole.isPending}
                        className="btn-danger"
                      >
                        Eliminar rol
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Matriz de permisos del rol seleccionado — tabla a todo el ancho ── */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {!selected && !cargandoRoles && (
          <p className="p-6 text-sm text-gray-400">No hay roles todavía.</p>
        )}
        {cargandoCatalogo && <p className="p-6 text-sm text-gray-400">Cargando catálogo de permisos...</p>}

        {selected && !cargandoCatalogo && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 font-semibold w-56">Módulo</th>
                  <th className="px-4 py-3 font-semibold w-40">Acción</th>
                  <th className="px-4 py-3 font-semibold">Descripción</th>
                  <th className="px-4 py-3 font-semibold w-28 text-center">Otorgado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {grupos.map(([modulo, permisos]) =>
                  permisos.map((permiso, i) => (
                    <tr key={permiso.id} className={selected.slug === 'admin' ? 'opacity-60' : 'hover:bg-gray-50'}>
                      {i === 0 && (
                        <td
                          rowSpan={permisos.length}
                          className="px-4 py-3 font-bold text-gray-700 uppercase text-xs tracking-wide align-top border-r border-gray-100 bg-gray-50/60"
                        >
                          {modulo.replace(/-/g, ' ')}
                        </td>
                      )}
                      <td className="px-4 py-3 text-gray-800 font-medium capitalize">
                        {permiso.accion.replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{permiso.descripcion}</td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={tienePermiso(selected, permiso.id)}
                          disabled={selected.slug === 'admin' || setPermisos.isPending}
                          onChange={() => onTogglePermiso(selected, permiso)}
                          className="h-4 w-4 rounded border-gray-300 cursor-pointer disabled:cursor-default"
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
