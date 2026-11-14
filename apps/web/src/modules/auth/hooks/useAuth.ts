import { create } from 'zustand'
import type { Usuario } from '@srrhh/types'
import {
  apiClient,
  setAccessToken,
  setOnSessionExpired,
} from '@/shared/lib/api-client'

// El user se persiste en localStorage para reconstruir la sesión en el
// arranque (F5) sin un endpoint /me. El refresh token ya NO va en localStorage
// — viaja en cookie httpOnly gestionada por el browser (ver api-client.ts).
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
  isCheckingSession: boolean
  login: (identificador: string, password: string) => Promise<void>
  logout: () => void
  setUser: (patch: Partial<Usuario>) => void
  restoreSession: () => Promise<void>
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  isLoading: false,
  isCheckingSession: true,

  login: async (identificador, password) => {
    set({ isLoading: true })
    try {
      const res = await apiClient.post('/api/v1/auth/login', { identificador, password })
      const { accessToken, user } = res.data.data
      setAccessToken(accessToken)
      persistUser(user)
      restoreSessionPromise = Promise.resolve()
      set({ user, isLoading: false, isCheckingSession: false })
    } catch {
      set({ isLoading: false })
      throw new Error('Credenciales inválidas')
    }
  },

  logout: () => {
    // El refresh token viaja en cookie httpOnly — el browser lo incluye
    // automáticamente. El backend lo revoca y limpia la cookie con Set-Cookie.
    apiClient.post('/api/v1/auth/logout').catch(() => {})
    setAccessToken(null)
    persistUser(null)
    restoreSessionPromise = null
    set({ user: null })
    window.location.href = '/login'
  },

  setUser: (patch) => {
    const current = get().user
    if (!current) return
    const next = { ...current, ...patch }
    persistUser(next)
    set({ user: next })
  },

  restoreSession: () => restoreSessionOnce(set),
}))

let restoreSessionPromise: Promise<void> | null = null

function restoreSessionOnce(set: (partial: Partial<AuthState>) => void): Promise<void> {
  restoreSessionPromise ??= (async () => {
    const persistedUser = readPersistedUser()

    if (!persistedUser) {
      set({ isCheckingSession: false })
      return
    }

    try {
      // El refresh token viaja en la cookie httpOnly — no hay que leerlo.
      const res = await apiClient.post('/api/v1/auth/refresh')
      const { accessToken, user: freshUser } = res.data.data
      setAccessToken(accessToken)
      // Usar el user fresco del servidor (permisos actualizados) si viene;
      // fallback al persistido para compatibilidad con versiones anteriores.
      const user = freshUser ?? persistedUser
      persistUser(user)
      set({ user, isCheckingSession: false })
    } catch {
      setAccessToken(null)
      persistUser(null)
      set({ user: null, isCheckingSession: false })
    }
  })()

  return restoreSessionPromise
}

setOnSessionExpired(() => {
  persistUser(null)
  useAuth.setState({ user: null, isCheckingSession: false })
  window.location.href = '/login'
})
