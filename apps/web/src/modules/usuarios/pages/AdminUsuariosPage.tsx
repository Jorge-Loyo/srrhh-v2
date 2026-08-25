import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { RolUsuario } from '@srrhh/types'
import { useAuth } from '../../auth/hooks/useAuth'
import { getApiErrorMessage } from '@/shared/lib/utils'
import { useCreateUsuario, useHospitales, useSetUsuarioActivo, useUsuarios } from '../hooks/useUsuarios'

const ROL_LABELS: Record<RolUsuario, string> = {
  [RolUsuario.ADMIN]: 'Administrador',
  [RolUsuario.EDITOR]: 'Editor',
  [RolUsuario.VIEWER]: 'Solo lectura',
  [RolUsuario.DIRECTOR]: 'Director',
  [RolUsuario.CONCURSALES_CPH]: 'Concursales CPH',
  [RolUsuario.CONCURSALES_CEETPS]: 'Concursales CEETPS',
}

// Mismas reglas que createUsuarioSchema en apps/api (usuarios.schema.ts) —
// duplicado a propósito: no hay forma hoy de compartir el schema de zod en sí
// entre front y back, solo el tipo (CreateUsuarioRequest en @srrhh/types).
const formSchema = z.object({
  username: z.string().min(3, 'Mínimo 3 caracteres').max(64),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  rol: z.nativeEnum(RolUsuario, { errorMap: () => ({ message: 'Elegí un rol' }) }),
  hospitalId: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

export function AdminUsuariosPage() {
  const { user: currentUser } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [formError, setFormError] = useState('')

  const { data: usuarios, isLoading, isError } = useUsuarios()
  const { data: hospitales } = useHospitales()
  const createUsuario = useCreateUsuario()
  const setActivo = useSetUsuarioActivo()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) })

  if (currentUser?.rol !== RolUsuario.ADMIN) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <h2 className="font-primary text-xl font-bold text-gray-700 mb-2">Sin acceso</h2>
        <p className="text-sm text-gray-400">Esta sección es solo para administradores.</p>
      </div>
    )
  }

  async function onSubmit(values: FormValues) {
    setFormError('')
    try {
      await createUsuario.mutateAsync({
        ...values,
        hospitalId: values.hospitalId || undefined,
      })
      reset()
      setShowForm(false)
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-primary text-2xl font-bold text-gray-900">Administración de Usuarios</h1>
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancelar' : '+ Nuevo usuario'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="bg-white rounded-lg shadow-sm p-6 grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Usuario <span className="text-danger">*</span>
            </label>
            <input
              {...register('username')}
              className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            />
            {errors.username && <p className="text-xs text-danger mt-1">{errors.username.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Email <span className="text-danger">*</span>
            </label>
            <input
              type="email"
              {...register('email')}
              className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            />
            {errors.email && <p className="text-xs text-danger mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Contraseña <span className="text-danger">*</span>
            </label>
            <input
              type="password"
              {...register('password')}
              className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            />
            {errors.password && <p className="text-xs text-danger mt-1">{errors.password.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Rol <span className="text-danger">*</span>
            </label>
            <select
              {...register('rol')}
              defaultValue=""
              className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            >
              <option value="" disabled>
                Elegir rol...
              </option>
              {Object.values(RolUsuario).map((rol) => (
                <option key={rol} value={rol}>
                  {ROL_LABELS[rol]}
                </option>
              ))}
            </select>
            {errors.rol && <p className="text-xs text-danger mt-1">{errors.rol.message}</p>}
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Hospital <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <select
              {...register('hospitalId')}
              defaultValue=""
              className="w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            >
              <option value="">Sin asignar</option>
              {hospitales?.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.sigla} — {h.nombre}
                </option>
              ))}
            </select>
          </div>

          {formError && (
            <div className="sm:col-span-2 bg-red-50 border border-danger text-danger text-sm px-3 py-2 rounded">
              {formError}
            </div>
          )}

          <div className="sm:col-span-2">
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Creando...' : 'Crear usuario'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando usuarios...</p>}
        {isError && <p className="p-6 text-sm text-danger">No se pudo cargar la lista de usuarios.</p>}

        {usuarios && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Usuario</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Rol</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium text-gray-800">{u.username}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3 text-gray-600">{ROL_LABELS[u.rol]}</td>
                  <td className="px-4 py-3">
                    <span className={u.activo ? 'badge-success' : 'badge-default'}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      disabled={setActivo.isPending || u.id === currentUser.id}
                      title={u.id === currentUser.id ? 'No podés desactivar tu propio usuario' : undefined}
                      onClick={() => setActivo.mutate({ id: u.id, activo: !u.activo })}
                      className={u.activo ? 'btn-danger' : 'btn-outline'}
                    >
                      {u.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
              {usuarios.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    No hay usuarios cargados todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
