import { useEffect, useState } from 'react'
import type { MiembroJuradoCeetpsDto } from '@srrhh/types'
import { usePersonas } from '@/modules/personas/hooks/usePersonas'
import {
  FiltrosCatalogo,
  type FiltrosCatalogoValores,
} from '@/shared/components/filtros/FiltrosCatalogo'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { useToast } from '@/shared/components/ui/useToast'
import {
  useAgregarMiembroJuradoCeetps,
  useGuardarCantidadesJuradoCeetps,
  useJuradoCeetps,
  useQuitarMiembroJuradoCeetps,
} from '../hooks/useCeetpsWizard'
import { faltantesJurado, juradoCompleto, lugaresLibres } from '../lib/juradoCeetps'

// Etapa 2 del wizard CEETPS: asignación manual del jurado (reemplaza el sorteo).
// 1) se definen los lugares (titulares y suplentes); 2) se buscan personas con
// cargo vigente ocupado y se asignan hasta cubrir los lugares.

type Rol = 'titular' | 'suplente'

const FILTROS_VACIOS: FiltrosCatalogoValores = {
  reparticionId: '',
  escalafonId: '',
  codigoRegistroId: '',
  modalidad: '',
  puestoCargoId: '',
  especialidadPuestoId: '',
}

function mensajeError(e: unknown, porDefecto: string): string {
  return (
    (e as { response?: { data?: { error?: { message?: string }; message?: string } } })?.response
      ?.data?.error?.message ??
    (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
    porDefecto
  )
}

export function JuradoAsignacionPanel({
  concursoId,
  bloqueado,
}: {
  concursoId: string
  bloqueado: boolean
}) {
  const { toast, ToastUI } = useToast()
  const { data: jurado, isLoading } = useJuradoCeetps(concursoId)
  const guardarCantidades = useGuardarCantidadesJuradoCeetps(concursoId)
  const agregar = useAgregarMiembroJuradoCeetps(concursoId)
  const quitar = useQuitarMiembroJuradoCeetps(concursoId)

  // ── Paso 1: lugares ──
  const [cantTitulares, setCantTitulares] = useState('')
  const [cantSuplentes, setCantSuplentes] = useState('')
  useEffect(() => {
    setCantTitulares(jurado?.cantTitulares != null ? String(jurado.cantTitulares) : '')
    setCantSuplentes(jurado?.cantSuplentes != null ? String(jurado.cantSuplentes) : '')
  }, [jurado?.cantTitulares, jurado?.cantSuplentes])

  const lugaresDefinidos = jurado?.cantTitulares != null && jurado?.cantSuplentes != null
  const titularesNum = Number(cantTitulares)
  const suplentesNum = Number(cantSuplentes)
  const cantidadesValidas =
    cantTitulares !== '' &&
    cantSuplentes !== '' &&
    Number.isInteger(titularesNum) &&
    Number.isInteger(suplentesNum) &&
    titularesNum >= 1 &&
    suplentesNum >= 0

  // ── Paso 2: búsqueda de personas con cargo vigente ──
  const [busqueda, setBusqueda] = useState('')
  const [filtros, setFiltros] = useState<FiltrosCatalogoValores>(FILTROS_VACIOS)
  const busquedaDebounced = useDebounce(busqueda.trim(), 300)
  const hayCriterio = busquedaDebounced.length >= 2 || Object.values(filtros).some((v) => v !== '')
  const { data: resultados, isFetching } = usePersonas({
    conCargoVigente: true,
    ...(busquedaDebounced && { search: busquedaDebounced }),
    ...(filtros.reparticionId && { hospitalId: filtros.reparticionId }),
    ...(filtros.escalafonId && { escalafonId: filtros.escalafonId }),
    ...(filtros.codigoRegistroId && { codigoRegistroId: filtros.codigoRegistroId }),
    ...(filtros.puestoCargoId && { puestoCargoId: filtros.puestoCargoId }),
    ...(filtros.especialidadPuestoId && { especialidadPuestoId: filtros.especialidadPuestoId }),
    limit: 20,
  })
  const asignados = new Set(jurado?.miembros.map((m) => m.personaId) ?? [])

  const ocupado = guardarCantidades.isPending || agregar.isPending || quitar.isPending

  function onGuardarCantidades() {
    guardarCantidades.mutate(
      { cantTitulares: titularesNum, cantSuplentes: suplentesNum },
      {
        onSuccess: () => toast.success('Lugares del jurado guardados.'),
        onError: (e) => toast.error(mensajeError(e, 'No se pudieron guardar los lugares.')),
      },
    )
  }

  function onAgregar(personaId: string, rol: Rol) {
    agregar.mutate(
      { personaId, rol },
      {
        onSuccess: () =>
          toast.success(rol === 'titular' ? 'Titular asignado.' : 'Suplente asignado.'),
        onError: (e) => toast.error(mensajeError(e, 'No se pudo asignar a la persona.')),
      },
    )
  }

  function onQuitar(m: MiembroJuradoCeetpsDto) {
    quitar.mutate(m.id, {
      onSuccess: () => toast.success('Miembro quitado del jurado.'),
      onError: (e) => toast.error(mensajeError(e, 'No se pudo quitar al miembro.')),
    })
  }

  const completo = juradoCompleto(jurado)
  const faltantes = faltantesJurado(jurado)

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-4 space-y-4">
      {ToastUI}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-indigo-900">Asignación de jurado</p>
          <p className="text-xs text-indigo-800 mt-0.5">
            Definí cuántos titulares y suplentes tiene el jurado y después buscá y asigná a las
            personas. Solo se pueden asignar personas con un cargo vigente ocupado.
          </p>
        </div>
        {lugaresDefinidos && (
          <span
            className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
              completo
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            {completo ? '✓ Jurado completo' : faltantes.join(' · ')}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-gray-400">Cargando jurado…</p>
      ) : (
        <>
          {/* Paso 1 — lugares */}
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-end gap-3">
            <div className="w-36">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Titulares</label>
              <input
                type="number"
                min={1}
                value={cantTitulares}
                disabled={bloqueado}
                onChange={(e) => setCantTitulares(e.target.value)}
                className="input h-10 w-full"
              />
            </div>
            <div className="w-36">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Suplentes</label>
              <input
                type="number"
                min={0}
                value={cantSuplentes}
                disabled={bloqueado}
                onChange={(e) => setCantSuplentes(e.target.value)}
                className="input h-10 w-full"
              />
            </div>
            <button
              className="btn-primary text-sm shrink-0"
              disabled={bloqueado || ocupado || !cantidadesValidas}
              onClick={onGuardarCantidades}
            >
              {lugaresDefinidos ? 'Actualizar lugares' : 'Guardar lugares'}
            </button>
            {!lugaresDefinidos && (
              <p className="basis-full text-xs text-amber-700 font-medium">
                ⚠ Guardá la cantidad de titulares y suplentes para poder buscar a las personas.
              </p>
            )}
          </div>

          {/* Miembros asignados */}
          {lugaresDefinidos &&
            (['titular', 'suplente'] as const).map((rol) => {
              const cant = rol === 'titular' ? jurado?.cantTitulares : jurado?.cantSuplentes
              if (!cant) return null
              const miembros = jurado?.miembros.filter((m) => m.rol === rol) ?? []
              return (
                <div key={rol}>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    {rol === 'titular' ? 'Titulares' : 'Suplentes'} ({miembros.length}/{cant})
                  </p>
                  {miembros.length === 0 ? (
                    <p className="text-xs text-gray-400">Todavía no hay {rol}es asignados.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {miembros.map((m) => (
                        <div
                          key={m.id}
                          className="rounded-lg border border-gray-200 bg-white px-3 py-2 flex items-center gap-2 flex-wrap"
                        >
                          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px] font-bold">
                            {rol === 'titular' ? 'T' : 'S'}
                            {m.orden}
                          </span>
                          <span className="text-sm font-semibold text-gray-900">
                            {m.apellidoNombre}
                          </span>
                          <span className="text-xs text-gray-400 font-mono">{m.cuil}</span>
                          <span className="flex flex-wrap gap-x-3 text-[11px] text-gray-500">
                            {m.hospitalNombre && <span>🏥 {m.hospitalNombre}</span>}
                            {m.puesto && <span>💼 {m.puesto}</span>}
                          </span>
                          <button
                            className="ml-auto text-xs text-danger hover:underline disabled:opacity-50"
                            disabled={bloqueado || ocupado}
                            onClick={() => onQuitar(m)}
                          >
                            Quitar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

          {/* Paso 2 — buscar y asignar */}
          {lugaresDefinidos && !completo && !bloqueado && (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 space-y-3">
              <p className="text-sm font-semibold text-gray-800">Buscar personas</p>
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="CUIL, DNI o apellido y nombre"
                className="input h-10 w-full"
              />
              <FiltrosCatalogo
                valores={filtros}
                onChange={(cambios) => setFiltros((f) => ({ ...f, ...cambios }))}
                mostrarModalidad={false}
              />
              {!hayCriterio ? (
                <p className="text-xs text-gray-400">
                  Escribí al menos 2 caracteres o elegí un filtro para buscar.
                </p>
              ) : isFetching && !resultados ? (
                <p className="text-xs text-gray-400">Buscando…</p>
              ) : !resultados || resultados.data.length === 0 ? (
                <p className="text-xs text-gray-400">
                  No hay personas con cargo vigente que coincidan con la búsqueda.
                </p>
              ) : (
                <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {resultados.data.map((p) => {
                    const yaAsignada = asignados.has(p.id)
                    return (
                      <div key={p.id} className="px-3 py-2 flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">
                          {p.apellidoNombre}
                        </span>
                        <span className="text-xs text-gray-400 font-mono">{p.cuil}</span>
                        {p.puesto && (
                          <span className="text-[11px] text-gray-500">💼 {p.puesto}</span>
                        )}
                        <span className="ml-auto flex gap-2">
                          {yaAsignada ? (
                            <span className="text-xs text-green-700 font-semibold">
                              ✓ Ya asignada
                            </span>
                          ) : (
                            (['titular', 'suplente'] as const).map((rol) => (
                              <button
                                key={rol}
                                className="btn-outline text-xs"
                                disabled={ocupado || lugaresLibres(jurado, rol) === 0}
                                onClick={() => onAgregar(p.id, rol)}
                              >
                                + {rol === 'titular' ? 'Titular' : 'Suplente'}
                              </button>
                            ))
                          )}
                        </span>
                      </div>
                    )
                  })}
                  {resultados.meta.total > resultados.data.length && (
                    <p className="px-3 py-2 text-[11px] text-gray-400">
                      Se muestran {resultados.data.length} de {resultados.meta.total}. Afiná la
                      búsqueda para encontrar a la persona.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
