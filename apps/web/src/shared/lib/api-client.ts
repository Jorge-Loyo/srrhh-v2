import axios from 'axios'

// ── Base URL — única fuente de verdad para apiClient y rawClient ───────────────
const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

// ── Access token: solo en memoria (vive lo que dura la pestaña) ───────────────
let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

// ── Refresh token: cookie httpOnly gestionada por el browser ──────────────────
// El backend envía el refresh token en una cookie httpOnly (Set-Cookie) y lo
// lee automáticamente en /auth/refresh y /auth/logout. El frontend no tiene
// acceso al valor — withCredentials:true hace que axios incluya la cookie en
// cada request al mismo origen. Esto elimina el vector XSS de localStorage.

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

// Agrega el access token a cada request
apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

// Callback que useAuth registra para poder desloguear desde acá sin importar
// el store (evita ciclo de imports api-client <-> useAuth).
let onSessionExpired: () => void = () => {
  window.location.href = '/login'
}

export function setOnSessionExpired(cb: () => void) {
  onSessionExpired = cb
}

// Ante un 401, intenta refrescar la sesión una sola vez antes de desloguear.
// El refresh token viaja automáticamente en la cookie httpOnly — no hay que
// leerlo ni enviarlo manualmente. Usa un axios "pelado" para el POST /auth/refresh
// para no entrar en loop si ese request también da 401.
const rawClient = axios.create({ baseURL: API_BASE_URL, withCredentials: true })

let refreshInFlight: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await rawClient.post('/api/v1/auth/refresh')
    const { accessToken: newAccessToken } = res.data.data
    setAccessToken(newAccessToken)
    return newAccessToken
  } catch {
    setAccessToken(null)
    return null
  }
}

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error.response?.status
    const original = error.config
    const isRefreshCall = original?.url?.includes('/auth/refresh')

    if (status === 401 && !original?._retried && !isRefreshCall) {
      original._retried = true
      refreshInFlight ??= refreshAccessToken().finally(() => {
        refreshInFlight = null
      })
      const newAccessToken = await refreshInFlight

      if (newAccessToken) {
        original.headers.Authorization = `Bearer ${newAccessToken}`
        return apiClient(original)
      }

      onSessionExpired()
    }

    return Promise.reject(error)
  }
)
