import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { PaginatedResponse, PersonaListItem, PersonaFilters } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'
import { downloadExcel, fetchAllPages } from '@/shared/lib/exportExcel'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useHospitales, useEscalafones, usePuestosCargoNormalizados, useEspecialidadesDePuestoId } from '@/shared/hooks/useCatalogos'
import type { FiltrosCatalogoValores } from '@/shared/components/filtros/FiltrosCatalogo'
import {
  FiltrosCatalogoUniones,
  type GrupoCatalogo,
  serializarGrupos,
} from '@/shared/components/filtros/FiltrosCatalogoUniones'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import { capitalizar } from '@/shared/lib/utils'
import { usePersonas } from '../hooks/usePersonas'

const LIMIT = 50

export function PersonasPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const search       = searchParams.get('search') ?? ''
  const hospitalId   = searchParams.get('hospitalId') ?? ''
  const escalafonId  = searchParams.get('escalafonId') ?? ''
  const modalidad    = (searchParams.get('modalidad') ?? '') as '' | 'pof' | 'pou'
  const activo       = (searchParams.get('activo') ?? '') as '' | 'true' | 'false'
  const puestoCargoId        = searchParams.get('puestoCargoId') ?? ''
  const especialidadPuestoId = searchParams.get('especialidadPuestoId') ?? ''
  const idSial       = searchParams.get('idSial') ?? ''
  const soloJefes    = searchParams.get('soloJefes') === 'true'
  const page         = Number(searchParams.get('page') ?? '1')

  // S21: uniones (OR) de la cascada de catálogo. Persisten en la URL como JSON
  // en el param `grupos` (incluye labels para presentación de los chips).
  const grupos: GrupoCatalogo[] = (() => {
    const raw = searchParams.get('grupos')
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as GrupoCatalogo[]) : []
    } catch {
      return []
    }
  })()

  function setParam(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value); else next.delete(key)
      next.delete('page')
      return next
    })
  }

  function setPage(p: number | ((prev: number) => number)) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      const newPage = typeof p === 'function' ? p(Number(prev.get('page') ?? '1')) : p
      if (newPage === 1) next.delete('page'); else next.set('page', String(newPage))
      return next
    }, { replace: true })
  }

  // S3-6: debounce 300ms — no dispara un fetch por cada tecla.
  const searchDebounced = useDebounce(search, 300)

  const filters: PersonaFilters = {
    page,
    limit: LIMIT,
    ...(searchDebounced && { search: searchDebounced }),
    ...(hospitalId && { hospitalId }),
    ...(escalafonId && { escalafonId }),
    ...(modalidad && { modalidad }),
    ...(activo && { activo: activo === 'true' }),
    ...(puestoCargoId && { puestoCargoId }),
    ...(especialidadPuestoId && { especialidadPuestoId }),
    ...(grupos.length > 0 && { grupos: serializarGrupos(grupos) }),
    ...(idSial && { idSial }),
    ...(soloJefes && { soloJefes: true }),
  }

  const { data, isLoading, isFetching, isError } = usePersonas(filters)
  // Hooks de catálogo — el componente FiltrosCatalogo maneja los selectores;
  // acá se leen (de la MISMA cache de TanStack Query, sin request extra) solo
  // para resolver los labels de los chips de filtros activos.
  const { data: hospitales } = useHospitales()
  const { data: escalafones } = useEscalafones(true)
  const { data: puestosCatalogo } = usePuestosCargoNormalizados(
    escalafonId || undefined,
    modalidad || undefined,
  )
  const puestos = puestosCatalogo ?? []
  const puestoSeleccionado = puestos.find((p) => p.id === puestoCargoId)
  const { data: especialidadesPuesto } = useEspecialidadesDePuestoId(puestoCargoId || undefined)
  const especialidadesDelPuesto = especialidadesPuesto ?? []

  // S21: sincroniza los cambios del componente FiltrosCatalogo con la URL,
  // reseteando la página. El componente ya emite el reseteo de la cascada
  // inferior (al cambiar escalafón manda modalidad/puesto/especialidad vacíos).
  function onChangeFiltros(cambios: Partial<FiltrosCatalogoValores>) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      const mapa: Record<keyof FiltrosCatalogoValores, string> = {
        reparticionId: 'hospitalId',
        escalafonId: 'escalafonId',
        modalidad: 'modalidad',
        puestoCargoId: 'puestoCargoId',
        especialidadPuestoId: 'especialidadPuestoId',
      }
      for (const [k, v] of Object.entries(cambios)) {
        const param = mapa[k as keyof FiltrosCatalogoValores]
        if (v) next.set(param, v); else next.delete(param)
      }
      next.delete('page')
      return next
    })
  }

  const valoresFiltros: FiltrosCatalogoValores = {
    reparticionId: hospitalId,
    escalafonId,
    modalidad: modalidad as '' | 'pof' | 'pou',
    puestoCargoId,
    especialidadPuestoId,
  }

  // S21: fija el grupo en edición como una unión (OR), resolviendo sus labels
  // desde las caches de catálogo, y limpia la cascada para armar el próximo.
  function agregarUnion() {
    const nuevo: GrupoCatalogo = {
      reparticionId: hospitalId,
      escalafonId,
      modalidad: modalidad as '' | 'pof' | 'pou',
      puestoCargoId,
      especialidadPuestoId,
      labels: {
        reparticion: hospitalId ? hospitales?.find((h) => h.id === hospitalId)?.sigla : undefined,
        escalafon: escalafonId
          ? (() => {
              const e = escalafones?.find((e) => e.id === escalafonId)
              return e ? escalafonLabel(e.nombre) : undefined
            })()
          : undefined,
        modalidad: modalidad ? (modalidad === 'pof' ? 'Planta (POF)' : 'Guardia (POU)') : undefined,
        puesto: puestoCargoId ? puestoSeleccionado?.nombre : undefined,
        especialidad: especialidadPuestoId
          ? especialidadesDelPuesto.find((e) => e.id === especialidadPuestoId)?.nombre
          : undefined,
      },
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('grupos', JSON.stringify([...grupos, nuevo]))
      // Limpia la cascada en edición.
      for (const k of ['hospitalId', 'escalafonId', 'modalidad', 'puestoCargoId', 'especialidadPuestoId']) {
        next.delete(k)
      }
      next.delete('page')
      return next
    })
  }

  function quitarGrupo(index: number) {
    const restantes = grupos.filter((_, i) => i !== index)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (restantes.length) next.set('grupos', JSON.stringify(restantes))
      else next.delete('grupos')
      next.delete('page')
      return next
    })
  }

  const [exportando, setExportando] = useState(false)
  const [exportError, setExportError] = useState(false)

  // S3-10: exporta TODO el resultado filtrado (no solo la página visible en
  // pantalla) — fetchAllPages pagina en lotes de 1000 contra el mismo
  // endpoint que ya usa la tabla, con los mismos filtros activos (page/limit
  // se excluyen a propósito, fetchAllPages los maneja por su cuenta).
  async function handleExport() {
    setExportando(true)
    setExportError(false)
    try {
      const { page: _page, limit: _limit, ...filtrosSinPaginado } = filters
      const personas = await fetchAllPages<PersonaListItem>((p, l) =>
        apiClient
          .get<PaginatedResponse<PersonaListItem>>('/api/v1/personas', { params: { ...filtrosSinPaginado, page: p, limit: l } })
          .then((r) => r.data)
      )
      downloadExcel(
        `personas_${new Date().toISOString().slice(0, 10)}.xlsx`,
        personas.map((p) => ({
          'Apellido y Nombre': p.apellidoNombre,
          CUIL: p.cuil,
          'Tipo Doc': p.tipoDoc ?? '',
          Documento: p.numeroDoc ?? '',
          Sexo: p.sexo ?? '',
          'Fecha Nacimiento': p.fechaNacimiento ?? '',
          Puesto: p.puesto ?? '',
          'Especialidad Principal': p.especialidadPrincipal ?? '',
          Estado: p.activo ? 'Activo' : 'Inactivo',
        }))
      )
    } catch {
      setExportError(true)
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-primary text-xl font-bold text-gray-900">Personas</h1>
          <button className="btn-outline" onClick={handleExport} disabled={exportando}>
            {exportando ? 'Exportando...' : 'Exportar a Excel'}
          </button>
        </div>
        {exportError && (
          <p className="text-sm text-danger">No se pudo generar el archivo. Volvé a intentar en unos segundos.</p>
        )}

        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Buscar por nombre, CUIL o DNI..."
            value={search}
            onChange={(e) => setParam('search', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded flex-1 min-w-[240px] focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          />
          <input
            type="text"
            placeholder="ID SIAL exacto..."
            value={idSial}
            onChange={(e) => setParam('idSial', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded w-48 focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          />
          <FiltrosCatalogoUniones
            valores={valoresFiltros}
            onChange={onChangeFiltros}
            grupos={grupos}
            onAgregarUnion={agregarUnion}
            onQuitarGrupo={quitarGrupo}
          />
          <button
            type="button"
            onClick={() => setParam('soloJefes', soloJefes ? '' : 'true')}
            className={`h-10 px-3 rounded border text-sm font-semibold transition-colors ${
              soloJefes
                ? 'bg-yellow-100 border-yellow-300 text-yellow-800'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
            title="Mostrar solo personas con cargo de jefatura"
          >
            👔 Solo jefes
          </button>
          {/* Estado: botones toggle excluyentes (reemplazan el desplegable). */}
          <button
            type="button"
            onClick={() => setParam('activo', activo === 'true' ? '' : 'true')}
            className={`h-10 px-3 rounded border text-sm font-semibold transition-colors ${
              activo === 'true'
                ? 'bg-green-100 border-green-300 text-green-800'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
            title="Mostrar solo personas activas"
          >
            Activos
          </button>
          <button
            type="button"
            onClick={() => setParam('activo', activo === 'false' ? '' : 'false')}
            className={`h-10 px-3 rounded border text-sm font-semibold transition-colors ${
              activo === 'false'
                ? 'bg-gray-200 border-gray-400 text-gray-800'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
            title="Mostrar solo personas inactivas"
          >
            Inactivos
          </button>
        </div>

        {/* Burbujas de filtros activos */}
        {(() => {
          const chips: { label: string; key: string }[] = []
          if (search) chips.push({ label: `"${search}"`, key: 'search' })
          if (idSial) chips.push({ label: `ID SIAL: ${idSial}`, key: 'idSial' })
          if (hospitalId) {
            const h = hospitales?.find((h) => h.id === hospitalId)
            chips.push({ label: h?.sigla ?? hospitalId, key: 'hospitalId' })
          }
          if (escalafonId) {
            const e = escalafones?.find((e) => e.id === escalafonId)
            chips.push({ label: e ? escalafonLabel(e.nombre) : escalafonId, key: 'escalafonId' })
          }
          if (modalidad) chips.push({ label: modalidad === 'pof' ? 'Planta (POF)' : 'Guardia (POU)', key: 'modalidad' })
          if (activo) chips.push({ label: activo === 'true' ? 'Solo activos' : 'Solo inactivos', key: 'activo' })
          if (puestoCargoId) chips.push({ label: capitalizar(puestoSeleccionado?.nombre) || puestoCargoId, key: 'puestoCargoId' })
          if (especialidadPuestoId) {
            const esp = especialidadesDelPuesto.find((e) => e.id === especialidadPuestoId)
            chips.push({ label: capitalizar(esp?.nombre) || especialidadPuestoId, key: 'especialidadPuestoId' })
          }
          if (soloJefes) chips.push({ label: 'Solo jefes', key: 'soloJefes' })
          if (chips.length === 0) return null
          return (
            <div className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <span key={chip.key} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary/10 text-secondary text-xs font-medium">
                  {chip.label}
                  <button
                    onClick={() => {
                      // La cascada del catálogo se limpia vía onChangeFiltros
                      // (que resetea los niveles inferiores). El chip de
                      // repartición mapea a hospitalId.
                      if (chip.key === 'escalafonId') onChangeFiltros({ escalafonId: '' })
                      else if (chip.key === 'modalidad') onChangeFiltros({ modalidad: '' })
                      else if (chip.key === 'puestoCargoId') onChangeFiltros({ puestoCargoId: '' })
                      else if (chip.key === 'especialidadPuestoId') onChangeFiltros({ especialidadPuestoId: '' })
                      else if (chip.key === 'hospitalId') onChangeFiltros({ reparticionId: '' })
                      else setParam(chip.key, '')
                    }}
                    className="ml-0.5 hover:text-secondary/60"
                    aria-label={`Quitar filtro ${chip.label}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {chips.length > 1 && (
                <button
                  onClick={() => setSearchParams({})}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  Limpiar todo
                </button>
              )}
            </div>
          )
        })()}
      </div>

      <div className="bg-white rounded-lg shadow-sm flex-1 overflow-y-auto min-h-0">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando personas...</p>}
        {isError && <p className="p-6 text-sm text-danger">No se pudo cargar el listado de personas.</p>}

        {!isLoading && !isError && data && (
          <>
            {data.data.length === 0 && (
              <p className="p-6 text-sm text-gray-400 text-center">
                Sin resultados para los filtros aplicados.
              </p>
            )}

            {data.data.length > 0 && (
              <table className={`w-full text-sm border-separate border-spacing-0 ${isFetching ? 'opacity-60' : ''}`}>
                <thead className="bg-navy text-white text-left sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 font-semibold rounded-tl-lg">Apellido y Nombre</th>
                    <th className="px-4 py-3 font-semibold">CUIL</th>
                    <th className="px-4 py-3 font-semibold">Documento</th>
                    <th className="px-4 py-3 font-semibold">ID SIAL</th>
                    <th className="px-4 py-3 font-semibold">Puesto</th>
                    <th className="px-4 py-3 font-semibold">Especialidad</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold rounded-tr-lg" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.data.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{p.apellidoNombre}</td>
                      <td className="px-4 py-3 text-gray-600">{p.cuil}</td>
                      <td className="px-4 py-3 text-gray-600">{p.numeroDoc ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{p.idSial ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{capitalizar(p.puesto) || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{capitalizar(p.especialidadPrincipal) || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={p.activo ? 'badge-success' : 'badge-default'}>
                          {p.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/personas/${p.id}`} state={{ from: searchParams.toString() }} className="btn-outline">
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {data.meta.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                <span>
                  Página {data.meta.page} de {data.meta.pages} — {data.meta.total} en total
                </span>
                <div className="flex gap-2">
                  <button className="btn-outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Anterior
                  </button>
                  <button
                    className="btn-outline"
                    disabled={page >= data.meta.pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
