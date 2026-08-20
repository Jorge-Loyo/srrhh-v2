import { create } from 'zustand'
import type { Usuario } from '@srrhh/types'
import { apiClient, setAccessToken } from '@/shared/lib/api-client'

interface AuthState {
  user: Usuario | null
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  isLoading: false,

  login: async (username, password) => {
    set({ isLoading: true })
    try {
      const res = await apiClient.post('/api/v1/auth/login', { username, password })
      const { accessToken, user } = res.data.data
      setAccessToken(accessToken)
      set({ user, isLoading: false })
    } catch {
      set({ isLoading: false })
      throw new Error('Credenciales inválidas')
    }
  },

  logout: () => {
    setAccessToken(null)
    set({ user: null })
    window.location.href = '/login'
  },
}))
