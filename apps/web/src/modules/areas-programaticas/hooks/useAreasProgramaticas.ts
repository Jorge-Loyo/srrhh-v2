import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/lib/api-client'

export interface AreaProgramaticaListItem {
  id: string
  nombre: string
  hospitalSigla: string
  hospitalNombre: string
  cesacs: number
  cargosVigentes: number
}

export interface Jefe {
  nombre: string
  cuil: string
  cargo: string | null
}

export interface CesacEnAp {
  id: string
  numero: number
  direccion: string | null
  barrio: string | null
  nivel: 'unidad' | 'unidad_con_seccion'
  cargosVigentes: number
  jefe: Jefe | null
}

export interface AreaProgramaticaDetail {
  id: string
  nombre: string
  hospital: { id: string; sigla: string; nombre: string }
  cargosVigentes: number
  cesacs: CesacEnAp[]
}

export interface PersonalRow {
  personaId: string
  nombreApellido: string
  cuil: string
  puesto: string | null
  escalafon: string
}

export interface CesacDetail {
  id: string
  numero: number
  direccion: string | null
  barrio: string | null
  nivel: 'unidad' | 'unidad_con_seccion'
  areaProgramatica: {
    id: string
    nombre: string
    hospital: { id: string; sigla: string; nombre: string }
  }
  cargosVigentes: number
  jefe: Jefe | null
  personal: PersonalRow[]
}

export type TipoUnidadFija = 'cemar' | 'centro_odontologico_infantil' | 'red_odontologia'
export type NivelOrganicoUnidadFija = 'division' | 'division_con_seccion' | 'unidad' | 'fuera_de_nivel'

export interface UnidadFijaListItem {
  id: string
  nombre: string
  tipo: TipoUnidadFija
  nivelOrganico: NivelOrganicoUnidadFija
  cargosVigentes: number
}

export interface UnidadFijaDetail extends UnidadFijaListItem {
  jefe: Jefe | null
  personal: PersonalRow[]
}

export function useAreasProgramaticas() {
  return useQuery({
    queryKey: ['areas-programaticas'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: AreaProgramaticaListItem[] }>('/api/v1/areas-programaticas')
      return res.data.data
    },
  })
}

export function useAreaProgramatica(id: string | undefined) {
  return useQuery({
    queryKey: ['areas-programaticas', id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: AreaProgramaticaDetail }>(`/api/v1/areas-programaticas/${id}`)
      return res.data.data
    },
    enabled: !!id,
  })
}

export function useCesac(id: string | undefined) {
  return useQuery({
    queryKey: ['cesacs', id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CesacDetail }>(`/api/v1/cesacs/${id}`)
      return res.data.data
    },
    enabled: !!id,
  })
}

export function useUnidadesFijas() {
  return useQuery({
    queryKey: ['unidades-fijas'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: UnidadFijaListItem[] }>('/api/v1/unidades-fijas')
      return res.data.data
    },
  })
}

export function useUnidadFija(id: string | undefined) {
  return useQuery({
    queryKey: ['unidades-fijas', id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: UnidadFijaDetail }>(`/api/v1/unidades-fijas/${id}`)
      return res.data.data
    },
    enabled: !!id,
  })
}

// Etiquetas de los enums — mismo texto que el badge del boceto.
export const NIVEL_CESAC_LABEL: Record<CesacEnAp['nivel'], string> = {
  unidad: 'Unidad',
  unidad_con_seccion: 'Unidad + Sección',
}

export const TIPO_UNIDAD_FIJA_LABEL: Record<TipoUnidadFija, string> = {
  cemar: 'CEMAR',
  centro_odontologico_infantil: 'Centro Odontológico Infantil',
  red_odontologia: 'Red de Odontología',
}

export const NIVEL_ORGANICO_LABEL: Record<NivelOrganicoUnidadFija, string> = {
  division: 'División',
  division_con_seccion: 'División + Sección',
  unidad: 'Unidad',
  fuera_de_nivel: 'Fuera de Nivel',
}
