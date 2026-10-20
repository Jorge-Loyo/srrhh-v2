import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'
import type { Usuario } from '@srrhh/types'

// Campos editables del propio perfil — el PATCH envía SOLO estos (nunca el
// objeto Usuario completo ni `cuil`, que es inmutable para el usuario).
export interface UpdatePerfilInput {
  nombre?: string
  apellido?: string
  email?: string
  username?: string
}

export interface ChangePasswordInput {
  passwordActual: string
  passwordNueva: string
  passwordConfirmacion: string
}

// ── Perfil del usuario actual ────────────────────────────────────────────────
export function usePerfil() {
  return useQuery({
    queryKey: ['perfil'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Usuario }>('/api/v1/perfil')
      return res.data.data
    },
  })
}

// ── Actualizar datos del perfil ──────────────────────────────────────────────
export function useUpdatePerfil() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdatePerfilInput) => {
      const res = await apiClient.patch<{ data: Usuario }>('/api/v1/perfil', input)
      return res.data.data
    },
    onSuccess: (perfil) => {
      qc.setQueryData(['perfil'], perfil)
    },
  })
}

// ── Cambio de contraseña ──────────────────────────────────────────────────────
export function useChangePassword() {
  return useMutation({
    mutationFn: async (input: ChangePasswordInput) => {
      const res = await apiClient.patch<{ data: { ok: boolean } }>('/api/v1/perfil/password', input)
      return res.data.data
    },
  })
}
