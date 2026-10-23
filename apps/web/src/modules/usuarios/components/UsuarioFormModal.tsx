import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { Usuario } from '@srrhh/types'
import { useRoles } from '../../configuracion/hooks/useRoles'
import { getApiErrorMessage, capitalizarEtiqueta } from '@/shared/lib/utils'
import { hospitalLabel } from '@/shared/lib/hospitalLabel'
import { useCreateUsuario, useUpdateUsuario, useHospitales, useChangePassword } from '../hooks/useUsuarios'

interface Props {
  mode: 'create' | 'edit'
  usuario?: Usuario
  onClose: () => void
}

// Replica las reglas del backend (usuarios.schema.ts) — duplicado a propósito:
// solo se comparte el tipo (CreateUsuarioRequest/UpdateUsuarioRequest en
// @srrhh/types), no el schema de zod en sí.
const formSchema = z.object({
  username: z.string().min(3, 'Mínimo 3 caracteres').max(64),
  email: z.string().email('Email inválido'),
  nombre: z.string().min(1, 'Requerido'),
  apellido: z.string().min(1, 'Requerido'),
  cuil: z.string().regex(/^\d{11}$/, 'El CUIL debe tener 11 dígitos'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  roleId: z.string().uuid({ message: 'Elegí un rol' }),
  hospitalId: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

export function UsuarioFormModal({ mode, usuario, onClose }: Props) {
  const isEdit = mode === 'edit'
  const { data: hospitales } = useHospitales()
  const { data: roles } = useRoles()
  const createUsuario = useCreateUsuario()
  const updateUsuario = useUpdateUsuario()
  const changePassword = useChangePassword()

  const [formError, setFormError] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  // DESIGN §6: evita re-enviar el PATCH de datos en un reintento (ej. tras
  // fallar solo el paso de contraseña).
  const [datosGuardados, setDatosGuardados] = useState(false)

  const prefill: Partial<FormValues> = isEdit && usuario
    ? {
        username: usuario.username,
        email: usuario.email,
        nombre: usuario.nombre ?? '',
        apellido: usuario.apellido ?? '',
        cuil: usuario.cuil ?? '',
        roleId: usuario.roleId,
        hospitalId: usuario.hospitalId ?? '',
      }
    : {}

  // En edición el password va por el flujo aparte (resetear contraseña), así
  // que lo quitamos del schema de validación del form principal.
  const resolverSchema = isEdit ? formSchema.omit({ password: true }) : formSchema

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(resolverSchema as typeof formSchema),
    defaultValues: prefill,
  })

  async function onSubmitCreate(values: FormValues) {
    setFormError('')
    try {
      await createUsuario.mutateAsync({
        username: values.username,
        email: values.email,
        nombre: values.nombre,
        apellido: values.apellido,
        cuil: values.cuil,
        password: values.password,
        roleId: values.roleId,
        hospitalId: values.hospitalId || undefined,
      })
      reset()
      onClose()
    } catch (err) {
      setFormError(getApiErrorMessage(err))
    }
  }

  async function onSubmitEdit(values: FormValues) {
    if (!usuario) return
    setFormError('')
    setPwdError('')

    const id = usuario.id
    const hospitalRaw = values.hospitalId ?? ''
    const hospitalNormalizado = hospitalRaw === '' ? null : hospitalRaw

    // ── Paso datos ──────────────────────────────────────────────────────────
    const datosCambiaron =
      values.username !== (usuario.username ?? '') ||
      values.email !== (usuario.email ?? '') ||
      values.nombre !== (usuario.nombre ?? '') ||
      values.apellido !== (usuario.apellido ?? '') ||
      values.cuil !== (usuario.cuil ?? '') ||
      values.roleId !== usuario.roleId ||
      hospitalNormalizado !== (usuario.hospitalId ?? null)

    if (datosCambiaron && !datosGuardados) {
      try {
        await updateUsuario.mutateAsync({
          id,
          body: {
            username: values.username,
            email: values.email,
            nombre: values.nombre,
            apellido: values.apellido,
            cuil: values.cuil,
            roleId: values.roleId,
            hospitalId: hospitalNormalizado,
          },
        })
        setDatosGuardados(true)
      } catch (err) {
        setFormError(getApiErrorMessage(err))
        return
      }
    }

    // ── Paso contraseña ───────────────────────────────────────────────────────
    const quiereCambiarPassword = newPassword.length > 0 || confirmPassword.length > 0
    if (quiereCambiarPassword) {
      if (newPassword.length < 8) {
        setPwdError('Mínimo 8 caracteres')
        return
      }
      if (newPassword !== confirmPassword) {
        setPwdError('Las contraseñas no coinciden')
        return
      }
      try {
        await changePassword.mutateAsync({ id, password: newPassword })
      } catch {
        setPwdError('Los datos se guardaron, pero no se pudo cambiar la contraseña. Reintentá solo la contraseña.')
        return
      }
    }

    onClose()
  }

  const titulo = isEdit ? 'Editar usuario' : 'Nuevo usuario'
  const guardando = isSubmitting || createUsuario.isPending || updateUsuario.isPending || changePassword.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-2xl w-full mx-4 space-y-4">
        <h3 className="font-bold text-gray-900">{titulo}</h3>

        <form
          onSubmit={handleSubmit(isEdit ? onSubmitEdit : onSubmitCreate)}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              Usuario <span className="text-danger">*</span>
            </label>
            <input {...register('username')} className="h-10 input w-full" />
            {errors.username && <p className="text-xs text-danger mt-1">{errors.username.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              Email <span className="text-danger">*</span>
            </label>
            <input type="email" {...register('email')} className="h-10 input w-full" />
            {errors.email && <p className="text-xs text-danger mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              Nombre <span className="text-danger">*</span>
            </label>
            <input {...register('nombre')} className="h-10 input w-full" />
            {errors.nombre && <p className="text-xs text-danger mt-1">{errors.nombre.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              Apellido <span className="text-danger">*</span>
            </label>
            <input {...register('apellido')} className="h-10 input w-full" />
            {errors.apellido && <p className="text-xs text-danger mt-1">{errors.apellido.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              CUIL <span className="text-danger">*</span>
            </label>
            <input
              {...register('cuil')}
              inputMode="numeric"
              maxLength={11}
              className="h-10 input w-full"
            />
            {errors.cuil && <p className="text-xs text-danger mt-1">{errors.cuil.message}</p>}
          </div>

          {!isEdit && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                Contraseña <span className="text-danger">*</span>
              </label>
              <input type="password" {...register('password')} className="h-10 input w-full" />
              {errors.password && <p className="text-xs text-danger mt-1">{errors.password.message}</p>}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              Rol <span className="text-danger">*</span>
            </label>
            <select {...register('roleId')} defaultValue={prefill.roleId ?? ''} className="h-10 input w-full">
              <option value="" disabled>
                Elegir rol...
              </option>
              {roles?.filter((r) => r.activo).map((r) => (
                <option key={r.id} value={r.id}>
                  {capitalizarEtiqueta(r.nombre)}
                </option>
              ))}
            </select>
            {errors.roleId && <p className="text-xs text-danger mt-1">{errors.roleId.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              Hospital <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <select {...register('hospitalId')} defaultValue={prefill.hospitalId ?? ''} className="h-10 input w-full">
              <option value="">Sin asignar</option>
              {hospitales?.map((h) => (
                <option key={h.id} value={h.id}>
                  {hospitalLabel(h)}
                </option>
              ))}
            </select>
          </div>

          {isEdit && (
            <div className="sm:col-span-2 border-t border-gray-100 pt-4 space-y-4">
              <p className="text-xs font-semibold text-gray-500">Resetear contraseña</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                    Nueva contraseña <span className="text-gray-400 font-normal">(opcional)</span>
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-10 input w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                    Confirmar contraseña
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-10 input w-full"
                  />
                </div>
              </div>
              {pwdError && (
                <p className="text-xs text-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2">{pwdError}</p>
              )}
            </div>
          )}

          {formError && (
            <div className="sm:col-span-2 text-xs text-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {formError}
            </div>
          )}

          <div className="sm:col-span-2 flex gap-3">
            <button type="button" className="btn-outline flex-1" onClick={onClose} disabled={guardando}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={guardando}>
              {guardando ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
