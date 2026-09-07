import { useMemo, useState } from 'react'
import type { Role } from '@srrhh/types'
import { useAuth } from '@/modules/auth/hooks/useAuth'
import { getApiErrorMessage } from '@/shared/lib/utils'
import { useRoles, useJerarquia, useSetJerarquia } from '../hooks/useRoles'

// S13-E — Jerarquía de roles: cimientos para asignación de tareas en cascada
// (Sprint 14+). Por ahora es solo lectura/edición de la relación jefe → subordinado
// — la lógica de cascada (permisos o tareas heredadas del padre) no se construye acá.

interface NodoArbol {
  role: Role
  hijos: NodoArbol[]
}

function construirArbol(roles: Role[], padrePorSlug: Map<string, string | null>): NodoArbol[] {
  const bySlug = new Map(roles.map((r) => [r.slug, r]))
  const hijosDe = new Map<string, Role[]>()
  const raices: Role[] = []

  for (const role of roles) {
    const padreSlug = padrePorSlug.get(role.slug) ?? null
    if (padreSlug && bySlug.has(padreSlug)) {
      if (!hijosDe.has(padreSlug)) hijosDe.set(padreSlug, [])
      hijosDe.get(padreSlug)!.push(role)
    } else {
      raices.push(role)
    }
  }

  function armar(role: Role): NodoArbol {
    return { role, hijos: (hijosDe.get(role.slug) ?? []).map(armar) }
  }

  return raices.map(armar)
}

function NodoArbolView({ nodo, nivel }: { nodo: NodoArbol; nivel: number }) {
  return (
    <div style={{ marginLeft: nivel * 20 }}>
      <div className="flex items-center gap-2 py-1.5">
        {nivel > 0 && <span className="text-gray-300">└─</span>}
        <span className="text-sm font-semibold text-gray-800">{nodo.role.nombre}</span>
        <span className="text-xs text-gray-400 font-mono">{nodo.role.slug}</span>
        {!nodo.role.activo && <span className="badge-default text-[10px]">inactivo</span>}
      </div>
      {nodo.hijos.map((h) => (
        <NodoArbolView key={h.role.id} nodo={h} nivel={nivel + 1} />
      ))}
    </div>
  )
}

export function ConfiguracionJerarquiaPage() {
  const { user } = useAuth()
  const esAdmin = user?.rolSlug === 'admin'

  const { data: roles = [], isLoading: cargandoRoles } = useRoles()
  const { data: jerarquia = [], isLoading: cargandoJerarquia } = useJerarquia()
  const setJerarquia = useSetJerarquia()

  const [error, setError] = useState('')

  const padrePorSlug = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const fila of jerarquia) m.set(fila.rolHijoSlug, fila.rolPadreSlug)
    return m
  }, [jerarquia])

  const arbol = useMemo(() => construirArbol(roles, padrePorSlug), [roles, padrePorSlug])

  async function onCambiarPadre(rolHijoSlug: string, rolPadreSlug: string) {
    setError('')
    try {
      await setJerarquia.mutateAsync({
        rolHijoSlug,
        rolPadreSlug: rolPadreSlug === '' ? null : rolPadreSlug,
      })
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  const cargando = cargandoRoles || cargandoJerarquia

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-primary text-2xl font-bold text-gray-900">Jerarquía de roles</h1>
        <p className="text-sm text-gray-500 mt-1">
          Relación jefe → subordinado entre roles. Base para asignación de tareas en cascada (próximamente).
        </p>
      </div>

      {!esAdmin && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2 rounded">
          Solo el rol <strong>admin</strong> puede editar la jerarquía — podés verla, no modificarla.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-danger text-danger text-sm px-3 py-2 rounded">{error}</div>
      )}

      {cargando ? (
        <p className="text-sm text-gray-400">Cargando...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Árbol visual */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Árbol</p>
            {arbol.length === 0 ? (
              <p className="text-sm text-gray-400">No hay roles todavía.</p>
            ) : (
              arbol.map((n) => <NodoArbolView key={n.role.id} nodo={n} nivel={0} />)
            )}
          </div>

          {/* Edición: rol → padre */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide p-6 pb-3">Editar relaciones</p>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left border-y border-gray-200">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Rol</th>
                  <th className="px-4 py-2.5 font-semibold">Padre (jefe)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {roles.map((role) => {
                  const padreActual = padrePorSlug.get(role.slug) ?? ''
                  return (
                    <tr key={role.id}>
                      <td className="px-4 py-2.5 font-medium text-gray-800">{role.nombre}</td>
                      <td className="px-4 py-2.5">
                        <select
                          value={padreActual}
                          disabled={!esAdmin || setJerarquia.isPending}
                          onChange={(e) => onCambiarPadre(role.slug, e.target.value)}
                          className="h-9 min-w-[180px] px-2 border border-gray-300 rounded text-sm disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                        >
                          <option value="">— Ninguno —</option>
                          {roles
                            .filter((r) => r.slug !== role.slug)
                            .map((r) => (
                              <option key={r.slug} value={r.slug}>{r.nombre}</option>
                            ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
