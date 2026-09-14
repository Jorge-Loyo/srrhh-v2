import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { can } from '@/shared/lib/can'
import { useAuth } from '../../auth/hooks/useAuth'
import { useAuditoria, usePurgarAuditoria, type AuditoriaRow } from '../hooks/useAuditoria'

const LIMIT = 50

const ACCION_BADGE: Record<string, string> = {
  login_success: 'badge-success',
  login_fail: 'badge-danger',
  logout: 'badge-default',
  refresh: 'badge-default',
  create: 'badge-success',
  update: 'badge-warning',
  delete: 'badge-danger',
  purge: 'badge-danger',
  token_revoke: 'badge-warning',
  token_revoke_all: 'badge-danger',
  activar: 'badge-success',
  desactivar: 'badge-warning',
  aprobar: 'badge-success',
  rechazar: 'badge-danger',
  asignar: 'badge-success',
  desasignar: 'badge-warning',
  cambiar_password: 'badge-warning',
}

// Etiqueta legible + qué significa cada acción — mismo criterio que
// ACTION_INFO de la app legacy (frontend/src/pages/seguridad/AuditoriaPage.jsx),
// para que el detalle diga en criollo "qué ocurrió" en vez del código crudo.
const ACCION_LABEL: Record<string, string> = {
  login_success: 'Inicio de sesión exitoso',
  login_fail: 'Intento de inicio de sesión fallido',
  logout: 'Cierre de sesión',
  refresh: 'Renovación de sesión',
  create: 'Creación',
  update: 'Modificación',
  delete: 'Eliminación',
  purge: 'Purga de logs de auditoría',
  token_revoke: 'Revocación de una sesión',
  token_revoke_all: 'Revocación de TODAS las sesiones de un usuario',
  activar: 'Activación',
  desactivar: 'Desactivación',
  aprobar: 'Aprobación',
  rechazar: 'Rechazo',
  asignar: 'Asignación',
  desasignar: 'Desasignación',
  leer: 'Marcado como leído',
  cambiar_password: 'Cambio de contraseña',
}

// Nombre legible de la entidad (segundo segmento de /api/v1/<entidad>/...) —
// cubre los módulos con endpoints de escritura; lo que no está mapeado se
// muestra tal cual (nunca rompe, solo queda menos prolijo).
const ENTIDAD_LABEL: Record<string, string> = {
  auth: 'Autenticación',
  personas: 'Personas',
  cargos: 'Cargos',
  padron: 'Padrón',
  concursos: 'Concursos',
  'concursos-cph': 'Concursos CPH',
  'concursos-ceetps': 'Concursos CEETPS',
  hospitales: 'Hospitales',
  'codigos-registro': 'Códigos de registro',
  escalafones: 'Escalafones',
  puestos: 'Puestos',
  usuarios: 'Usuarios',
  kpis: 'KPIs',
  bajas: 'Bajas',
  'bajas-sial': 'Bajas SIAL',
  'puestos-cargo': 'Puestos de cargo',
  roles: 'Roles',
  permisos: 'Permisos',
  notificaciones: 'Notificaciones',
  autorizaciones: 'Autorizaciones',
  'solicitudes-alta': 'Solicitudes de alta',
  etiquetas: 'Etiquetas',
  'ordenes-merito': 'Órdenes de mérito',
  postulantes: 'Postulantes',
  referencias: 'Referencias',
  organigrama: 'Organigrama',
  pou: 'POU',
  dotacion: 'Dotación',
  tokens: 'Tokens',
  auditoria: 'Auditoría',
  'cadena-mando': 'Cadena de mando',
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'medium' })
}

function labelAccion(accion: string) {
  return ACCION_LABEL[accion] ?? accion
}

function labelEntidad(entidad: string) {
  return ENTIDAD_LABEL[entidad] ?? entidad
}

function statusBadgeClass(status: number) {
  if (status >= 500) return 'badge-danger'
  if (status >= 400) return 'badge-warning'
  return 'badge-success'
}

