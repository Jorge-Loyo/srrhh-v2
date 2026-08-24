import { create } from 'zustand'
import type { Usuario } from '@srrhh/types'
import {
  apiClient,
  setAccessToken,
  setRefreshToken,
  getRefreshToken,
  setOnSessionExpired,
} from '@/shared/lib/api-client'

// El backend no expone un /me, y POST /auth/refresh solo devuelve tokens nuevos
// (no el user) — así que además del refreshToken persistimos el user "de
// confianza" en localStorage para poder reconstruir la sesión en el arranque
// sin esperar un endpoint que hoy no existe. Ver nota de seguridad en
// api-client.ts (mismo trade-off: localStorage, no cookie httpOnly).
const USER_KEY = 'srrhh_user'

function persistUser(user: Usuario | null) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
  else localStorage.removeItem(USER_KEY)
}

function readPersistedUser(): Usuario | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as Usuario) : null
  } catch {
    return null
  }
}

interface AuthState {
  user: Usuario | null
  isLoading: boolean
  /** true mientras se verifica si hay una sesión previa al arrancar la app */
  isCheckingSession: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  /** Intenta restaurar la sesión desde el refreshToken guardado. Se llama una
   * sola vez, al montar ProtectedRoute. */
  restoreSession: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isCheckingSession: true,

  login: async (username, password) => {
    set({ isLoading: true })
    try {
      const res = await apiClient.post('/api/v1/auth/login', { username, password })
      const { accessToken, refreshToken, user } = res.data.data
      setAccessToken(accessToken)
      setRefreshToken(refreshToken)
      persistUser(user)
      // Evita que ProtectedRoute dispare un /refresh redundante apenas
      // navegamos a "/" — la sesión recién se validó acá mismo.
      restoreSessionPromise = Promise.resolve()
      set({ user, isLoading: false, isCheckingSession: false })
    } catch {
      set({ isLoading: false })
      throw new Error('Credenciales inválidas')
    }
  },

  logout: () => {
    const rt = getRefreshToken()
    if (rt) apiClient.post('/api/v1/auth/logout', { refreshToken: rt }).catch(() => {})
    setAccessToken(null)
    setRefreshToken(null)
    persistUser(null)
    // Resetear la promesa para que restoreSession corra de nuevo si el usuario
    // vuelve a loguearse en la misma pestaña sin recargar.
    restoreSessionPromise = null
    set({ user: null })
    window.location.href = '/login'
  },

  restoreSession: () => restoreSessionOnce(set),
}))

// Idempotente a propósito: React StrictMode duplica el efecto que dispara
// restoreSession() en desarrollo, y dos refresh casi simultáneos con el mismo
// refreshToken activarían la detección de reutilización del backend (revoca
// toda la familia de tokens). Todas las llamadas comparten la misma promesa.
let restoreSessionPromise: Promise<void> | null = null

function restoreSessionOnce(set: (partial: Partial<AuthState>) => void): Promise<void> {
  restoreSessionPromise ??= (async () => {
    const refreshToken = getRefreshToken()
    const persistedUser = readPersistedUser()

    if (!refreshToken || !persistedUser) {
      set({ isCheckingSession: false })
      return
    }

    try {
      const res = await apiClient.post('/api/v1/auth/refresh', { refreshToken })
      const { accessToken, refreshToken: newRefreshToken } = res.data.data
      setAccessToken(accessToken)
      setRefreshToken(newRefreshToken)
      set({ user: persistedUser, isCheckingSession: false })
    } catch {
      setAccessToken(null)
      setRefreshToken(null)
      persistUser(null)
      set({ user: null, isCheckingSession: false })
    }
  })()

  return restoreSessionPromise
}

// Si api-client fuerza un logout (401 sin refresh posible, fuera de un
// componente React), limpia también el estado del store.
setOnSessionExpired(() => {
  setRefreshToken(null)
  persistUser(null)
  useAuth.setState({ user: null, isCheckingSession: false })
  window.location.href = '/login'
})
