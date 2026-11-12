import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/hooks/useAuth'
import { usePerfil, useUpdatePerfil, useChangePassword } from '../hooks/usePerfil'

function mensajeError(e: unknown, fallback: string): string {
  const resp = (e as { response?: { data?: { error?: { message?: string }; message?: string } } })?.response
  return resp?.data?.error?.message ?? resp?.data?.message ?? fallback
}

export function PerfilPage() {
  const { data: perfil, isLoading } = usePerfil()
  const updatePerfil = useUpdatePerfil()
  const changePassword = useChangePassword()
  const { setUser } = useAuth()

  // ── Formulario de datos ──────────────────────────────────────────────────
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [datosMsg, setDatosMsg] = useState('')
  const [datosError, setDatosError] = useState('')

  useEffect(() => {
    if (perfil) {
      setNombre(perfil.nombre ?? '')
      setApellido(perfil.apellido ?? '')
      setEmail(perfil.email)
      setUsername(perfil.username)
    }
  }, [perfil])

  async function handleGuardarDatos(e: React.FormEvent) {
    e.preventDefault()
    setDatosMsg('')
    setDatosError('')
    try {
      const actualizado = await updatePerfil.mutateAsync({
        nombre: nombre.trim() || undefined,
        apellido: apellido.trim() || undefined,
        email: email.trim() || undefined,
        username: username.trim() || undefined,
      })
      // Re-persistir el user (header + can() sin recargar): el backend no tiene /me.
      setUser({
        nombre: actualizado.nombre,
        apellido: actualizado.apellido,
        email: actualizado.email,
        username: actualizado.username,
      })
      setDatosMsg('Datos actualizados')
    } catch (err) {
      setDatosError(mensajeError(err, 'No se pudieron guardar los datos'))
    }
  }

  // ── Formulario de contraseña ─────────────────────────────────────────────
  const [passwordActual, setPasswordActual] = useState('')
  const [passwordNueva, setPasswordNueva] = useState('')
  const [passwordConfirmacion, setPasswordConfirmacion] = useState('')
  const [passMsg, setPassMsg] = useState('')
  const [passError, setPassError] = useState('')

  async function handleCambiarPassword(e: React.FormEvent) {
    e.preventDefault()
    setPassMsg('')
    setPassError('')
    if (passwordNueva !== passwordConfirmacion) {
      setPassError('La confirmación no coincide')
      return
    }
    try {
      await changePassword.mutateAsync({ passwordActual, passwordNueva, passwordConfirmacion })
      setPassMsg('Contraseña actualizada')
      setPasswordActual('')
      setPasswordNueva('')
      setPasswordConfirmacion('')
    } catch (err) {
      setPassError(mensajeError(err, 'No se pudo cambiar la contraseña'))
    }
  }

  if (isLoading || !perfil) {
    return <p className="text-sm text-gray-500">Cargando perfil...</p>
  }

  const cuilProvisorio = !!perfil.cuil && perfil.cuil.startsWith('00')
  const inputClass =
    'w-full h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary'
  const labelClass = 'block text-sm font-semibold text-gray-700 mb-1'

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-primary text-2xl font-bold text-gray-900">Mi perfil</h1>

      {/* ── Datos del usuario ──────────────────────────────────────────── */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Datos personales</h2>
        <form onSubmit={handleGuardarDatos} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="perfil-nombre">Nombre</label>
              <input id="perfil-nombre" type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="perfil-apellido">Apellido</label>
              <input id="perfil-apellido" type="text" value={apellido} onChange={(e) => setApellido(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="perfil-email">Email</label>
            <input id="perfil-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </div>

          <div>
            <label className={labelClass} htmlFor="perfil-username">Usuario</label>
            <input id="perfil-username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
          </div>

          <div>
            <label className={labelClass} htmlFor="perfil-cuil">CUIL</label>
            <input
              id="perfil-cuil"
              type="text"
              value={perfil.cuil ?? ''}
              disabled
              className={`${inputClass} bg-gray-100 text-gray-500 cursor-not-allowed`}
            />
            <p className="text-xs text-gray-400 mt-1">El CUIL no puede editarse.</p>
            {cuilProvisorio && (
              <p className="text-xs text-amber-600 mt-1">CUIL provisorio — pendiente de actualización.</p>
            )}
          </div>

          {datosError && (
            <div className="bg-red-50 border border-danger text-danger text-sm px-3 py-2 rounded">{datosError}</div>
          )}
          {datosMsg && (
            <div className="bg-green-50 border border-green-500 text-green-700 text-sm px-3 py-2 rounded">{datosMsg}</div>
          )}

          <button type="submit" disabled={updatePerfil.isPending} className="btn-primary h-10 px-6">
            {updatePerfil.isPending ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </form>
      </section>

      {/* ── Cambio de contraseña ──────────────────────────────────────── */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Cambiar contraseña</h2>
        <form onSubmit={handleCambiarPassword} className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="perfil-pass-actual">Contraseña actual</label>
            <input id="perfil-pass-actual" type="password" value={passwordActual} onChange={(e) => setPasswordActual(e.target.value)} className={inputClass} required autoComplete="current-password" />
          </div>
          <div>
            <label className={labelClass} htmlFor="perfil-pass-nueva">Contraseña nueva</label>
            <input id="perfil-pass-nueva" type="password" value={passwordNueva} onChange={(e) => setPasswordNueva(e.target.value)} className={inputClass} required minLength={8} autoComplete="new-password" />
          </div>
          <div>
            <label className={labelClass} htmlFor="perfil-pass-confirmacion">Confirmar contraseña nueva</label>
            <input id="perfil-pass-confirmacion" type="password" value={passwordConfirmacion} onChange={(e) => setPasswordConfirmacion(e.target.value)} className={inputClass} required minLength={8} autoComplete="new-password" />
          </div>

          {passError && (
            <div className="bg-red-50 border border-danger text-danger text-sm px-3 py-2 rounded">{passError}</div>
          )}
          {passMsg && (
            <div className="bg-green-50 border border-green-500 text-green-700 text-sm px-3 py-2 rounded">{passMsg}</div>
          )}

          <button type="submit" disabled={changePassword.isPending} className="btn-primary h-10 px-6">
            {changePassword.isPending ? 'Cambiando...' : 'Cambiar contraseña'}
          </button>
        </form>
      </section>
    </div>
  )
}
