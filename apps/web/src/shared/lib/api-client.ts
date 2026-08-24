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

// ── Refresh token: persistido en localStorage ──────────────────────────────────
// El backend lo espera en el body de POST /auth/refresh (no maneja cookies), así
// que el cliente tiene que guardarlo para poder sobrevivir a un F5. Trade-off de
// seguridad conocido (localStorage es legible por XSS) — ver PLAN_SCRUM_2026.md
// backlog: migrar a cookie httpOnly + endpoint /me cuando el equipo lo priorice.
const REFRESH_TOKEN_KEY = 'srrhh_refresh_token'

export function setRefreshToken(token: string | null) {
  if (token) localStorage.setItem(REFRESH_TOKEN_KEY, token)
  else localStorage.removeItem(REFRESH_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

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

// Ante un 401, intenta refrescar la sesión una sola vez antes de desloguear —
// así se ejercita la rotación de refresh token en cualquier request, no solo
// en el login. Usa un axios "pelado" (sin estos interceptors) para el propio
// POST /auth/refresh, para no entrar en loop si ese request también da 401.
const rawClient = axios.create({ baseURL: API_BASE_URL })

let refreshInFlight: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null

  try {
    const res = await rawClient.post('/api/v1/auth/refresh', { refreshToken })
    const { accessToken: newAccessToken, refreshToken: newRefreshToken } = res.data.data
    setAccessToken(newAccessToken)
    setRefreshToken(newRefreshToken)
    return newAccessToken
  } catch {
    setAccessToken(null)
    setRefreshToken(null)
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
      // Coalesce: si ya hay un refresh en curso (varios requests 401 a la vez),
      // todos esperan el mismo resultado en vez de disparar N refresh en paralelo.
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
