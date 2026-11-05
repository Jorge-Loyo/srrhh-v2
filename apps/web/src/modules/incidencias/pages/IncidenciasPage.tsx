import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/hooks/useAuth'
import { can } from '@/shared/lib/can'
import { useIncidenciasResumen, useActualizarIncidencias } from '../hooks/useIncidencias'
import {
  TABS_INCIDENCIAS,
  pestanaActiva,
  type TabIncidenciasId,
} from '../lib/tabsIncidencias'
import { SialSinCargoTab } from '../components/SialSinCargoTab'
import { BajaSinConcursoTab } from '../components/BajaSinConcursoTab'
import { TodoTab } from '../components/TodoTab'
import { PestanaPersistidaTab } from '../components/PestanaPersistidaTab'
import { PanelConciliacion } from '../components/PanelConciliacion'

// Incidencias como conciliación de la dotación: pestañas Todo / SIAL sin cargo /
// Baja sin concurso, visibles para quien tenga `incidencias/ver`. Solo se monta
// la pestaña activa (cada una tiene sus propias queries).
export function IncidenciasPage() {
  const { user } = useAuth()
  const [estado, setEstado] = useState<{ tab: TabIncidenciasId | null; busquedaInicial?: string }>({
    tab: null,
  })
  const [ahora, setAhora] = useState(() => Date.now())
  const [actualizando, setActualizando] = useState(false)
  const actualizar = useActualizarIncidencias()

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])

  const activa = pestanaActiva(estado.tab)
  const { data: resumen, isError: resumenError } = useIncidenciasResumen(!!user)

  const puedeGestionar = can(user, 'incidencias', 'gestionar')
  const advertencia = resumen?.contexto.ultimoPadron?.advertenciaTamano ?? null
  const segundos = resumen ? Math.max(0, Math.round((ahora - new Date(resumen.generadoAt).getTime()) / 1000)) : null

  async function onActualizar() {
    setActualizando(true)
    try {
      await actualizar()
    } finally {
      setActualizando(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-primary text-xl font-bold text-gray-900">Incidencias</h1>
          {!!user && (
            <div className="flex items-center gap-3 text-xs text-gray-500">
              {segundos != null && <span>Datos de hace {segundos} s</span>}
              <button className="btn-outline text-xs px-2 py-1" onClick={onActualizar} disabled={actualizando}>
                {actualizando ? 'Actualizando…' : 'Actualizar'}
              </button>
            </div>
          )}
        </div>
        {!user && <p className="mt-3 text-sm text-gray-400">Cargando…</p>}
        {!!user && (
          <div role="tablist" aria-label="Incidencias" className="mt-4 border-b border-gray-200 flex gap-1">
            {TABS_INCIDENCIAS.map((t) => {
              const n = resumen?.tabs[t.id]
              const seleccionada = activa === t.id
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={seleccionada}
                  onClick={() => setEstado({ tab: t.id })}
                  className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                    seleccionada ? 'border-primary text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t.label}
                  {n != null ? (
                    <span className="text-gray-400"> ({n})</span>
                  ) : resumenError ? (
                    <span className="text-gray-400"> (—)</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {advertencia && (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          El último padrón aprobado fue marcado como posible exportación parcial: los cargos "ausentes del padrón"
          pueden ser falsos positivos.
        </div>
      )}

      {resumen && (
        <PanelConciliacion
          key={activa}
          conciliacion={resumen.conciliacion}
          abiertoInicial={activa === 'baja-sin-concurso'}
        />
      )}

      {activa === 'todo' && (
        <TodoTab
          puedeGestionar={puedeGestionar}
          onGestionar={(idSial) => setEstado({ tab: 'sial-sin-cargo', busquedaInicial: idSial })}
        />
      )}
      {activa === 'sial-sin-cargo' && <SialSinCargoTab busquedaInicial={estado.busquedaInicial} />}
      {activa === 'baja-sin-concurso' && <BajaSinConcursoTab />}
      {activa === 'cayo-del-padron' && <PestanaPersistidaTab slug="cayo-del-padron" />}
      {activa === 'cambio-situacion-revista' && <PestanaPersistidaTab slug="cambio-situacion-revista" />}
      {activa === 'cambios-del-puesto' && <PestanaPersistidaTab slug="cambios-del-puesto" />}
      {activa === 'otras' && <PestanaPersistidaTab slug="otras" />}
    </div>
  )
}
