import axios from 'axios'

let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  withCredentials: true,
})

// Agrega el access token a cada request
apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

// Manejo de errores global
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error.response?.status
    if (status === 401) {
      setAccessToken(null)
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
