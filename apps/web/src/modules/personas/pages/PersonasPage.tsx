import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { PaginatedResponse, PersonaListItem, PersonaFilters } from '@srrhh/types'
import { apiClient } from '@/shared/lib/api-client'
import { downloadExcel, fetchAllPages } from '@/shared/lib/exportExcel'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useHospitales, useEscalafones, usePuestosCargoNormalizados, useEspecialidadesPuesto } from '@/shared/hooks/useCatalogos'
import { SearchableSelect } from '@/shared/components/ui/SearchableSelect'
import { escalafonLabel } from '@/shared/lib/escalafonLabel'
import { hospitalLabel } from '@/shared/lib/hospitalLabel'
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
    ...(idSial && { idSial }),
    ...(soloJefes && { soloJefes: true }),
  }

  const { data, isLoading, isFetching, isError } = usePersonas(filters)
  const { data: hospitales } = useHospitales()
  // S21: los filtros usan el CATÁLOGO (escalafón→modalidad→puesto→especialidad),
  // igual que Altas de Cargo — así el desplegable se llena aunque no haya padrón
  // cargado. `paraNuevaAlta=true` trae los escalafones con puestos en el catálogo.
  const { data: escalafones } = useEscalafones(true)
  // Puestos del catálogo del escalafón + modalidad elegidos. Sin escalafón, no
  // hay puestos (la cascada arranca en escalafón).
  const { data: puestosCatalogo } = usePuestosCargoNormalizados(
    escalafonId || undefined,
    modalidad || undefined,
  )
  const puestos = puestosCatalogo ?? []
  // Especialidades del puesto elegido (por nombre) — solo si ese puesto tiene.
  const puestoSel = puestos.find((p) => p.id === puestoCargoId)
  const { data: especialidadesPuesto } = useEspecialidadesPuesto(
    escalafonId || undefined,
    puestoSel?.nombre,
  )

  // Pedido de Jorge (2026-08-26): orden alfabético por el LABEL mostrado
  // (no por Escalafon.nombre crudo) — así "CPH" ordena en la C y no se queda
  // perdido bajo la M de "Médicos".
  const escalafonesOrdenados = [...(escalafones ?? [])].sort((a, b) =>
    escalafonLabel(a.nombre).localeCompare(escalafonLabel(b.nombre), 'es')
  )

  // Filtro de especialidad en cascada: solo tiene sentido con un puesto
  // elegido, y solo si ESE puesto realmente tiene especialidades en el
  // catálogo (la mayoría de los puestos no médicos no tienen ninguna).
  const puestoSeleccionado = puestoSel
  const especialidadesDelPuesto = especialidadesPuesto ?? []

  function cambiarPuesto(nuevoPuestoCargoId: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (nuevoPuestoCargoId) next.set('puestoCargoId', nuevoPuestoCargoId); else next.delete('puestoCargoId')
      next.delete('especialidadPuestoId')
      next.delete('page')
      return next
    })
  }

  function cambiarEscalafon(nuevoEscalafonId: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (nuevoEscalafonId) next.set('escalafonId', nuevoEscalafonId); else next.delete('escalafonId')
      // Al cambiar la carrera se reinicia toda la cascada.
      next.delete('modalidad')
      next.delete('puestoCargoId')
      next.delete('especialidadPuestoId')
      next.delete('page')
      return next
    })
  }

  function cambiarModalidad(nuevaModalidad: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (nuevaModalidad) next.set('modalidad', nuevaModalidad); else next.delete('modalidad')
      // Al cambiar la modalidad se reinicia puesto y especialidad.
      next.delete('puestoCargoId')
      next.delete('especialidadPuestoId')
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
          <select
            value={hospitalId}
            onChange={(e) => setParam('hospitalId', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todas las reparticiones</option>
            {hospitales?.map((h) => (
              <option key={h.id} value={h.id}>
                {hospitalLabel(h)}
              </option>
            ))}
          </select>
          <select
            value={escalafonId}
            onChange={(e) => cambiarEscalafon(e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todos los escalafones</option>
            {escalafonesOrdenados.map((e) => (
              <option key={e.id} value={e.id}>
                {escalafonLabel(e.nombre)}
              </option>
            ))}
          </select>
          {escalafonId && (
            <select
              value={modalidad}
              onChange={(e) => cambiarModalidad(e.target.value)}
              className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            >
              <option value="">Todas las modalidades</option>
              <option value="pof">Planta (POF)</option>
              <option value="pou">Guardia (POU)</option>
            </select>
          )}
          <select
            value={activo}
            onChange={(e) => setParam('activo', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Activos e inactivos</option>
            <option value="true">Solo activos</option>
            <option value="false">Solo inactivos</option>
          </select>
          {escalafonId && (
            <SearchableSelect
              value={puestoCargoId}
              onChange={cambiarPuesto}
              options={puestos.map((p) => p.nombre)}
              valueToDisplay={(id) => puestos.find((p) => p.id === id)?.nombre ?? id}
              displayToValue={(label) => puestos.find((p) => p.nombre === label)?.id ?? label}
              placeholder="Todos los puestos"
              className="min-w-[240px]"
            />
          )}
          {puestoCargoId && especialidadesDelPuesto.length > 0 && (
            <select
              value={especialidadPuestoId}
              onChange={(e) => setParam('especialidadPuestoId', e.target.value)}
              className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            >
              <option value="">Todas las especialidades</option>
              {especialidadesDelPuesto.map((esp) => (
                <option key={esp.id} value={esp.id}>
                  {esp.nombre}
                </option>
              ))}
            </select>
          )}
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
          if (puestoCargoId) chips.push({ label: puestoSeleccionado?.nombre ?? puestoCargoId, key: 'puestoCargoId' })
          if (especialidadPuestoId) {
            const esp = especialidadesDelPuesto.find((e) => e.id === especialidadPuestoId)
            chips.push({ label: esp?.nombre ?? especialidadPuestoId, key: 'especialidadPuestoId' })
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
                      if (chip.key === 'escalafonId') cambiarEscalafon('')
                      else if (chip.key === 'modalidad') cambiarModalidad('')
                      else if (chip.key === 'puestoCargoId') cambiarPuesto('')
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
                      <td className="px-4 py-3 text-gray-600">{p.puesto ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{p.especialidadPrincipal ?? '—'}</td>
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
