import { useState } from 'react'
import type { Usuario } from '@srrhh/types'
import { useAuth } from '../../auth/hooks/useAuth'
import { useSetUsuarioActivo, useUsuarios } from '../hooks/useUsuarios'
import { UsuarioFormModal } from '../components/UsuarioFormModal'

type ModalState = { mode: 'create' } | { mode: 'edit'; usuario: Usuario } | null

export function AdminUsuariosPage() {
  const { user: currentUser } = useAuth()
  const [modal, setModal] = useState<ModalState>(null)

  const { data: usuarios, isLoading, isError } = useUsuarios()
  const setActivo = useSetUsuarioActivo()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-primary text-2xl font-bold text-gray-900">Usuarios</h1>
        <button className="btn-primary" onClick={() => setModal({ mode: 'create' })}>
          + Nuevo usuario
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando usuarios...</p>}
        {isError && <p className="p-6 text-sm text-danger">No se pudo cargar la lista de usuarios.</p>}

        {usuarios && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Usuario</th>
                <th className="px-4 py-3 font-semibold">Nombre</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">CUIL</th>
                <th className="px-4 py-3 font-semibold">Rol</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium text-gray-800">{u.username}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {`${u.apellido ?? ''} ${u.nombre ?? ''}`.trim() || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3 text-gray-600">{u.cuil ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{u.rol}</td>
                  <td className="px-4 py-3">
                    <span className={u.activo ? 'badge-success' : 'badge-default'}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setModal({ mode: 'edit', usuario: u })}
                        className="btn-outline text-xs"
                      >
                        Editar
                      </button>
                      <button
                        disabled={setActivo.isPending || u.id === currentUser?.id}
                        title={u.id === currentUser?.id ? 'No podés desactivar tu propio usuario' : undefined}
                        onClick={() => setActivo.mutate({ id: u.id, activo: !u.activo })}
                        className={u.activo ? 'btn-danger' : 'btn-outline'}
                      >
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {usuarios.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                    No hay usuarios cargados todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <UsuarioFormModal
          mode={modal.mode}
          usuario={modal.mode === 'edit' ? modal.usuario : undefined}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