// Un volcado de JSON crudo para cualquier objeto/array anidado (ej. el
// `user` completo de un login, con 30+ permisos adentro) es ilegible y fue
// señalado como tal 2026-09-14. Ahora un objeto anidado se muestra como
// sub-tabla (recursivo, vía TablaCambios) y un array de objetos o muy largo
// se resume en cantidad — el detalle de "qué permisos tiene un rol" vive en
// la pantalla de Roles, no es lo que hace falta ver acá para entender "qué
// pasó".
const MAX_ARRAY_ITEMS_INLINE = 6

function renderValor(v: unknown) {
  if (v === null || v === undefined) return <span className="italic text-gray-400">vacío</span>
  if (typeof v === 'boolean') return <span className={v ? 'text-success' : 'text-danger'}>{v ? 'Sí' : 'No'}</span>
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="italic text-gray-400">(ninguno)</span>
    if (v.some((item) => esObjeto(item)) || v.length > MAX_ARRAY_ITEMS_INLINE) {
      return <span className="text-gray-600">{v.length} elemento{v.length === 1 ? '' : 's'}</span>
    }
    return <span className="break-all">{v.map((item) => String(item)).join(', ')}</span>
  }
  if (esObjeto(v)) {
    return (
      <div className="border border-gray-200 rounded overflow-hidden">
        <TablaCambios body={v} />
      </div>
    )
  }
  return <span className="break-all">{String(v)}</span>
}

