import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

/**
 * Envuelve las rutas que requieren sesión. Al montar, intenta restaurar la
 * sesión desde el refreshToken guardado (sobrevive a un F5); mientras eso
 * corre muestra un loading en vez de mandar a /login de entrada, para no
 * desloguear a alguien con una sesión válida.
 */
export function ProtectedRoute() {
  const { user, isCheckingSession, restoreSession } = useAuth()

  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  if (isCheckingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Verificando sesión...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