// Cuerpo de la request (ya enmascarado en campos sensibles por el backend)
// como tabla Campo/Valor — legible en vez del JSON crudo. Si el campo ya
// viene con forma {old, new} (algún endpoint que registre el diff explícito)
// se muestra como Anterior/Nuevo, igual que hacía la pantalla legacy.
function TablaCambios({ body }: { body: Record<string, unknown> }) {
  const entradas = Object.entries(body)
  if (entradas.length === 0) return <p className="text-xs text-gray-400 italic">Sin datos enviados en el cuerpo de la solicitud.</p>
  return (
    <table className="text-xs w-full border-collapse">
      <thead>
        <tr className="bg-gray-100">
          <th className="px-2 py-1 text-left font-medium text-gray-500 border border-gray-200 w-1/4">Campo</th>
          <th className="px-2 py-1 text-left font-medium text-gray-500 border border-gray-200" colSpan={2}>Valor</th>
        </tr>
      </thead>
      <tbody>
        {entradas.map(([campo, valor]) => {
          const tieneAnteriorNuevo = !!valor && typeof valor === 'object' && !Array.isArray(valor) && ('old' in valor || 'new' in valor)
          return (
            <tr key={campo} className="border-b border-gray-100">
              <td className="px-2 py-1 font-mono text-gray-600 border border-gray-200 align-top">{campo}</td>
              {tieneAnteriorNuevo ? (
                <>
                  <td className="px-2 py-1 border border-gray-200 align-top">
                    <span className="text-xs text-gray-400">antes: </span>{renderValor((valor as { old?: unknown }).old)}
                  </td>
                  <td className="px-2 py-1 border border-gray-200 align-top">
                    <span className="text-xs text-gray-400">ahora: </span>{renderValor((valor as { new?: unknown }).new)}
                  </td>
                </>
              ) : (
                <td className="px-2 py-1 border border-gray-200 align-top" colSpan={2}>{renderValor(valor)}</td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

interface CambiosPayload {
  status?: number
  // `request`/`response`: shape actual (post 2026-09-14). `body`: shape vieja
  // (eventos registrados antes de este cambio) — se sigue leyendo para no
  // romper el detalle de auditoría histórica ya guardada.
  request?: unknown
  response?: unknown
  body?: unknown
  _truncado?: boolean
  preview?: string
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

// Un login/logout/refresh tiene AMBOS lados (lo enviado y lo devuelto) hechos
// 100% de tokens/contraseñas enmascarados — mostrar dos tablas de puro "***"
// una debajo de la otra no informa nada y visualmente parece contenido
// repetido/duplicado (reportado 2026-09-14). Si un objeto entero (recursivo)
// es "***"/vacío, no vale la pena renderizarlo.
function esTodoEnmascarado(value: unknown): boolean {
  if (value === '***') return true
  if (Array.isArray(value)) return value.every(esTodoEnmascarado)
  if (esObjeto(value)) return Object.values(value).every(esTodoEnmascarado)
  return false
}

// La respuesta de error siempre tiene esta forma (ver error.handler.ts) — acá
// vive el motivo EXACTO por el que algo no se pudo hacer (ej. "Solo se pueden
// eliminar snapshots en estado error o rechazado (estado actual: pendiente)"),
// que es justo lo que antes no se veía en absoluto.
function MotivoFalla({ response }: { response: unknown }) {
  const error = esObjeto(response) && esObjeto(response.error) ? response.error : null
  if (!error) return <p className="text-xs text-red-700 italic">La operación falló, pero no se registró el motivo.</p>
  return (
    <div className="text-xs bg-red-50 border border-red-200 rounded p-2 text-red-800">
      <p className="font-medium">{String(error.message ?? 'Error sin mensaje')}</p>
      {typeof error.code === 'string' && <p className="text-red-500 mt-0.5">Código: {error.code}</p>}
      {esObjeto(error.details) && (
        <div className="mt-1"><TablaCambios body={error.details} /></div>
      )}
    </div>
  )
}

function DetalleEvento({ row }: { row: AuditoriaRow }) {
  const cambios = row.cambios as CambiosPayload | null
  const fallo = typeof cambios?.status === 'number' && cambios.status >= 400
  // Respuesta exitosa siempre viene envuelta en `{ data: ... }` (ver rutas) —
  // se muestra ese contenido directo en vez de la envoltura.
  const resultado = esObjeto(cambios?.response) && 'data' in cambios!.response! ? (cambios!.response as { data: unknown }).data : cambios?.response
  const datosEnviados = cambios?.request ?? cambios?.body
  // Login/refresh/logout tienen ambos lados hechos 100% de tokens
  // enmascarados — sin este chequeo se renderizan dos tablas de puro "***"
  // (una para lo enviado, otra para lo devuelto) que no aportan nada y
  // visualmente parecen contenido repetido (reportado 2026-09-14).
  const hayResultado = !fallo && resultado !== undefined && !esTodoEnmascarado(resultado)
  const hayDatosEnviados = esObjeto(datosEnviados) && Object.keys(datosEnviados).length > 0 && !esTodoEnmascarado(datosEnviados)
  const soloEnmascarado = !fallo && !hayResultado && !hayDatosEnviados
    && (resultado !== undefined || (esObjeto(datosEnviados) && Object.keys(datosEnviados).length > 0))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5 text-xs">
        <div><span className="font-medium text-gray-500">Quién: </span>
          {row.username
            ? <span className="text-gray-800 font-semibold">{row.username}</span>
            : <span className="italic text-gray-400">sistema / anónimo</span>}
        </div>
        {row.rol && <div><span className="font-medium text-gray-500">Rol: </span><span className="text-gray-800">{row.rol}</span></div>}
        <div><span className="font-medium text-gray-500">Qué pasó: </span><span className="text-gray-800">{labelAccion(row.accion)}</span></div>
        <div><span className="font-medium text-gray-500">Dónde: </span><span className="text-gray-800">{labelEntidad(row.entidad)}</span></div>
        {row.entidadId && <div><span className="font-medium text-gray-500">ID registro: </span><span className="font-mono text-gray-700">{row.entidadId}</span></div>}
        {row.ip && <div><span className="font-medium text-gray-500">IP: </span><span className="font-mono text-gray-700">{row.ip}</span></div>}
        {typeof cambios?.status === 'number' && (
          <div><span className="font-medium text-gray-500">Resultado: </span>
            <span className={statusBadgeClass(cambios.status)}>{cambios.status} {fallo ? '— falló' : '— OK'}</span>
          </div>
        )}
        {row.ruta && (
          <div className="col-span-2 sm:col-span-4">
            <span className="font-medium text-gray-500">Endpoint exacto: </span>
            <span className="font-mono text-gray-700 break-all">{row.metodo && <strong>{row.metodo} </strong>}{row.ruta}</span>
          </div>
        )}
      </div>

      {cambios?._truncado ? (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">
            Contenido muy extenso, se cortó (primeros caracteres):
          </p>
          <pre className="text-xs bg-white border border-gray-200 rounded p-2 overflow-auto max-h-40 text-gray-700 whitespace-pre-wrap break-all">
            {cambios.preview}
          </pre>
        </div>
      ) : (
        <>
          {fallo && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Por qué falló:</p>
              <MotivoFalla response={cambios?.response} />
            </div>
          )}

          {hayResultado && (
            esObjeto(resultado) ? (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Qué devolvió (resultado real de la operación):</p>
                <TablaCambios body={resultado} />
              </div>
            ) : Array.isArray(resultado) ? (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Qué devolvió:</p>
                <pre className="text-xs bg-white border border-gray-200 rounded p-2 overflow-auto max-h-40 text-gray-700 whitespace-pre-wrap break-all">
                  {JSON.stringify(resultado, null, 2)}
                </pre>
              </div>
            ) : null
          )}

          {hayDatosEnviados && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Datos enviados en la solicitud:</p>
              <TablaCambios body={datosEnviados} />
            </div>
          )}

          {soloEnmascarado && (
            <p className="text-xs text-gray-400 italic">
              Esta operación solo maneja credenciales/tokens — no se muestran por seguridad.
            </p>
          )}

          {!fallo && !hayResultado && !hayDatosEnviados && !soloEnmascarado && (
            <p className="text-xs text-gray-400 italic">Este evento no tiene datos adicionales registrados.</p>
          )}
        </>
      )}
    </div>
  )
}

function FilaExpandible({ row }: { row: AuditoriaRow }) {
  const [open, setOpen] = useState(false)
  const status = (row.cambios as CambiosPayload | null)?.status
  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtFecha(row.createdAt)}</td>
        <td className="px-4 py-3 font-medium text-gray-800">
          {row.username ?? <span className="italic text-gray-400">sistema</span>}
          {row.rol && <span className="ml-1.5 text-xs text-gray-400 font-normal">({row.rol})</span>}
        </td>
        <td className="px-4 py-3">
          <span className={ACCION_BADGE[row.accion] ?? 'badge-default'} title={row.accion}>{labelAccion(row.accion)}</span>
        </td>
        <td className="px-4 py-3 text-gray-600">{labelEntidad(row.entidad)}</td>
        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{row.entidadId ?? '—'}</td>
        <td className="px-4 py-3">
          {typeof status === 'number' ? (
            <span className={statusBadgeClass(status)}>{status >= 400 ? `Falló (${status})` : 'OK'}</span>
          ) : '—'}
        </td>
        <td className="px-4 py-3 text-gray-500">{row.ip ?? '—'}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <DetalleEvento row={row} />
          </td>
        </tr>
      )}
    </>
  )
}

// Migración de la pantalla "Auditoría" del módulo Seguridad legacy. Al
// hacer click en una fila se expande el detalle legible del evento (quién,
// qué pasó, dónde, con qué datos) vía DetalleEvento/TablaCambios — mismo
// criterio que ChangesDetail de la app legacy, en vez de mostrar el JSON
// crudo de `cambios` sin procesar (gap señalado 2026-09-14: "de la app vieja
// falta la posibilidad de apretar un suceso y que te diga exactamente qué
// ocurrió y quién lo hizo").
export function AuditoriaPage() {
  const { user } = useAuth()
  const puedePargar = can(user, 'configuracion', 'purgar_auditoria')
  const [searchParams, setSearchParams] = useSearchParams()
  const [dias, setDias] = useState(180)

  const accion = searchParams.get('accion') ?? ''
  const entidad = searchParams.get('entidad') ?? ''
  const desde = searchParams.get('desde') ?? ''
  const hasta = searchParams.get('hasta') ?? ''
  const page = Number(searchParams.get('page') ?? '1')

  const entidadDebounced = useDebounce(entidad, 300)

  function setParam(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value); else next.delete(key)
      next.delete('page')
      return next
    })
  }

  function setPage(p: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (p === 1) next.delete('page'); else next.set('page', String(p))
      return next
    }, { replace: true })
  }

  const filters = {
    page, limit: LIMIT,
    ...(accion && { accion }),
    ...(entidadDebounced && { entidad: entidadDebounced }),
    ...(desde && { desde }),
    ...(hasta && { hasta }),
  }

  const { data, isLoading, isFetching, isError } = useAuditoria(filters)
  const purgar = usePurgarAuditoria()

  function handlePurgar() {
    if (!confirm(`¿Purgar todos los registros de auditoría más viejos que ${dias} días? Esta acción no se puede deshacer.`)) return
    purgar.mutate(dias, {
      onSuccess: (res) => alert(`Se purgaron ${res.purgados} registros anteriores a ${fmtFecha(res.fechaCorte)}.`),
    })
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="font-primary text-xl font-bold text-gray-900">Auditoría</h1>
          {puedePargar && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={dias}
                onChange={(e) => setDias(Number(e.target.value))}
                className="h-10 w-24 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
              />
              <span className="text-sm text-gray-500">días</span>
              <button className="btn-danger" onClick={handlePurgar} disabled={purgar.isPending}>
                {purgar.isPending ? 'Purgando...' : 'Purgar logs'}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={accion}
            onChange={(e) => setParam('accion', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          >
            <option value="">Todas las acciones</option>
            {Object.keys(ACCION_BADGE).map((a) => <option key={a} value={a}>{labelAccion(a)}</option>)}
          </select>
          <input
            type="text"
            placeholder="Entidad (ej. personas, cargos)"
            value={entidad}
            onChange={(e) => setParam('entidad', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded flex-1 min-w-[200px] focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          />
          <input
            type="date"
            value={desde}
            onChange={(e) => setParam('desde', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          />
          <input
            type="date"
            value={hasta}
            onChange={(e) => setParam('hasta', e.target.value)}
            className="h-10 px-3 border border-gray-300 rounded focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm flex-1 overflow-y-auto min-h-0">
        {isLoading && <p className="p-6 text-sm text-gray-400">Cargando auditoría...</p>}
        {isError && <p className="p-6 text-sm text-danger">No se pudo cargar el log de auditoría.</p>}

        {!isLoading && !isError && data && (
          <>
            {data.data.length === 0 && (
              <p className="p-6 text-sm text-gray-400 text-center">Sin resultados para los filtros aplicados.</p>
            )}

            {data.data.length > 0 && (
              <table className={`w-full text-sm border-separate border-spacing-0 ${isFetching ? 'opacity-60' : ''}`}>
                <thead className="bg-navy text-white text-left sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 font-semibold rounded-tl-lg">Fecha</th>
                    <th className="px-4 py-3 font-semibold">Usuario</th>
                    <th className="px-4 py-3 font-semibold">Acción</th>
                    <th className="px-4 py-3 font-semibold">Entidad</th>
                    <th className="px-4 py-3 font-semibold">ID</th>
                    <th className="px-4 py-3 font-semibold">Resultado</th>
                    <th className="px-4 py-3 font-semibold rounded-tr-lg">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.data.map((row) => <FilaExpandible key={row.id} row={row} />)}
                </tbody>
              </table>
            )}

            {data.meta.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
                <span>
                  Página {data.meta.page} de {data.meta.pages} — {data.meta.total} en total
                </span>
                <div className="flex gap-2">
                  <button className="btn-outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
                  <button className="btn-outline" disabled={page >= data.meta.pages} onClick={() => setPage(page + 1)}>Siguiente</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
